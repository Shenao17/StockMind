package com.stockmind;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.User;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Correo de prueba del dueño y tolerancia a fallos del proveedor de correo. */
class PlatformEmailIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String token(User.Role role) {
        User u = createUser("u" + role.name().toLowerCase(), role);
        u.setOrganizationId(null);
        userRepository.save(u);
        return bearer(u).substring(7);
    }

    private ResultActions send(String token, Object body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post("/platform/email-test").header("Authorization", "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    @Test
    @DisplayName("El dueño envía un correo de prueba y queda auditado; el resto del equipo no puede")
    void ownerSendsTest() throws Exception {
        send(token(User.Role.PLATFORM_OWNER), Map.of("to", "Dueno@Mail.com")).andExpect(status().isOk())
            .andExpect(jsonPath("$.sent").value(true)).andExpect(jsonPath("$.to").value("dueno@mail.com"));
        assertEquals(java.util.List.of("dueno@mail.com"), emails.tests());
        assertEquals(1, jdbc.queryForList("SELECT 1 FROM audit_log WHERE action = 'EMAIL_TEST_SENT'").size());

        for (User.Role r : new User.Role[]{User.Role.PLATFORM_BILLING, User.Role.PLATFORM_SUPPORT, User.Role.PLATFORM_VIEWER}) {
            send(token(r), Map.of("to", "x@mail.com")).andExpect(status().isForbidden());
        }
        send(bearer(createUser("jefe", User.Role.ADMIN)).substring(7), Map.of("to", "x@mail.com")).andExpect(status().isForbidden());
        assertEquals(1, emails.tests().size());
    }

    @Test
    @DisplayName("Valida el destino; sin proveedor responde 409; en modo dev no envía de verdad")
    void providerStates() throws Exception {
        String owner = token(User.Role.PLATFORM_OWNER);
        send(owner, Map.of("to", "no-es-correo")).andExpect(status().isBadRequest());
        send(owner, Map.of()).andExpect(status().isBadRequest());

        emails.provider("none");
        send(owner, Map.of("to", "x@mail.com")).andExpect(status().isConflict());

        emails.provider("dev");
        send(owner, Map.of("to", "x@mail.com")).andExpect(status().isOk()).andExpect(jsonPath("$.sent").value(false));
        assertEquals(0, jdbc.queryForList("SELECT 1 FROM audit_log WHERE action = 'EMAIL_TEST_SENT'").size());
    }

    @Test
    @DisplayName("Si el proveedor falla se devuelve 502 con su motivo, sin llaves")
    void providerFailure() throws Exception {
        emails.failing(true);
        send(token(User.Role.PLATFORM_OWNER), Map.of("to", "x@mail.com")).andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.error").value(containsString("dominio sin verificar")));
    }
}
