package com.stockmind;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Subscription;
import com.stockmind.model.User;
import com.stockmind.repository.PaymentRepository;
import com.stockmind.support.IntegrationTestBase;
import com.stockmind.tenant.TenantContext;
import org.junit.jupiter.api.BeforeEach;
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
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Ficha de empresa en el panel de plataforma: datos, plan y uso, usuarios, cobros, línea de tiempo y correcciones. */
class PlatformDetailIntegrationTest extends IntegrationTestBase {

    static final String PIN = "482915";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder encoder;
    @Autowired PaymentRepository paymentRepository;

    String owner, billing, support, viewer;
    String url;

    @BeforeEach
    void team() {
        owner = platform("dueno", User.Role.PLATFORM_OWNER);
        billing = platform("cobro", User.Role.PLATFORM_BILLING);
        support = platform("soporte", User.Role.PLATFORM_SUPPORT);
        viewer = platform("lector", User.Role.PLATFORM_VIEWER);
        url = "/platform/organizations/" + org.getId();
    }

    private String platform(String name, User.Role role) {
        User u = createUser(name, role);
        u.setOrganizationId(null);
        u.setPinHash(encoder.encode(PIN));
        userRepository.save(u);
        return bearer(u).substring(7);
    }

    private ResultActions call(String method, String path, String token, Object body) throws Exception {
        var b = switch (method) {
            case "GET" -> MockMvcRequestBuilders.get(path);
            case "PATCH" -> MockMvcRequestBuilders.patch(path);
            default -> MockMvcRequestBuilders.post(path);
        };
        b = b.header("Authorization", "Bearer " + token);
        if (body != null) b = b.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(b);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private Payment payment(Organization o, Payment.Status status, String reference) {
        var plan = planRepository.findByCode("PRO").orElseThrow();
        return paymentRepository.save(Payment.builder().organizationId(o.getId()).plan(plan)
            .billingCycle(Subscription.BillingCycle.MONTHLY).reference(reference).provider("SIMULATED")
            .amountNet(119900L).ivaAmount(22781L).amountTotal(142681L).status(status)
            .expiresAt(LocalDateTime.now().plusHours(48))
            .paidAt(status == Payment.Status.PAID ? LocalDateTime.now() : null).build());
    }

    // ───────────────────────── Ficha ─────────────────────────

    @Test
    @DisplayName("La ficha trae datos, plan con uso frente a límites, usuarios, cobros y línea de tiempo")
    void detail() throws Exception {
        createUser("jefe", User.Role.ADMIN);
        User inactive = createUser("antiguo", User.Role.SELLER);
        inactive.setActive(false);
        userRepository.save(inactive);
        var cat = createCategory();
        createProduct(cat, 5, "1000");
        createProduct(cat, 5, "2000");
        payment(org, Payment.Status.PAID, "ref-paid-aaaaaaaaaaaaaaaaaaaaaaaa");
        payment(org, Payment.Status.PENDING, "ref-pend-bbbbbbbbbbbbbbbbbbbbbbbb");

        JsonNode d = read(call("GET", url + "/detail", owner, null).andExpect(status().isOk()));
        assertEquals(org.getId(), d.get("organization").get("id").asLong());
        assertEquals("BUSINESS", d.get("plan").get("planCode").asText());
        assertEquals(1, d.get("plan").get("usage").get("users").asInt(), "solo cuenta usuarios activos");
        assertEquals(2, d.get("plan").get("usage").get("products").asInt());
        assertEquals(15, d.get("plan").get("maxUsers").asInt());
        assertEquals(2, d.get("users").size(), "lista todos, también los inactivos");
        assertTrue(d.get("paymentsVisible").asBoolean());
        assertEquals(2, d.get("payments").size());
        assertTrue(StreamSupport.stream(d.get("timeline").spliterator(), false)
            .anyMatch(e -> e.get("title").asText().startsWith("Pago recibido")));
    }

    @Test
    @DisplayName("Solo cuenta lo de ESA empresa: productos y usuarios de otra no se mezclan")
    void onlyThatCompany() throws Exception {
        createProduct(createCategory(), 5, "1000");
        Organization other = createOrganization("Empresa B");
        TenantContext.set(other.getId());
        var catB = createCategory();
        createProduct(catB, 5, "1");
        createProduct(catB, 5, "2");
        createProduct(catB, 5, "3");
        TenantContext.set(org.getId());
        createUser(other, "ana", User.Role.ADMIN);

        JsonNode a = read(call("GET", url + "/detail", owner, null));
        JsonNode b = read(call("GET", "/platform/organizations/" + other.getId() + "/detail", owner, null));
        assertEquals(1, a.get("plan").get("usage").get("products").asInt());
        assertEquals(3, b.get("plan").get("usage").get("products").asInt());
        assertEquals(1, b.get("users").size());
    }

    @Test
    @DisplayName("No filtra secretos: ni hashes, ni secretos 2FA, ni la referencia del enlace de pago, ni datos de negocio")
    void noLeaks() throws Exception {
        User admin = createUser("jefe", User.Role.ADMIN);
        admin.setMfaSecret("secreto-cifrado");
        admin.setMfaEnabledAt(LocalDateTime.now());
        userRepository.save(admin);
        createProduct(createCategory(), 5, "1000");
        payment(org, Payment.Status.PENDING, "ref-secreta-cccccccccccccccccccc");

        String body = call("GET", url + "/detail", owner, null).andReturn().getResponse().getContentAsString();
        for (String forbidden : new String[]{"passwordHash", "mfaSecret", "secreto-cifrado", "pinHash",
                "ref-secreta-cccccccccccccccccccc", "\"reference\"", "SKU-", "sessionsValidFrom"}) {
            assertFalse(body.contains(forbidden), "no debe contener " + forbidden);
        }
        assertTrue(body.contains("\"mfaEnabled\":true"));
    }

    @Test
    @DisplayName("Un enlace de pago vencido se muestra como VENCIDO")
    void expiredShown() throws Exception {
        Payment p = payment(org, Payment.Status.PENDING, "ref-venc-dddddddddddddddddddddd");
        p.setExpiresAt(LocalDateTime.now().minusHours(1));
        paymentRepository.save(p);
        JsonNode d = read(call("GET", url + "/detail", owner, null));
        assertEquals("EXPIRED", d.get("payments").get(0).get("status").asText());
    }

    @Test
    @DisplayName("Soporte ve la ficha pero no los cobros (ni su rastro en la línea de tiempo); Cobranza y Consulta sí")
    void paymentsVisibilityByRole() throws Exception {
        payment(org, Payment.Status.PAID, "ref-paid-eeeeeeeeeeeeeeeeeeeeeeee");
        JsonNode s = read(call("GET", url + "/detail", support, null).andExpect(status().isOk()));
        assertFalse(s.get("paymentsVisible").asBoolean());
        assertEquals(0, s.get("payments").size());
        assertTrue(StreamSupport.stream(s.get("timeline").spliterator(), false).noneMatch(e -> "PAYMENT".equals(e.get("type").asText())));
        for (String t : new String[]{owner, billing, viewer}) {
            JsonNode d = read(call("GET", url + "/detail", t, null).andExpect(status().isOk()));
            assertTrue(d.get("paymentsVisible").asBoolean());
            assertEquals(1, d.get("payments").size());
        }
    }

    @Test
    @DisplayName("Una empresa inexistente da 404; un usuario de empresa no entra")
    void notFoundAndCompanyUser() throws Exception {
        call("GET", "/platform/organizations/999999/detail", owner, null).andExpect(status().isNotFound());
        String admin = bearer(createUser("jefe", User.Role.ADMIN)).substring(7);
        call("GET", url + "/detail", admin, null).andExpect(status().isForbidden());
    }

    // ───────────────────────── Corrección de contacto ─────────────────────────

    @Test
    @DisplayName("Soporte y dueño corrigen el contacto; Cobranza y Consulta no; queda auditado con antes y después")
    void editContact() throws Exception {
        call("PATCH", url + "/contact", billing, Map.of("phone", "3001234567")).andExpect(status().isForbidden());
        call("PATCH", url + "/contact", viewer, Map.of("phone", "3001234567")).andExpect(status().isForbidden());

        call("PATCH", url + "/contact", support, Map.of("phone", "300 123 4567", "name", "Ferretería Nueva", "contactEmail", "Nuevo@Mail.com"))
            .andExpect(status().isOk());
        Organization saved = organizationRepository.findById(org.getId()).orElseThrow();
        assertEquals("Ferretería Nueva", saved.getName());
        assertEquals("300 123 4567", saved.getPhone());
        assertEquals("nuevo@mail.com", saved.getContactEmail());

        var rows = jdbc.queryForList("SELECT actor_email, details FROM audit_log WHERE action = 'ORGANIZATION_CONTACT_UPDATED'");
        assertEquals(1, rows.size());
        String details = rows.get(0).get("details").toString();
        assertTrue(details.contains("Empresa A → Ferretería Nueva"));
        assertTrue(details.contains("soporte") || rows.get(0).get("actor_email").toString().contains("soporte"));
        call("PATCH", url + "/contact", owner, Map.of("country", "mx")).andExpect(status().isOk());
        assertEquals("MX", organizationRepository.findById(org.getId()).orElseThrow().getCountry());
    }

    @Test
    @DisplayName("El contacto se valida: teléfono, correo y nombre; sin cambios reales no guarda")
    void contactValidation() throws Exception {
        call("PATCH", url + "/contact", owner, Map.of("phone", "abc")).andExpect(status().isBadRequest());
        call("PATCH", url + "/contact", owner, Map.of("contactEmail", "no-es-correo")).andExpect(status().isBadRequest());
        call("PATCH", url + "/contact", owner, Map.of("name", "x")).andExpect(status().isBadRequest());
        call("PATCH", url + "/contact", owner, Map.of()).andExpect(status().isBadRequest());
        call("PATCH", url + "/contact", owner, Map.of("name", org.getName())).andExpect(status().isBadRequest());
        call("PATCH", "/platform/organizations/999999/contact", owner, Map.of("phone", "3001234567")).andExpect(status().isNotFound());
    }

    // ───────────────────────── NIT ─────────────────────────

    @Test
    @DisplayName("El NIT solo lo cambia el dueño con su PIN; se normaliza, no se repite y queda auditado")
    void editTaxId() throws Exception {
        Organization other = createOrganization("Empresa B");
        other.setTaxId("900111222-3");
        organizationRepository.save(other);

        call("PATCH", url + "/tax-id", support, Map.of("taxId", "900.555.666-1", "pin", PIN)).andExpect(status().isForbidden());
        call("PATCH", url + "/tax-id", billing, Map.of("taxId", "900.555.666-1", "pin", PIN)).andExpect(status().isForbidden());
        call("PATCH", url + "/tax-id", owner, Map.of("taxId", "900.555.666-1", "pin", "000000"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PIN_INVALID"));
        call("PATCH", url + "/tax-id", owner, Map.of("taxId", "900111222-3", "pin", PIN)).andExpect(status().isConflict());
        call("PATCH", url + "/tax-id", owner, Map.of("taxId", "12", "pin", PIN)).andExpect(status().isBadRequest());

        call("PATCH", url + "/tax-id", owner, Map.of("taxId", "900.555.666-1", "pin", PIN)).andExpect(status().isOk());
        assertEquals("900555666-1", organizationRepository.findById(org.getId()).orElseThrow().getTaxId());
        call("PATCH", url + "/tax-id", owner, Map.of("taxId", "900555666-1", "pin", PIN)).andExpect(status().isBadRequest());

        var rows = jdbc.queryForList("SELECT details FROM audit_log WHERE action = 'ORGANIZATION_TAX_ID_UPDATED'");
        assertEquals(1, rows.size());
        assertTrue(rows.get(0).get("details").toString().contains("900555666-1"));
        assertFalse(rows.get(0).get("details").toString().contains(PIN));
    }
}
