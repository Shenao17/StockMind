package com.stockmind;

import com.stockmind.model.Organization;
import com.stockmind.model.User;
import com.stockmind.support.IntegrationTestBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Inicio de sesión: identificador por correo, empresa en el token y estado de la empresa. */
class LoginIntegrationTest extends IntegrationTestBase {

    static final String PASSWORD = "Clave1234";

    @Autowired MockMvc mvc;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper json;

    User ana;

    @BeforeEach
    void setUp() {
        ana = createUserWithPassword(org, "ana", User.Role.ADMIN);
    }

    private User createUserWithPassword(Organization o, String username, User.Role role) {
        User u = createUser(o, username, role);
        u.setPasswordHash(encoder.encode(PASSWORD));
        return userRepository.save(u);
    }

    private ResultActions login(String identifier, String password) throws Exception {
        return mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("username", identifier, "password", password))));
    }

    @Test
    @DisplayName("Inicia sesión con el correo y el token incluye empresa, rol y correo")
    void loginByEmail() throws Exception {
        String body = login("ana@test.com", PASSWORD).andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("ADMIN")).andReturn().getResponse().getContentAsString();
        String token = json.readTree(body).get("token").asText();

        assertEquals(org.getId(), jwtConfig.extractOrganizationId(token));
        assertEquals("ADMIN", jwtConfig.extractRole(token));
        assertEquals("ana@test.com", jwtConfig.extractUsername(token));
    }

    @Test
    @DisplayName("El correo no distingue mayúsculas ni espacios alrededor")
    void emailIsNormalized() throws Exception {
        login("  ANA@Test.com ", PASSWORD).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Transición: el nombre de usuario sirve solo si identifica a una única persona")
    void usernameFallbackOnlyWhenUnique() throws Exception {
        login("ana", PASSWORD).andExpect(status().isOk());

        Organization other = createOrganization("Empresa B");
        User anaB = User.builder().organizationId(other.getId()).username("ana").email("ana@empresab.com")
            .passwordHash(encoder.encode(PASSWORD)).role(User.Role.ADMIN).active(true).build();
        userRepository.save(anaB);

        login("ana", PASSWORD).andExpect(status().isUnauthorized());           // ambiguo entre empresas
        login("ana@empresab.com", PASSWORD).andExpect(status().isOk());       // el correo siempre resuelve
    }

    @Test
    @DisplayName("Rechaza contraseña incorrecta, usuario inexistente y usuario inactivo")
    void badCredentials() throws Exception {
        login("ana@test.com", "otra-cosa").andExpect(status().isUnauthorized());
        login("nadie@test.com", PASSWORD).andExpect(status().isUnauthorized());
        ana.setActive(false);
        userRepository.save(ana);
        login("ana@test.com", PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Una empresa pendiente, suspendida o cancelada no puede iniciar sesión")
    void inactiveOrganizationCannotLogin() throws Exception {
        for (Organization.Status status : new Organization.Status[]{
                Organization.Status.PENDING, Organization.Status.SUSPENDED, Organization.Status.CANCELLED}) {
            org.setStatus(status);
            organizationRepository.save(org);
            login("ana@test.com", PASSWORD).andExpect(status().isUnauthorized());
        }
        org.setStatus(Organization.Status.ACTIVE);
        organizationRepository.save(org);
        login("ana@test.com", PASSWORD).andExpect(status().isOk());
    }

    @Test
    @DisplayName("El dueño de la plataforma inicia sesión sin empresa y su token no lleva org")
    void platformAdminLogin() throws Exception {
        createUserWithPassword(org, "dueno", User.Role.PLATFORM_ADMIN);
        String body = login("dueno@test.com", PASSWORD).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String token = json.readTree(body).get("token").asText();
        assertNull(jwtConfig.extractOrganizationId(token));
        assertEquals("PLATFORM_ADMIN", jwtConfig.extractRole(token));
    }
}
