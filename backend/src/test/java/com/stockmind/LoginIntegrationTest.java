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

import static org.hamcrest.Matchers.containsString;
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
            .content(json.writeValueAsString(Map.of("email", identifier, "password", password))));
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
    @DisplayName("El nombre de usuario ya no sirve para iniciar sesión: solo el correo")
    void usernameIsNotAnIdentifier() throws Exception {
        login("ana", PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Dos empresas pueden tener el mismo username; cada una entra con su propio correo")
    void sameUsernameDifferentOrganizations() throws Exception {
        Organization other = createOrganization("Empresa B");
        User anaB = User.builder().organizationId(other.getId()).username("ana").email("ana@empresab.com")
            .passwordHash(encoder.encode(PASSWORD)).role(User.Role.ADMIN).active(true).build();
        userRepository.save(anaB);

        for (String email : new String[]{"ana@test.com", "ana@empresab.com"}) {
            String body = login(email, PASSWORD).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            String token = json.readTree(body).get("token").asText();
            Long expectedOrg = email.equals("ana@test.com") ? org.getId() : other.getId();
            assertEquals(expectedOrg, jwtConfig.extractOrganizationId(token));
        }
    }

    @Test
    @DisplayName("La respuesta incluye correo y empresa, y no se acepta el cuerpo sin correo")
    void responseAndValidation() throws Exception {
        login("ana@test.com", PASSWORD).andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("ana@test.com"))
            .andExpect(jsonPath("$.organizationId").value(org.getId()))
            .andExpect(jsonPath("$.username").value("ana"));
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"ana\",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isBadRequest());
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
    @DisplayName("Los avisos de cuenta solo se muestran con la contraseña correcta (no se averigua qué correos existen)")
    void accountNoticesRequireTheRightPassword() throws Exception {
        ana.setActive(false);
        userRepository.save(ana);
        // contraseña incorrecta en un usuario inactivo: mensaje genérico, igual que si no existiera
        login("ana@test.com", "otra-cosa").andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Credenciales inválidas"));
        login("nadie@test.com", "otra-cosa").andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value("Credenciales inválidas"));
        // con la contraseña correcta sí se informa
        login("ana@test.com", PASSWORD).andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error").value(containsString("inactivo")));
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
    @DisplayName("El equipo de plataforma no recibe sesión solo con la contraseña: recibe un desafío (el token real se prueba en PlatformTeamIntegrationTest)")
    void platformUserGetsChallengeNotSession() throws Exception {
        createUserWithPassword(org, "dueno", User.Role.PLATFORM_OWNER);
        String body = login("dueno@test.com", PASSWORD).andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        assertFalse(json.readTree(body).hasNonNull("token"));
        assertTrue(json.readTree(body).get("enrollmentRequired").asBoolean());
    }
}
