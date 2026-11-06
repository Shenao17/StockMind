package com.stockmind;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformSecurityService;
import com.stockmind.platform.TotpService;
import com.stockmind.repository.PlatformBackupCodeRepository;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Equipo de plataforma: roles y permisos, verificación en dos pasos (TOTP + PIN) y gestión del equipo. */
class PlatformTeamIntegrationTest extends IntegrationTestBase {

    static final String PASSWORD = "Clave1234";
    static final String PIN = "482915";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder encoder;
    @Autowired TotpService totp;
    @Autowired PlatformBackupCodeRepository backupCodes;

    // ───────────────────────── Ayudas ─────────────────────────

    private User platformUser(String username, User.Role role) {
        User u = createUser(username, role);
        u.setOrganizationId(null);
        u.setPasswordHash(encoder.encode(PASSWORD));
        return userRepository.save(u);
    }

    private ResultActions post(String url, Object body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(url)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private JsonNode login(User u) throws Exception {
        return read(post("/auth/login", Map.of("email", u.getEmail(), "password", PASSWORD)).andExpect(status().isOk()));
    }

    /** Primer acceso completo: contraseña → configurar app + PIN → sesión. Devuelve la respuesta final. */
    private JsonNode enroll(User u) throws Exception {
        JsonNode first = login(u);
        assertTrue(first.get("enrollmentRequired").asBoolean());
        String challenge = first.get("challengeToken").asText();
        JsonNode start = read(post("/auth/mfa/enroll/start", Map.of("challengeToken", challenge)).andExpect(status().isOk()));
        String secret = start.get("secret").asText();
        Map<String, Object> finish = new java.util.HashMap<>(Map.of("challengeToken", challenge,
            "code", totp.currentCode(secret), "pin", PIN));
        if (Boolean.TRUE.equals(userRepository.findById(u.getId()).orElseThrow().getMustChangePassword())) {
            finish.put("newPassword", "NuevaClave99");
        }
        return read(post("/auth/mfa/enroll/finish", finish).andExpect(status().isOk()));
    }

    private String secretOf(User u) {
        // el secreto está cifrado en la base: se descifra con el mismo componente que usa el servicio
        return mfaCrypto.decrypt(userRepository.findById(u.getId()).orElseThrow().getMfaSecret());
    }

    @Autowired com.stockmind.platform.MfaCrypto mfaCrypto;

    /** Cuenta ya configurada (2FA + PIN) con sesión lista: devuelve el token de acceso. */
    private String readySession(String username, User.Role role) throws Exception {
        User u = platformUser(username, role);
        return enroll(u).get("token").asText();
    }

    private ResultActions get(String url, String token) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.get(url)
            .header("Authorization", "Bearer " + token));
    }

    private ResultActions postAs(String token, String url, Object body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(url)
            .header("Authorization", "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    // ───────────────────────── Verificación en dos pasos ─────────────────────────

    @Test
    @DisplayName("Con contraseña correcta, un usuario de plataforma NO recibe sesión: recibe un desafío")
    void passwordAloneIsNotEnough() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        JsonNode r = login(u);
        assertTrue(r.get("enrollmentRequired").asBoolean());
        assertTrue(r.get("token") == null || r.get("token").isNull());
        assertNotNull(r.get("challengeToken"));
    }

    @Test
    @DisplayName("El desafío no sirve como sesión: no abre ninguna API")
    void challengeIsNotASession() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        String challenge = login(u).get("challengeToken").asText();
        get("/platform/organizations", challenge).andExpect(status().isForbidden());
        get("/platform/team", challenge).andExpect(status().isForbidden());
        get("/products", challenge).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Primer acceso: configura la app y el PIN, recibe 8 códigos de respaldo y sesión de plataforma")
    void firstAccess() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        JsonNode done = enroll(u);

        assertEquals(8, done.get("backupCodes").size());
        String token = done.get("token").asText();
        assertEquals("PLATFORM_OWNER", jwtConfig.extractRole(token));
        assertNull(jwtConfig.extractOrganizationId(token));

        User saved = userRepository.findById(u.getId()).orElseThrow();
        assertNotNull(saved.getMfaEnabledAt());
        assertNotEquals(secretOf(u), saved.getMfaSecret(), "el secreto TOTP no debe guardarse en claro");
        assertTrue(saved.getPinHash().startsWith("$2"), "el PIN se guarda con hash");
        assertEquals(8, backupCodes.countByUserIdAndUsedAtIsNull(u.getId()));
        get("/platform/organizations", token).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Configurar con código malo o PIN inválido falla y no activa nada")
    void enrollmentValidation() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        String challenge = login(u).get("challengeToken").asText();
        String secret = read(post("/auth/mfa/enroll/start", Map.of("challengeToken", challenge))).get("secret").asText();

        post("/auth/mfa/enroll/finish", Map.of("challengeToken", challenge, "code", "000000", "pin", PIN))
            .andExpect(status().isUnauthorized());
        post("/auth/mfa/enroll/finish", Map.of("challengeToken", challenge, "code", totp.currentCode(secret), "pin", "1234"))
            .andExpect(status().isBadRequest());
        assertNull(userRepository.findById(u.getId()).orElseThrow().getMfaEnabledAt());
    }

    @Test
    @DisplayName("Segundo inicio de sesión: pide el código; uno malo falla, el bueno entra y no se puede reutilizar")
    void secondLogin() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        enroll(u);
        // El código del primer acceso ya se consumió; se prueba con el del paso siguiente (tolerancia ±1)
        String secret = secretOf(u);
        long next = totp.currentStep() + 1;
        // Se fija un último paso anterior para poder probar el flujo sin esperar 30 s
        User saved = userRepository.findById(u.getId()).orElseThrow();
        saved.setMfaLastStep(next - 2);
        userRepository.save(saved);

        JsonNode second = login(u);
        assertTrue(second.get("mfaRequired").asBoolean());
        String challenge = second.get("challengeToken").asText();

        post("/auth/mfa/verify", Map.of("challengeToken", challenge, "code", "123456")).andExpect(status().isUnauthorized());
        JsonNode ok = read(post("/auth/mfa/verify", Map.of("challengeToken", challenge, "code", totp.currentCode(secret)))
            .andExpect(status().isOk()));
        assertNotNull(ok.get("token"));
        // el mismo código no vale dos veces
        post("/auth/mfa/verify", Map.of("challengeToken", challenge, "code", totp.currentCode(secret)))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Un código de respaldo entra una vez y queda consumido")
    void backupCodeSingleUse() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        JsonNode done = enroll(u);
        String backup = done.get("backupCodes").get(0).asText();

        String c1 = login(u).get("challengeToken").asText();
        post("/auth/mfa/verify", Map.of("challengeToken", c1, "code", backup)).andExpect(status().isOk());
        String c2 = login(u).get("challengeToken").asText();
        post("/auth/mfa/verify", Map.of("challengeToken", c2, "code", backup)).andExpect(status().isUnauthorized());
        assertEquals(7, backupCodes.countByUserIdAndUsedAtIsNull(u.getId()));
    }

    @Test
    @DisplayName("Tras 5 códigos incorrectos seguidos la verificación se bloquea, incluso con el código bueno")
    void lockout() throws Exception {
        User u = platformUser("dueno", User.Role.PLATFORM_OWNER);
        enroll(u);
        String secret = secretOf(u);
        String challenge = login(u).get("challengeToken").asText();
        for (int i = 0; i < PlatformSecurityService.MAX_ATTEMPTS; i++) {
            post("/auth/mfa/verify", Map.of("challengeToken", challenge, "code", "00000" + i)).andExpect(status().isUnauthorized());
        }
        post("/auth/mfa/verify", Map.of("challengeToken", challenge, "code", totp.currentCode(secret)))
            .andExpect(status().isUnauthorized());
        assertNotNull(userRepository.findById(u.getId()).orElseThrow().getMfaLockedUntil());
    }

    @Test
    @DisplayName("Un token de desafío vencido o manipulado se rechaza")
    void badChallenge() throws Exception {
        post("/auth/mfa/verify", Map.of("challengeToken", "basura", "code", "123456")).andExpect(status().isUnauthorized());
        // un token de sesión normal tampoco sirve como desafío
        String session = bearer(createUser("ana", User.Role.ADMIN)).substring(7);
        post("/auth/mfa/verify", Map.of("challengeToken", session, "code", "123456")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("/auth/me: el equipo de plataforma obtiene su perfil con sus permisos; el desafío 2FA no sirve")
    void meReturnsPermissions() throws Exception {
        User u = platformUser("soporte", User.Role.PLATFORM_SUPPORT);
        u.setFullName("Ana Soporte");
        userRepository.save(u);
        JsonNode done = enroll(u);
        String token = done.get("token").asText();
        JsonNode me = read(get("/auth/me", token).andExpect(status().isOk()));
        assertEquals("PLATFORM_SUPPORT", me.get("role").asText());
        assertEquals("Ana Soporte", me.get("fullName").asText());
        assertEquals(java.util.List.of("ORG_REACTIVATE", "ORG_VIEW", "TRIAL_EXTEND"),
            java.util.stream.StreamSupport.stream(me.get("permissions").spliterator(), false).map(JsonNode::asText).toList());

        String challenge = login(platformUser("otro", User.Role.PLATFORM_VIEWER)).get("challengeToken").asText();
        get("/auth/me", challenge).andExpect(status().isForbidden());
        get("/auth/me", bearer(createUser("ana", User.Role.ADMIN)).substring(7)).andExpect(status().isOk());
    }

    // ───────────────────────── Permisos por rol ─────────────────────────

    @Test
    @DisplayName("Matriz de permisos: cada rol hace solo lo suyo")
    void permissionMatrix() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        String billing = readySession("cobro", User.Role.PLATFORM_BILLING);
        String support = readySession("soporte", User.Role.PLATFORM_SUPPORT);
        String viewer = readySession("lector", User.Role.PLATFORM_VIEWER);
        String orgId = org.getId().toString();
        String base = "/platform/organizations/" + orgId;

        // ver: todos
        for (String t : new String[]{owner, billing, support, viewer}) {
            get("/platform/organizations", t).andExpect(status().isOk());
        }
        // suspender (sensible): solo el dueño
        postAs(billing, base + "/suspend", Map.of()).andExpect(status().isForbidden());
        postAs(support, base + "/suspend", Map.of()).andExpect(status().isForbidden());
        postAs(viewer, base + "/suspend", Map.of()).andExpect(status().isForbidden());
        postAs(owner, base + "/suspend", Map.of()).andExpect(status().isOk());
        // reactivar: dueño, cobranza y soporte; consulta no
        postAs(viewer, base + "/reactivate", Map.of()).andExpect(status().isForbidden());
        postAs(support, base + "/reactivate", Map.of()).andExpect(status().isOk());
        // cancelar, plan y pago manual: solo el dueño
        postAs(billing, base + "/cancel", Map.of()).andExpect(status().isForbidden());
        postAs(billing, base + "/plan", Map.of("planCode", "PRO")).andExpect(status().isForbidden());
        postAs(billing, base + "/manual-payment", Map.of("planCode", "PRO", "billingCycle", "MONTHLY")).andExpect(status().isForbidden());
        // equipo: solo el dueño
        for (String t : new String[]{billing, support, viewer}) {
            get("/platform/team", t).andExpect(status().isForbidden());
        }
        get("/platform/team", owner).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Extender la prueba: soporte hasta 7 días; más solo el dueño")
    void trialExtensionLimit() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        String support = readySession("soporte", User.Role.PLATFORM_SUPPORT);
        setSubscription(org.getId(), "PRO", com.stockmind.model.Subscription.Status.TRIAL);
        var s = subscriptionRepository.findByOrganizationId(org.getId()).orElseThrow();
        s.setTrialEndsAt(LocalDateTime.now().plusDays(3));
        subscriptionRepository.save(s);
        String url = "/platform/organizations/" + org.getId() + "/extend-trial";

        postAs(support, url, Map.of("days", 8)).andExpect(status().isForbidden());
        postAs(support, url, Map.of("days", 5)).andExpect(status().isOk());
        postAs(owner, url, Map.of("days", 30)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Un administrador de empresa no entra al panel ni al equipo; un token de plataforma no toca datos de negocio")
    void companyAdminIsKeptOut() throws Exception {
        String admin = bearer(createUser("jefe", User.Role.ADMIN)).substring(7);
        get("/platform/organizations", admin).andExpect(status().isForbidden());
        get("/platform/team", admin).andExpect(status().isForbidden());
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        get("/products", owner).andExpect(status().isForbidden());
    }

    // ───────────────────────── Gestión del equipo ─────────────────────────

    @Test
    @DisplayName("El dueño crea un miembro con su PIN; recibe una contraseña temporal una sola vez")
    void ownerCreatesMember() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        Map<String, Object> body = Map.of("fullName", "Ana Soporte", "email", "Ana.Soporte@Mail.com",
            "role", "PLATFORM_SUPPORT", "pin", PIN);

        postAs(owner, "/platform/team", Map.of("fullName", "X", "email", "x@mail.com", "role", "PLATFORM_SUPPORT", "pin", "999999"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PIN_INVALID"));
        JsonNode created = read(postAs(owner, "/platform/team", body).andExpect(status().isCreated()));
        String temp = created.get("temporaryPassword").asText();
        assertTrue(temp.matches(com.stockmind.dto.UserDTO.PASSWORD_REGEX));
        assertEquals("ana.soporte@mail.com", created.get("member").get("email").asText());
        assertTrue(created.get("member").get("mustChangePassword").asBoolean());
        assertFalse(created.get("member").get("mfaEnabled").asBoolean());

        // listado: no expone secretos ni la contraseña
        String list = get("/platform/team", owner).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertFalse(list.contains(temp));
        assertFalse(list.contains("passwordHash"));
        assertFalse(list.contains("mfaSecret"));
        assertFalse(list.contains("pinHash"));

        // duplicado y roles no permitidos
        postAs(owner, "/platform/team", body).andExpect(status().isConflict());
        postAs(owner, "/platform/team", Map.of("fullName", "Y", "email", "y@mail.com", "role", "PLATFORM_OWNER", "pin", PIN))
            .andExpect(status().isBadRequest());
        postAs(owner, "/platform/team", Map.of("fullName", "Y", "email", "y@mail.com", "role", "ADMIN", "pin", PIN))
            .andExpect(status().isBadRequest());

        // el nuevo miembro entra con la temporal y está obligado a cambiarla al configurar el 2FA
        User member = userRepository.findByEmail("ana.soporte@mail.com").orElseThrow();
        JsonNode first = read(post("/auth/login", Map.of("email", member.getEmail(), "password", temp)).andExpect(status().isOk()));
        assertTrue(first.get("mustChangePassword").asBoolean());
        String challenge = first.get("challengeToken").asText();
        String secret = read(post("/auth/mfa/enroll/start", Map.of("challengeToken", challenge))).get("secret").asText();
        // sin contraseña nueva no termina
        post("/auth/mfa/enroll/finish", Map.of("challengeToken", challenge, "code", totp.currentCode(secret), "pin", PIN))
            .andExpect(status().isBadRequest());
        post("/auth/mfa/enroll/finish", Map.of("challengeToken", challenge, "code", totp.currentCode(secret), "pin", PIN,
            "newPassword", temp)).andExpect(status().isBadRequest());
        post("/auth/mfa/enroll/finish", Map.of("challengeToken", challenge, "code", totp.currentCode(secret), "pin", PIN,
            "newPassword", "OtraClave77")).andExpect(status().isOk());
        post("/auth/login", Map.of("email", member.getEmail(), "password", temp)).andExpect(status().isUnauthorized());
        assertFalse(userRepository.findById(member.getId()).orElseThrow().getMustChangePassword());
    }

    @Test
    @DisplayName("Desactivar a un miembro le quita la sesión en la siguiente petición")
    void deactivateRevokesSession() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        User member = platformUser("soporte", User.Role.PLATFORM_SUPPORT);
        String session = enroll(member).get("token").asText();
        get("/platform/organizations", session).andExpect(status().isOk());

        postAs(owner, "/platform/team", Map.of()).andExpect(status().isBadRequest());
        mvc.perform(patch("/platform/team/" + member.getId()).header("Authorization", "Bearer " + owner)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("active", false, "pin", PIN))))
            .andExpect(status().isOk());

        get("/platform/organizations", session).andExpect(status().isForbidden());
        post("/auth/login", Map.of("email", member.getEmail(), "password", PASSWORD)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Cambiar el rol tiene efecto inmediato y las sesiones anteriores al cambio dejan de valer")
    void roleChangeAndSessionRevocation() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        User member = platformUser("cobro", User.Role.PLATFORM_BILLING);
        String session = enroll(member).get("token").asText();
        get("/platform/organizations", session).andExpect(status().isOk());

        mvc.perform(patch("/platform/team/" + member.getId()).header("Authorization", "Bearer " + owner)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("role", "PLATFORM_VIEWER", "pin", PIN))))
            .andExpect(status().isOk());
        // el token seguía diciendo BILLING: ya no coincide con el rol en la base
        get("/platform/organizations", session).andExpect(status().isForbidden());

        // un token emitido antes de "sesiones válidas desde" se rechaza
        User fresh = userRepository.findById(member.getId()).orElseThrow();
        String viewerToken = jwtConfig.generateToken(fresh);
        get("/platform/organizations", viewerToken).andExpect(status().isOk());
        fresh.setSessionsValidFrom(LocalDateTime.now().plusMinutes(5));
        userRepository.save(fresh);
        get("/platform/organizations", viewerToken).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Reiniciar el acceso borra 2FA y PIN, da una contraseña temporal y cierra las sesiones")
    void resetAccess() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        User member = platformUser("soporte", User.Role.PLATFORM_SUPPORT);
        enroll(member);

        String path = "/platform/team/" + member.getId() + "/reset-access";
        postAs(owner, path, Map.of("pin", "000000")).andExpect(status().isForbidden());
        JsonNode r = read(postAs(owner, path, Map.of("pin", PIN)).andExpect(status().isOk()));
        String temp = r.get("temporaryPassword").asText();

        User saved = userRepository.findById(member.getId()).orElseThrow();
        assertNull(saved.getMfaSecret());
        assertNull(saved.getMfaEnabledAt());
        assertNull(saved.getPinHash());
        assertTrue(saved.getMustChangePassword());
        assertEquals(0, backupCodes.countByUserIdAndUsedAtIsNull(member.getId()));
        JsonNode again = read(post("/auth/login", Map.of("email", member.getEmail(), "password", temp)).andExpect(status().isOk()));
        assertTrue(again.get("enrollmentRequired").asBoolean());
    }

    @Test
    @DisplayName("El dueño no puede modificarse a sí mismo ni a otro dueño; un miembro desconocido da 404")
    void protectedTargets() throws Exception {
        User ownerUser = platformUser("dueno", User.Role.PLATFORM_OWNER);
        String owner = enroll(ownerUser).get("token").asText();
        User otherOwner = platformUser("dueno2", User.Role.PLATFORM_OWNER);

        for (Long id : new Long[]{ownerUser.getId(), otherOwner.getId()}) {
            mvc.perform(patch("/platform/team/" + id).header("Authorization", "Bearer " + owner)
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("active", false, "pin", PIN))))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(patch("/platform/team/999999").header("Authorization", "Bearer " + owner)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("active", false, "pin", PIN))))
            .andExpect(status().isNotFound());
        // un usuario de empresa no es miembro del equipo
        User ana = createUser("ana", User.Role.ADMIN);
        mvc.perform(patch("/platform/team/" + ana.getId()).header("Authorization", "Bearer " + owner)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("active", false, "pin", PIN))))
            .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Tras 5 PIN incorrectos el PIN se bloquea, incluso con el correcto")
    void pinLockout() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        Map<String, Object> bad = Map.of("fullName", "X", "email", "x@mail.com", "role", "PLATFORM_VIEWER", "pin", "111111");
        for (int i = 0; i < PlatformSecurityService.MAX_ATTEMPTS; i++) {
            postAs(owner, "/platform/team", bad).andExpect(status().isForbidden());
        }
        postAs(owner, "/platform/team", Map.of("fullName", "X", "email", "x@mail.com", "role", "PLATFORM_VIEWER", "pin", PIN))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Las acciones del equipo quedan en la auditoría sin guardar secretos")
    void auditTrail() throws Exception {
        String owner = readySession("dueno", User.Role.PLATFORM_OWNER);
        JsonNode created = read(postAs(owner, "/platform/team",
            Map.of("fullName", "Ana", "email", "ana@mail.com", "role", "PLATFORM_VIEWER", "pin", PIN)).andExpect(status().isCreated()));
        var rows = jdbc.queryForList("SELECT actor_email, action, details FROM audit_log WHERE action = 'TEAM_MEMBER_CREATED'");
        assertEquals(1, rows.size());
        String all = rows.toString();
        assertFalse(all.contains(created.get("temporaryPassword").asText()));
        assertFalse(all.contains(PIN));
    }
}
