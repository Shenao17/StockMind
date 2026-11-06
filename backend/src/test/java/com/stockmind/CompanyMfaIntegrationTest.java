package com.stockmind;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.Organization;
import com.stockmind.model.User;
import com.stockmind.platform.TotpService;
import com.stockmind.platform.MfaCrypto;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Verificación en dos pasos de los usuarios de empresa: opcional, exigible por el admin y reiniciable. */
class CompanyMfaIntegrationTest extends IntegrationTestBase {

    static final String PASSWORD = "Clave1234";
    static final String PIN = "482915";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder encoder;
    @Autowired TotpService totp;
    @Autowired MfaCrypto crypto;

    User admin, seller;

    @BeforeEach
    void users() {
        admin = withPassword(createUser("jefe", User.Role.ADMIN));
        seller = withPassword(createUser("vendedor", User.Role.SELLER));
    }

    private User withPassword(User u) {
        u.setPasswordHash(encoder.encode(PASSWORD));
        return userRepository.save(u);
    }

    // ───────────────────────── Ayudas ─────────────────────────

    private ResultActions call(String method, String url, String token, Object body) throws Exception {
        var b = switch (method) {
            case "GET" -> MockMvcRequestBuilders.get(url);
            case "PUT" -> MockMvcRequestBuilders.put(url);
            default -> MockMvcRequestBuilders.post(url);
        };
        if (token != null) b = b.header("Authorization", "Bearer " + token);
        if (body != null) b = b.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(b);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private String token(User u) {
        return bearer(u).substring(7);
    }

    private JsonNode login(User u) throws Exception {
        return read(call("POST", "/auth/login", null, Map.of("email", u.getEmail(), "password", PASSWORD)).andExpect(status().isOk()));
    }

    private String secretOf(User u) {
        return crypto.decrypt(userRepository.findById(u.getId()).orElseThrow().getMfaSecret());
    }

    /** Activa el 2FA del usuario por el perfil. Devuelve los códigos de respaldo. */
    private JsonNode enable(User u) throws Exception {
        JsonNode start = read(call("POST", "/auth/mfa/self/setup/start", token(u), Map.of("password", PASSWORD)).andExpect(status().isOk()));
        JsonNode done = read(call("POST", "/auth/mfa/self/setup/finish", token(u),
            Map.of("code", totp.currentCode(start.get("secret").asText()))).andExpect(status().isOk()));
        // el código ya se consumió: se retrasa el último paso para poder entrar enseguida con el siguiente
        User saved = userRepository.findById(u.getId()).orElseThrow();
        saved.setMfaLastStep(totp.currentStep() - 2);
        userRepository.save(saved);
        return done;
    }

    // ───────────────────────── Activar desde el perfil ─────────────────────────

    @Test
    @DisplayName("Sin 2FA el inicio de sesión no cambia: entra directo con sesión")
    void withoutMfaNothingChanges() throws Exception {
        JsonNode r = login(seller);
        assertNotNull(r.get("token"));
        assertTrue(r.get("challengeToken") == null || r.get("challengeToken").isNull());
        JsonNode st = read(call("GET", "/auth/mfa/self/status", token(seller), null).andExpect(status().isOk()));
        assertFalse(st.get("enabled").asBoolean());
        assertFalse(st.get("requiredByCompany").asBoolean());
    }

    @Test
    @DisplayName("Activar pide la contraseña actual; con el primer código queda activo y entrega 8 códigos de respaldo")
    void enableFromProfile() throws Exception {
        call("POST", "/auth/mfa/self/setup/start", token(seller), Map.of("password", "mala")).andExpect(status().isBadRequest());

        JsonNode start = read(call("POST", "/auth/mfa/self/setup/start", token(seller), Map.of("password", PASSWORD)).andExpect(status().isOk()));
        assertTrue(start.get("secret").asText().matches("[A-Z2-7]{32}"));
        assertTrue(start.get("otpauthUri").asText().startsWith("otpauth://totp/StockMind:"));
        // todavía no está activo: con solo iniciar no cambia nada
        assertFalse(read(call("GET", "/auth/mfa/self/status", token(seller), null)).get("enabled").asBoolean());
        assertNotNull(login(seller).get("token"));

        call("POST", "/auth/mfa/self/setup/finish", token(seller), Map.of("code", "000000")).andExpect(status().isUnauthorized());
        JsonNode done = read(call("POST", "/auth/mfa/self/setup/finish", token(seller),
            Map.of("code", totp.currentCode(start.get("secret").asText()))).andExpect(status().isOk()));
        assertEquals(8, done.get("backupCodes").size());

        User saved = userRepository.findById(seller.getId()).orElseThrow();
        assertNotNull(saved.getMfaEnabledAt());
        assertNull(saved.getPinHash(), "los usuarios de empresa no usan PIN");
        assertNotEquals(start.get("secret").asText(), saved.getMfaSecret(), "el secreto se guarda cifrado");
        JsonNode st = read(call("GET", "/auth/mfa/self/status", token(seller), null));
        assertTrue(st.get("enabled").asBoolean());
        assertTrue(st.get("canDisable").asBoolean());
        assertEquals(8, st.get("backupCodesLeft").asInt());
        // no se puede volver a iniciar la configuración con el 2FA activo
        call("POST", "/auth/mfa/self/setup/start", token(seller), Map.of("password", PASSWORD)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Con el 2FA activo, el login pide el código y solo entonces entrega la sesión de la empresa")
    void loginWithMfa() throws Exception {
        enable(seller);

        JsonNode first = login(seller);
        assertTrue(first.get("mfaRequired").asBoolean());
        assertFalse(first.get("pinRequired").asBoolean());
        assertTrue(first.get("token") == null || first.get("token").isNull());
        String challenge = first.get("challengeToken").asText();

        // el desafío no abre ninguna API de empresa
        call("GET", "/products", challenge, null).andExpect(status().isForbidden());
        call("POST", "/auth/mfa/verify", null, Map.of("challengeToken", challenge, "code", "123456")).andExpect(status().isUnauthorized());
        JsonNode ok = read(call("POST", "/auth/mfa/verify", null,
            Map.of("challengeToken", challenge, "code", totp.currentCode(secretOf(seller)))).andExpect(status().isOk()));
        String session = ok.get("token").asText();
        assertEquals("SELLER", jwtConfig.extractRole(session));
        assertEquals(org.getId(), jwtConfig.extractOrganizationId(session));
        call("GET", "/products", session, null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Si la empresa se suspende entre la contraseña y el código, no se abre sesión")
    void suspendedBetweenSteps() throws Exception {
        enable(seller);
        String challenge = login(seller).get("challengeToken").asText();
        org.setStatus(Organization.Status.SUSPENDED);
        organizationRepository.save(org);
        call("POST", "/auth/mfa/verify", null, Map.of("challengeToken", challenge, "code", totp.currentCode(secretOf(seller))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Desactivar exige contraseña y un código; después el login vuelve a ser directo")
    void disable() throws Exception {
        enable(seller);
        String code = totp.currentCode(secretOf(seller));
        call("POST", "/auth/mfa/self/disable", token(seller), Map.of("password", "mala", "code", code)).andExpect(status().isBadRequest());
        call("POST", "/auth/mfa/self/disable", token(seller), Map.of("password", PASSWORD, "code", "000000")).andExpect(status().isUnauthorized());
        call("POST", "/auth/mfa/self/disable", token(seller), Map.of("password", PASSWORD, "code", code)).andExpect(status().isOk());

        User saved = userRepository.findById(seller.getId()).orElseThrow();
        assertNull(saved.getMfaEnabledAt());
        assertNull(saved.getMfaSecret());
        assertNotNull(login(seller).get("token"));
    }

    // ───────────────────────── Política de la empresa ─────────────────────────

    @Test
    @DisplayName("Solo el admin exige el 2FA; con la política activa, quien no lo tiene lo configura al entrar (sin PIN)")
    void companyPolicy() throws Exception {
        call("PUT", "/users/mfa-policy", token(seller), Map.of("required", true)).andExpect(status().isForbidden());
        call("PUT", "/users/mfa-policy", token(admin), Map.of("required", true)).andExpect(status().isOk());
        assertTrue(read(call("GET", "/users/mfa-policy", token(admin), null)).get("required").asBoolean());

        JsonNode first = login(seller);
        assertTrue(first.get("enrollmentRequired").asBoolean());
        assertFalse(first.get("pinRequired").asBoolean());
        assertFalse(first.get("mustChangePassword").asBoolean());
        assertTrue(first.get("token") == null || first.get("token").isNull());

        String challenge = first.get("challengeToken").asText();
        String secret = read(call("POST", "/auth/mfa/enroll/start", null, Map.of("challengeToken", challenge)).andExpect(status().isOk())).get("secret").asText();
        // sin PIN ni contraseña nueva: solo el código
        JsonNode done = read(call("POST", "/auth/mfa/enroll/finish", null,
            Map.of("challengeToken", challenge, "code", totp.currentCode(secret))).andExpect(status().isOk()));
        assertEquals(8, done.get("backupCodes").size());
        assertEquals("SELLER", jwtConfig.extractRole(done.get("token").asText()));
        assertNull(userRepository.findById(seller.getId()).orElseThrow().getPinHash());

        // la empresa la exige: nadie puede desactivarla
        JsonNode st = read(call("GET", "/auth/mfa/self/status", token(seller), null));
        assertTrue(st.get("requiredByCompany").asBoolean());
        assertFalse(st.get("canDisable").asBoolean());
        call("POST", "/auth/mfa/self/disable", token(seller), Map.of("password", PASSWORD, "code", "123456")).andExpect(status().isBadRequest());

        // quitar la política deja el 2FA ya configurado (opcional) y el login sigue pidiendo código
        call("PUT", "/users/mfa-policy", token(admin), Map.of("required", false)).andExpect(status().isOk());
        assertTrue(login(seller).get("mfaRequired").asBoolean());
    }

    @Test
    @DisplayName("La política de una empresa no afecta a otra")
    void policyIsPerCompany() throws Exception {
        Organization other = createOrganization("Empresa B");
        User otherUser = withPassword(createUser(other, "ana", User.Role.SELLER));
        call("PUT", "/users/mfa-policy", token(admin), Map.of("required", true)).andExpect(status().isOk());
        assertNotNull(login(otherUser).get("token"));
        assertFalse(organizationRepository.findById(other.getId()).orElseThrow().getRequireMfa());
    }

    // ───────────────────────── Reinicio ─────────────────────────

    @Test
    @DisplayName("El admin reinicia el 2FA de un compañero; no el propio ni el de otra empresa; un vendedor no puede")
    void adminResetsTeammate() throws Exception {
        enable(seller);
        call("POST", "/users/" + seller.getId() + "/reset-mfa", token(seller), null).andExpect(status().isForbidden());
        call("POST", "/users/" + admin.getId() + "/reset-mfa", token(admin), null).andExpect(status().isBadRequest());

        Organization other = createOrganization("Empresa B");
        User foreign = createUser(other, "ana", User.Role.SELLER);
        call("POST", "/users/" + foreign.getId() + "/reset-mfa", token(admin), null).andExpect(status().isNotFound());

        call("POST", "/users/" + seller.getId() + "/reset-mfa", token(admin), null).andExpect(status().isOk());
        User saved = userRepository.findById(seller.getId()).orElseThrow();
        assertNull(saved.getMfaEnabledAt());
        assertNull(saved.getMfaSecret());
        assertNotNull(login(seller).get("token"));
        assertEquals(1, jdbc.queryForList("SELECT 1 FROM audit_log WHERE action = 'MFA_RESET_BY_ADMIN'").size());
    }

    @Test
    @DisplayName("El dueño de la plataforma reinicia el 2FA de un usuario de empresa con su PIN; soporte no")
    void platformOwnerResets() throws Exception {
        enable(admin);
        User owner = createUser("dueno", User.Role.PLATFORM_OWNER);
        owner.setOrganizationId(null);
        owner.setPinHash(encoder.encode(PIN));
        userRepository.save(owner);
        User support = createUser("soporte", User.Role.PLATFORM_SUPPORT);
        support.setOrganizationId(null);
        userRepository.save(support);

        String url = "/platform/organizations/" + org.getId() + "/users/" + admin.getId() + "/reset-mfa";
        call("POST", url, token(support), Map.of("pin", PIN)).andExpect(status().isForbidden());
        call("POST", url, token(owner), Map.of("pin", "000000")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PIN_INVALID"));
        call("POST", url, token(owner), Map.of("pin", PIN)).andExpect(status().isOk());

        assertNull(userRepository.findById(admin.getId()).orElseThrow().getMfaEnabledAt());
        assertEquals(1, jdbc.queryForList("SELECT 1 FROM audit_log WHERE action = 'COMPANY_USER_MFA_RESET'").size());

        // un usuario de otra empresa no se alcanza por el id de esta
        Organization other = createOrganization("Empresa B");
        User foreign = createUser(other, "ana", User.Role.SELLER);
        call("POST", "/platform/organizations/" + org.getId() + "/users/" + foreign.getId() + "/reset-mfa", token(owner), Map.of("pin", PIN))
            .andExpect(status().isNotFound());
    }

    // ───────────────────────── Fugas y roles ─────────────────────────

    @Test
    @DisplayName("El listado de usuarios muestra si tienen 2FA, pero nunca secretos, hashes ni contadores internos")
    void usersListDoesNotLeak() throws Exception {
        enable(seller);
        String body = call("GET", "/users", token(admin), null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(body.contains("mfaEnabledAt"));
        for (String secret : new String[]{"mfaSecret", "mfaLastStep", "mfaFailedAttempts", "mfaLockedUntil", "pinHash",
                "pinFailedAttempts", "pinLockedUntil", "sessionsValidFrom", "passwordHash"}) {
            assertFalse(body.contains(secret), "no debe filtrar " + secret);
        }
    }

    @Test
    @DisplayName("Las rutas de autoservicio son solo para usuarios de empresa; el equipo de plataforma no las usa")
    void selfServiceIsForCompanyUsers() throws Exception {
        User owner = createUser("dueno", User.Role.PLATFORM_OWNER);
        owner.setOrganizationId(null);
        userRepository.save(owner);
        call("GET", "/auth/mfa/self/status", token(owner), null).andExpect(status().isForbidden());
        call("GET", "/auth/mfa/self/status", null, null).andExpect(status().isForbidden());
    }
}
