package com.stockmind;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.EmailVerificationToken;
import com.stockmind.model.Organization;
import com.stockmind.model.User;
import com.stockmind.repository.EmailVerificationTokenRepository;
import com.stockmind.support.IntegrationTestBase;
import com.stockmind.model.Subscription;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Autoregistro, verificación de correo y alta desde el panel de plataforma. */
class RegistrationIntegrationTest extends IntegrationTestBase {

    static final String PASSWORD = "Clave1234";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EmailVerificationTokenRepository tokenRepository;

    // ───────────────────────────── Helpers ─────────────────────────────

    private Map<String, Object> company(String tax, String email) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("companyName", "Ferretería El Tornillo");
        m.put("taxId", tax);
        m.put("adminEmail", email);
        m.put("password", PASSWORD);
        return m;
    }

    private Map<String, Object> signup(String tax, String email) {
        Map<String, Object> m = company(tax, email);
        m.put("acceptTerms", true);
        return m;
    }

    private ResultActions post(String path, Object body) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.post(path)
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    private ResultActions login(String email) throws Exception {
        return post("/auth/login", Map.of("email", email, "password", PASSWORD));
    }

    private Organization orgByTax(String tax) {
        return organizationRepository.findByTaxId(tax).orElseThrow();
    }

    // ───────────────────────────── Autoregistro ─────────────────────────────

    @Test
    @DisplayName("Autoregistro: crea la empresa PENDING y su administrador sin verificar, y envía el correo")
    void selfSignupCreatesPendingOrganization() throws Exception {
        post("/public/registrations", signup("900123456-7", "Gerente@Tornillo.com"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.id").doesNotExist())            // no se filtran datos internos
            .andExpect(jsonPath("$.message").exists());

        Organization o = orgByTax("900123456-7");
        assertEquals(Organization.Status.PENDING, o.getStatus());
        assertEquals(Organization.Origin.SELF_SIGNUP, o.getOrigin());
        assertEquals("CO", o.getCountry());
        assertNotNull(o.getTermsAcceptedAt());
        assertNull(o.getTrialEndsAt(), "la prueba empieza al verificar el correo");

        User admin = userRepository.findByEmail("gerente@tornillo.com").orElseThrow();   // correo en minúsculas
        assertEquals(User.Role.ADMIN, admin.getRole());
        assertEquals(o.getId(), admin.getOrganizationId());
        assertNull(admin.getEmailVerifiedAt());
        assertEquals("gerente", admin.getUsername());
        assertNotEquals(PASSWORD, admin.getPasswordHash());

        assertEquals(1, emails.all().size());
        assertEquals("gerente@tornillo.com", emails.last().to());
        assertTrue(emails.last().url().contains("/verify-email?token="));
    }

    @Test
    @DisplayName("El NIT se normaliza: puntos y espacios no crean empresas distintas")
    void taxIdIsNormalized() throws Exception {
        post("/public/registrations", signup("900.123.456-7", "a@tornillo.com")).andExpect(status().isAccepted());
        assertTrue(organizationRepository.findByTaxId("900123456-7").isPresent());
        post("/public/registrations", signup("900123456-7", "b@tornillo.com")).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Validaciones: campos obligatorios, términos, NIT, correo y contraseña")
    void validation() throws Exception {
        post("/public/registrations", Map.of()).andExpect(status().isBadRequest());

        Map<String, Object> noTerms = signup("900111222-3", "x@tornillo.com");
        noTerms.put("acceptTerms", false);
        post("/public/registrations", noTerms).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("términos")));

        Map<String, Object> badTax = signup("12", "x@tornillo.com");
        post("/public/registrations", badTax).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("NIT")));

        Map<String, Object> badEmail = signup("900111222-3", "no-es-correo");
        post("/public/registrations", badEmail).andExpect(status().isBadRequest());

        Map<String, Object> weak = signup("900111222-3", "x@tornillo.com");
        weak.put("password", "abc");
        post("/public/registrations", weak).andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("contraseña")));

        Map<String, Object> badPhone = signup("900111222-3", "x@tornillo.com");
        badPhone.put("phone", "abc");
        post("/public/registrations", badPhone).andExpect(status().isBadRequest());

        assertEquals(0, organizationRepository.count() - 1);   // solo la empresa A del test
        assertTrue(emails.all().isEmpty());
    }

    @Test
    @DisplayName("Duplicados: mensaje genérico (no revela si chocó el correo o el NIT) y no queda nada a medias")
    void duplicatesGetGenericConflict() throws Exception {
        post("/public/registrations", signup("900123456-7", "uno@tornillo.com")).andExpect(status().isAccepted());
        long orgs = organizationRepository.count();
        long users = userRepository.count();

        // mismo NIT, correo distinto
        String byTax = post("/public/registrations", signup("900123456-7", "otro@tornillo.com"))
            .andExpect(status().isConflict()).andReturn().getResponse().getContentAsString();
        // mismo correo, NIT distinto
        String byEmail = post("/public/registrations", signup("900999888-1", "uno@tornillo.com"))
            .andExpect(status().isConflict()).andReturn().getResponse().getContentAsString();

        assertEquals(json.readTree(byTax).get("error").asText(), json.readTree(byEmail).get("error").asText());
        assertEquals(orgs, organizationRepository.count());
        assertEquals(users, userRepository.count());
    }

    @Test
    @DisplayName("Una empresa con correo de un usuario existente de OTRA empresa también se rechaza")
    void emailAlreadyUsedByAnotherOrganization() throws Exception {
        createUser("existente", User.Role.ADMIN);   // existente@test.com en la Empresa A
        post("/public/registrations", signup("900123456-7", "existente@test.com")).andExpect(status().isConflict());
    }

    // ───────────────────────────── Suscripción ─────────────────────────────

    private Subscription subOf(String tax) {
        return subscriptionRepository.findByOrganizationId(orgByTax(tax).getId()).orElseThrow();
    }

    @Test
    @DisplayName("Autoregistro: queda en prueba pero sin reloj hasta verificar el correo; plan por defecto Pro")
    void selfSignupCreatesTrialSubscription() throws Exception {
        post("/public/registrations", signup("900123456-7", "g@tornillo.com")).andExpect(status().isAccepted());
        Subscription s = subOf("900123456-7");
        assertEquals(Subscription.Status.TRIAL, s.getStatus());
        assertEquals("PRO", s.getPlan().getCode());
        assertNull(s.getTrialEndsAt());

        post("/public/verify-email", Map.of("token", emails.last().token())).andExpect(status().isOk());
        s = subOf("900123456-7");
        assertTrue(s.getTrialEndsAt().isAfter(LocalDateTime.now().plusDays(13)));
        assertTrue(s.getTrialEndsAt().isBefore(LocalDateTime.now().plusDays(15)));
    }

    @Test
    @DisplayName("Autoregistro: se puede elegir el plan; uno inexistente se rechaza sin crear nada")
    void selfSignupWithPlan() throws Exception {
        Map<String, Object> starter = signup("900123456-7", "g@tornillo.com");
        starter.put("planCode", "starter");
        post("/public/registrations", starter).andExpect(status().isAccepted());
        assertEquals("STARTER", subOf("900123456-7").getPlan().getCode());

        long orgs = organizationRepository.count();
        Map<String, Object> bad = signup("900555666-7", "h@tornillo.com");
        bad.put("planCode", "GRATIS");
        post("/public/registrations", bad).andExpect(status().isBadRequest());
        assertEquals(orgs, organizationRepository.count());
    }

    @Test
    @DisplayName("Alta por plataforma: prueba desde hoy, pago ya recibido o cortesía")
    void platformCreationModes() throws Exception {
        String owner = bearer(createUser("dueno", User.Role.PLATFORM_ADMIN));
        String[][] cases = {{"TRIAL", "901111111-1", "t@c.com"}, {"PAID", "902222222-2", "p@c.com"}, {"COMPLIMENTARY", "903333333-3", "c@c.com"}};
        for (String[] c : cases) {
            Map<String, Object> body = company(c[1], c[2]);
            body.put("mode", c[0]);
            body.put("planCode", "BUSINESS");
            mvc.perform(MockMvcRequestBuilders.post("/platform/organizations").header("Authorization", owner)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.subscription.planCode").value("BUSINESS"));
        }
        Subscription trial = subOf("901111111-1");
        assertEquals(Subscription.Status.TRIAL, trial.getStatus());
        assertTrue(trial.getTrialEndsAt().isAfter(LocalDateTime.now().plusDays(13)));

        Subscription paid = subOf("902222222-2");
        assertEquals(Subscription.Status.ACTIVE, paid.getStatus());
        assertNotNull(paid.getCurrentPeriodEnd());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM payments WHERE provider = 'MANUAL' AND organization_id = ?",
            Integer.class, orgByTax("902222222-2").getId()));

        Subscription comp = subOf("903333333-3");
        assertTrue(comp.getComplimentary());
        assertEquals(Subscription.Status.ACTIVE, comp.getStatus());
    }

    // ───────────────────────────── Verificación ─────────────────────────────

    @Test
    @DisplayName("Hasta verificar el correo no se puede iniciar sesión; después sí, y la prueba gratis empieza")
    void verificationActivatesOrganization() throws Exception {
        post("/public/registrations", signup("900123456-7", "gerente@tornillo.com")).andExpect(status().isAccepted());

        login("gerente@tornillo.com").andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error", containsString("verificar tu correo")));

        post("/public/verify-email", Map.of("token", emails.last().token())).andExpect(status().isOk());

        Organization o = orgByTax("900123456-7");
        assertEquals(Organization.Status.ACTIVE, o.getStatus());
        assertNotNull(o.getTrialEndsAt());
        assertTrue(o.getTrialEndsAt().isAfter(LocalDateTime.now().plusDays(13)));
        assertTrue(o.getTrialEndsAt().isBefore(LocalDateTime.now().plusDays(15)));
        assertNotNull(userRepository.findByEmail("gerente@tornillo.com").orElseThrow().getEmailVerifiedAt());

        login("gerente@tornillo.com").andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
    }

    @Test
    @DisplayName("El token es de un solo uso; uno inventado o vencido recibe el mismo error")
    void tokenIsSingleUseAndOpaque() throws Exception {
        post("/public/registrations", signup("900123456-7", "gerente@tornillo.com")).andExpect(status().isAccepted());
        String token = emails.last().token();

        post("/public/verify-email", Map.of("token", token)).andExpect(status().isOk());
        String reused = post("/public/verify-email", Map.of("token", token))
            .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        String invented = post("/public/verify-email", Map.of("token", "inventado-inventado"))
            .andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        assertEquals(json.readTree(reused).get("error").asText(), json.readTree(invented).get("error").asText());

        // vencido
        post("/public/registrations", signup("900555666-7", "otra@tornillo.com")).andExpect(status().isAccepted());
        EmailVerificationToken stored = tokenRepository.findAll().stream()
            .filter(t -> t.getUsedAt() == null).findFirst().orElseThrow();
        stored.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        tokenRepository.save(stored);
        post("/public/verify-email", Map.of("token", emails.last().token())).andExpect(status().isBadRequest());
        assertEquals(Organization.Status.PENDING, orgByTax("900555666-7").getStatus());
    }

    @Test
    @DisplayName("Solo se guarda el hash del token, nunca el token real")
    void onlyTheHashIsStored() throws Exception {
        post("/public/registrations", signup("900123456-7", "gerente@tornillo.com")).andExpect(status().isAccepted());
        String raw = emails.last().token();
        EmailVerificationToken stored = tokenRepository.findAll().get(0);
        assertNotEquals(raw, stored.getTokenHash());
        assertEquals(64, stored.getTokenHash().length());
        assertTrue(raw.length() >= 40, "el token debe ser largo y aleatorio");
    }

    @Test
    @DisplayName("Reenvío: respuesta idéntica exista o no el correo; invalida el enlace anterior")
    void resend() throws Exception {
        post("/public/registrations", signup("900123456-7", "gerente@tornillo.com")).andExpect(status().isAccepted());
        String first = emails.last().token();

        // correo inexistente: misma respuesta, sin correo
        post("/public/resend-verification", Map.of("email", "nadie@tornillo.com")).andExpect(status().isAccepted());
        assertEquals(1, emails.all().size());

        // dentro del minuto de espera: no se reenvía
        post("/public/resend-verification", Map.of("email", "gerente@tornillo.com")).andExpect(status().isAccepted());
        assertEquals(1, emails.all().size());

        // pasado el minuto: se emite uno nuevo y el anterior deja de servir
        tokenRepository.findAll().forEach(t -> {
            jdbc.update("UPDATE email_verification_tokens SET created_at = ? WHERE id = ?",
                LocalDateTime.now().minusMinutes(5), t.getId());
        });
        post("/public/resend-verification", Map.of("email", "gerente@tornillo.com")).andExpect(status().isAccepted());
        assertEquals(2, emails.all().size());
        post("/public/verify-email", Map.of("token", first)).andExpect(status().isBadRequest());
        post("/public/verify-email", Map.of("token", emails.last().token())).andExpect(status().isOk());

        // ya verificado: no se vuelve a enviar nada
        post("/public/resend-verification", Map.of("email", "gerente@tornillo.com")).andExpect(status().isAccepted());
        assertEquals(2, emails.all().size());
    }

    @Test
    @DisplayName("Las rutas públicas no exigen sesión, pero el resto del backend sigue protegido")
    void publicRoutesOnly() throws Exception {
        mvc.perform(get("/products")).andExpect(status().isForbidden());
        mvc.perform(get("/platform/organizations")).andExpect(status().isForbidden());
    }

    // ───────────────────────────── Panel de plataforma ─────────────────────────────

    @Test
    @DisplayName("Plataforma: solo PLATFORM_ADMIN puede crear y listar empresas")
    void platformEndpointsAreRestricted() throws Exception {
        String admin = bearer(createUser("adminA", User.Role.ADMIN));
        String seller = bearer(createUser("vendedorA", User.Role.SELLER));
        for (String auth : new String[]{admin, seller}) {
            mvc.perform(get("/platform/organizations").header("Authorization", auth)).andExpect(status().isForbidden());
            mvc.perform(MockMvcRequestBuilders.post("/platform/organizations")
                .header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(company("900123456-7", "x@x.com")))).andExpect(status().isForbidden());
        }
    }

    @Test
    @DisplayName("Plataforma: crea la empresa ACTIVE con su administrador ya verificado, que puede entrar de inmediato")
    void platformCreatesActiveOrganization() throws Exception {
        String owner = bearer(createUser("dueno", User.Role.PLATFORM_ADMIN));
        Map<String, Object> body = company("901.222.333-4", "dueno@cliente.com");
        body.put("phone", "+57 300 123 4567");
        body.put("legalName", "Cliente S.A.S.");
        body.put("contactEmail", "contacto@cliente.com");

        mvc.perform(MockMvcRequestBuilders.post("/platform/organizations")
                .header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("ACTIVE"))
            .andExpect(jsonPath("$.origin").value("PLATFORM_ADMIN"))
            .andExpect(jsonPath("$.taxId").value("901222333-4"))
            .andExpect(jsonPath("$.contactEmail").value("contacto@cliente.com"));

        assertTrue(emails.all().isEmpty(), "el alta manual no requiere verificar el correo");
        User admin = userRepository.findByEmail("dueno@cliente.com").orElseThrow();
        assertNotNull(admin.getEmailVerifiedAt());
        login("dueno@cliente.com").andExpect(status().isOk());
    }

    @Test
    @DisplayName("Plataforma: los conflictos sí indican qué chocó")
    void platformConflictsAreSpecific() throws Exception {
        String owner = bearer(createUser("dueno", User.Role.PLATFORM_ADMIN));
        createUser("existente", User.Role.ADMIN);

        mvc.perform(MockMvcRequestBuilders.post("/platform/organizations")
                .header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(company("900123456-7", "existente@test.com"))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.error", containsString("correo")));

        mvc.perform(MockMvcRequestBuilders.post("/platform/organizations")
                .header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(company("900123456-7", "uno@cliente.com")))).andExpect(status().isCreated());
        mvc.perform(MockMvcRequestBuilders.post("/platform/organizations")
                .header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(company("900123456-7", "dos@cliente.com"))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.error", containsString("NIT")));
    }

    @Test
    @DisplayName("Plataforma: listado paginado con búsqueda y filtro por estado")
    void platformListsOrganizations() throws Exception {
        String owner = bearer(createUser("dueno", User.Role.PLATFORM_ADMIN));
        post("/public/registrations", signup("900111111-1", "p@pendiente.com")).andExpect(status().isAccepted());

        mvc.perform(get("/platform/organizations?page=0&size=10").header("Authorization", owner)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)); // A + pendiente
        mvc.perform(get("/platform/organizations?status=PENDING").header("Authorization", owner))
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].taxId").value("900111111-1"));
        mvc.perform(get("/platform/organizations?search=empresa a").header("Authorization", owner))
            .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/platform/organizations?sort=passwordHash").header("Authorization", owner))
            .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Dos empresas registradas no ven los datos de la otra")
    void newOrganizationsStartIsolatedAndEmpty() throws Exception {
        String owner = bearer(createUser("dueno", User.Role.PLATFORM_ADMIN));
        mvc.perform(MockMvcRequestBuilders.post("/platform/organizations")
                .header("Authorization", owner).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(company("900123456-7", "nuevo@cliente.com")))).andExpect(status().isCreated());

        createProduct(createCategory(), 5, "10.00");   // dato de la Empresa A
        String token = json.readTree(login("nuevo@cliente.com").andReturn().getResponse().getContentAsString()).get("token").asText();
        mvc.perform(get("/products").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }
}
