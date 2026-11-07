package com.stockmind;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.Organization;
import com.stockmind.model.Subscription;
import com.stockmind.model.User;
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

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Solicitudes con aprobación del dueño y editor de planes. */
class PlatformRequestsIntegrationTest extends IntegrationTestBase {

    static final String PIN = "482915";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PasswordEncoder encoder;

    String owner, billing, support, support2, viewer;
    Organization target;

    @BeforeEach
    void team() {
        owner = platform("dueno", User.Role.PLATFORM_OWNER);
        billing = platform("cobro", User.Role.PLATFORM_BILLING);
        support = platform("soporte", User.Role.PLATFORM_SUPPORT);
        support2 = platform("soporte2", User.Role.PLATFORM_SUPPORT);
        viewer = platform("lector", User.Role.PLATFORM_VIEWER);
        target = createOrganization("Ferretería Alfa");
        setSubscription(target.getId(), "PRO", Subscription.Status.ACTIVE);
    }

    /** Los planes son datos de referencia compartidos por todas las pruebas: se dejan como estaban. */
    @org.junit.jupiter.api.AfterEach
    void restorePlans() {
        restore("STARTER", "Starter", 59900, 599000, 2, 300, true, java.util.Set.of());
        restore("PRO", "Pro", 119900, 1199000, 5, 3000, true, java.util.Set.of("REPORTS", "PREDICTIONS", "EXPORT"));
    }

    private void restore(String code, String name, long monthly, long yearly, int users, int products, boolean active, java.util.Set<String> features) {
        var p = planRepository.findByCode(code).orElseThrow();
        p.setName(name); p.setPriceMonthly(monthly); p.setPriceYearly(yearly); p.setMaxUsers(users);
        p.setMaxProducts(products); p.setExtraUserPrice(15000L); p.setActive(active);
        p.getFeatures().clear();
        p.getFeatures().addAll(features);
        planRepository.save(p);
        entitlements.evictAll();
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
            case "PUT" -> MockMvcRequestBuilders.put(path);
            default -> MockMvcRequestBuilders.post(path);
        };
        b = b.header("Authorization", "Bearer " + token);
        if (body != null) b = b.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        return mvc.perform(b);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private long request(String token, String type, Map<String, Object> params) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("type", type);
        body.put("organizationId", target.getId());
        body.put("reason", "El cliente lo pidió por teléfono y confirmó su identidad");
        if (params != null) body.put("params", params);
        return read(call("POST", "/platform/requests", token, body).andExpect(status().isCreated())).get("id").asLong();
    }

    private ResultActions approve(long id, String token, String pin) throws Exception {
        return call("POST", "/platform/requests/" + id + "/approve", token, Map.of("pin", pin));
    }

    private Subscription sub() {
        return subscriptionRepository.findByOrganizationId(target.getId()).orElseThrow();
    }

    // ───────────────────────── Crear ─────────────────────────

    @Test
    @DisplayName("Soporte y Cobranza piden con motivo; Consulta no; el motivo, el tipo y los parámetros se validan")
    void create() throws Exception {
        long id = request(support, "SUSPEND", null);
        assertTrue(id > 0);
        request(billing, "CANCEL", null);

        Map<String, Object> noReason = Map.of("type", "SUSPEND", "organizationId", target.getId(), "reason", "corto");
        call("POST", "/platform/requests", support2, noReason).andExpect(status().isBadRequest());
        call("POST", "/platform/requests", viewer, Map.of("type", "SUSPEND", "organizationId", target.getId(), "reason", "motivo suficientemente largo"))
            .andExpect(status().isForbidden());
        call("POST", "/platform/requests", support2, Map.of("type", "SUSPEND", "organizationId", 999999, "reason", "motivo suficientemente largo"))
            .andExpect(status().isNotFound());
        call("POST", "/platform/requests", support2, Map.of("type", "BORRAR_TODO", "organizationId", target.getId(), "reason", "motivo suficientemente largo"))
            .andExpect(status().isBadRequest());
        // ya hay una pendiente del mismo tipo para esa empresa
        call("POST", "/platform/requests", support2, Map.of("type", "SUSPEND", "organizationId", target.getId(), "reason", "otra vez lo mismo, por favor"))
            .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Los parámetros se validan por tipo: plan, ciclo, días y NIT")
    void paramsValidation() throws Exception {
        String reason = "motivo suficientemente largo";
        java.util.function.BiFunction<String, Map<String, Object>, ResultActions> req = (type, params) -> {
            try {
                Map<String, Object> b = new HashMap<>(Map.of("type", type, "organizationId", target.getId(), "reason", reason));
                if (params != null) b.put("params", params);
                return call("POST", "/platform/requests", support, b);
            } catch (Exception e) { throw new RuntimeException(e); }
        };
        req.apply("CHANGE_PLAN", Map.of("planCode", "NOEXISTE")).andExpect(status().isBadRequest());
        req.apply("CHANGE_PLAN", null).andExpect(status().isBadRequest());
        req.apply("CHANGE_PLAN", Map.of("planCode", "STARTER", "billingCycle", "WEEKLY")).andExpect(status().isBadRequest());
        req.apply("MANUAL_PAYMENT", Map.of("planCode", "NOEXISTE")).andExpect(status().isBadRequest());
        req.apply("EXTEND_TRIAL", Map.of("days", 0)).andExpect(status().isBadRequest());
        req.apply("EXTEND_TRIAL", Map.of("days", 91)).andExpect(status().isBadRequest());
        req.apply("EXTEND_TRIAL", Map.of("days", "muchos")).andExpect(status().isBadRequest());
        req.apply("CHANGE_TAX_ID", Map.of("taxId", "12")).andExpect(status().isBadRequest());
        Organization other = createOrganization("Otra");
        other.setTaxId("900111222-3");
        organizationRepository.save(other);
        req.apply("CHANGE_TAX_ID", Map.of("taxId", "900.111.222-3")).andExpect(status().isConflict());
        req.apply("EXTEND_TRIAL", Map.of("days", 30, "hack", "x")).andExpect(status().isCreated());
        // los parámetros desconocidos no se guardan
        JsonNode row = read(call("GET", "/platform/requests", support, null)).get("content").get(0);
        assertFalse(row.get("params").has("hack"));
        assertEquals(30, row.get("params").get("days").asInt());
    }

    // ───────────────────────── Ver ─────────────────────────

    @Test
    @DisplayName("El dueño ve todas las solicitudes; cada miembro solo las suyas; Consulta no entra")
    void visibility() throws Exception {
        request(support, "SUSPEND", null);
        request(billing, "CANCEL", null);

        assertEquals(2, read(call("GET", "/platform/requests", owner, null).andExpect(status().isOk())).get("totalElements").asInt());
        JsonNode mine = read(call("GET", "/platform/requests", support, null));
        assertEquals(1, mine.get("totalElements").asInt());
        assertEquals("soporte@test.com", mine.get("content").get(0).get("requestedBy").asText());
        assertEquals(0, read(call("GET", "/platform/requests", support2, null)).get("totalElements").asInt());
        call("GET", "/platform/requests", viewer, null).andExpect(status().isForbidden());
        call("GET", "/platform/requests", bearer(createUser("jefe", User.Role.ADMIN)).substring(7), null).andExpect(status().isForbidden());

        assertEquals(1, read(call("GET", "/platform/requests?type=CANCEL", owner, null)).get("totalElements").asInt());
        assertEquals(2, read(call("GET", "/platform/requests?status=PENDING&organizationId=" + target.getId(), owner, null)).get("totalElements").asInt());
        assertEquals("Ferretería Alfa", read(call("GET", "/platform/requests", owner, null)).get("content").get(0).get("organizationName").asText());
        call("GET", "/platform/requests?status=RARO", owner, null).andExpect(status().isBadRequest());
    }

    // ───────────────────────── Aprobar ─────────────────────────

    @Test
    @DisplayName("Aprobar exige el PIN del dueño: con uno malo no pasa nada; con el bueno se ejecuta y queda auditado con quién pidió")
    void approveSuspend() throws Exception {
        long id = request(support, "SUSPEND", null);

        approve(id, owner, "000000").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PIN_INVALID"));
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
        assertEquals("PENDING", read(call("GET", "/platform/requests", owner, null)).get("content").get(0).get("status").asText());

        approve(id, support, PIN).andExpect(status().isForbidden());      // no es el dueño
        approve(id, billing, PIN).andExpect(status().isForbidden());

        JsonNode done = read(approve(id, owner, PIN).andExpect(status().isOk()));
        assertEquals("APPROVED", done.get("status").asText());
        assertEquals("dueno@test.com", done.get("decidedBy").asText());
        assertEquals(Subscription.Status.SUSPENDED, sub().getStatus());

        var rows = jdbc.queryForList("SELECT actor_email, details FROM audit_log WHERE action = 'ORGANIZATION_SUSPENDED'");
        assertEquals(1, rows.size());
        assertEquals("dueno@test.com", rows.get(0).get("actor_email"));
        assertTrue(rows.get(0).get("details").toString().contains("solicitud #" + id + " de soporte@test.com"));
        assertEquals(1, jdbc.queryForList("SELECT 1 FROM audit_log WHERE action = 'REQUEST_APPROVED'").size());

        approve(id, owner, PIN).andExpect(status().isConflict());         // ya resuelta
    }

    @Test
    @DisplayName("Cada tipo se ejecuta al aprobarse: cancelar, cambiar plan, pago manual, extender prueba larga y corregir NIT")
    void approveEachType() throws Exception {
        approve(request(support, "CHANGE_PLAN", Map.of("planCode", "STARTER", "billingCycle", "YEARLY")), owner, PIN).andExpect(status().isOk());
        assertEquals("STARTER", sub().getPlan().getCode());
        assertEquals(Subscription.BillingCycle.YEARLY, sub().getBillingCycle());

        approve(request(billing, "MANUAL_PAYMENT", Map.of("planCode", "PRO", "billingCycle", "MONTHLY")), owner, PIN).andExpect(status().isOk());
        assertEquals(1, jdbc.queryForList("SELECT 1 FROM payments WHERE provider = 'MANUAL' AND status = 'PAID' AND organization_id = ?", target.getId()).size());
        assertEquals("PRO", sub().getPlan().getCode());

        approve(request(support, "CHANGE_TAX_ID", Map.of("taxId", "900.555.666-1")), owner, PIN).andExpect(status().isOk());
        assertEquals("900555666-1", organizationRepository.findById(target.getId()).orElseThrow().getTaxId());

        setSubscription(target.getId(), "PRO", Subscription.Status.TRIAL);
        var s = sub();
        s.setTrialEndsAt(LocalDateTime.now().plusDays(2));
        subscriptionRepository.save(s);
        approve(request(support, "EXTEND_TRIAL", Map.of("days", 30)), owner, PIN).andExpect(status().isOk());
        assertTrue(sub().getTrialEndsAt().isAfter(LocalDateTime.now().plusDays(28)), "más de los 7 días que Soporte puede extender solo");

        approve(request(billing, "CANCEL", null), owner, PIN).andExpect(status().isOk());
        assertEquals(Subscription.Status.CANCELLED, sub().getStatus());
    }

    @Test
    @DisplayName("Si la acción falla al ejecutarse (p. ej. el NIT ya lo tomó otra empresa) la solicitud sigue pendiente")
    void failedExecutionStaysPending() throws Exception {
        long id = request(support, "CHANGE_TAX_ID", Map.of("taxId", "900555666-1"));
        Organization other = createOrganization("Otra");
        other.setTaxId("900555666-1");
        organizationRepository.save(other);

        approve(id, owner, PIN).andExpect(status().isConflict());
        assertEquals("PENDING", read(call("GET", "/platform/requests", owner, null)).get("content").get(0).get("status").asText());
        assertNull(organizationRepository.findById(target.getId()).orElseThrow().getTaxId());
    }

    // ───────────────────────── Rechazar, cancelar, vencer ─────────────────────────

    @Test
    @DisplayName("Rechazar exige un motivo, no ejecuta nada y quien pidió ve la nota")
    void reject() throws Exception {
        long id = request(support, "CANCEL", null);
        call("POST", "/platform/requests/" + id + "/reject", owner, Map.of("note", "ab")).andExpect(status().isBadRequest());
        call("POST", "/platform/requests/" + id + "/reject", support, Map.of("note", "no tengo permiso")).andExpect(status().isForbidden());

        call("POST", "/platform/requests/" + id + "/reject", owner, Map.of("note", "El cliente aún tiene saldo a favor")).andExpect(status().isOk());
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
        JsonNode mine = read(call("GET", "/platform/requests", support, null)).get("content").get(0);
        assertEquals("REJECTED", mine.get("status").asText());
        assertEquals("El cliente aún tiene saldo a favor", mine.get("decisionNote").asText());
        approve(id, owner, PIN).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Solo quien la pidió la cancela, mientras esté pendiente; la de otro se comporta como inexistente")
    void cancel() throws Exception {
        long id = request(support, "SUSPEND", null);
        call("POST", "/platform/requests/" + id + "/cancel", support2, null).andExpect(status().isNotFound());
        call("POST", "/platform/requests/" + id + "/cancel", viewer, null).andExpect(status().isForbidden());
        call("POST", "/platform/requests/" + id + "/cancel", support, null).andExpect(status().isOk());
        approve(id, owner, PIN).andExpect(status().isConflict());
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
        // tras cancelar se puede volver a pedir
        request(support, "SUSPEND", null);
    }

    @Test
    @DisplayName("Una solicitud pendiente de más de 7 días se muestra vencida y ya no se aprueba")
    void expires() throws Exception {
        long id = request(support, "SUSPEND", null);
        jdbc.update("UPDATE platform_requests SET created_at = ? WHERE id = ?", LocalDateTime.now().minusDays(8), id);
        assertEquals("EXPIRED", read(call("GET", "/platform/requests", owner, null)).get("content").get(0).get("status").asText());
        approve(id, owner, PIN).andExpect(status().isConflict());
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
    }

    // ───────────────────────── Editor de planes ─────────────────────────

    private Map<String, Object> planBody(String pin) {
        Map<String, Object> b = new HashMap<>();
        b.put("name", "Pro"); b.put("priceMonthly", 129900); b.put("priceYearly", 1299000); b.put("maxUsers", 6);
        b.put("maxProducts", 3000); b.put("extraUserPrice", 15000); b.put("active", true);
        b.put("features", java.util.List.of("REPORTS", "PREDICTIONS", "EXPORT")); b.put("pin", pin);
        return b;
    }

    @Test
    @DisplayName("Solo el dueño ve y edita los planes; el listado incluye inactivos y cuántas empresas usan cada uno")
    void plansAccess() throws Exception {
        JsonNode list = read(call("GET", "/platform/plans", owner, null).andExpect(status().isOk()));
        assertEquals(3, list.size());
        JsonNode pro = null;
        for (JsonNode p : list) if ("PRO".equals(p.get("code").asText())) pro = p;
        assertNotNull(pro);
        assertEquals(1, pro.get("subscribers").asInt());
        for (String t : new String[]{billing, support, viewer}) {
            call("GET", "/platform/plans", t, null).andExpect(status().isForbidden());
            call("PUT", "/platform/plans/PRO", t, planBody(PIN)).andExpect(status().isForbidden());
        }
    }

    @Test
    @DisplayName("Editar un plan: pide PIN, cambia precios y límites, queda auditado y aplica de inmediato a las empresas que lo usan")
    void plansUpdate() throws Exception {
        assertEquals(5, entitlements.snapshot(target.getId()).maxUsers());      // llena la caché con el valor anterior

        call("PUT", "/platform/plans/PRO", owner, planBody("000000")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PIN_INVALID"));
        JsonNode row = read(call("PUT", "/platform/plans/PRO", owner, planBody(PIN)).andExpect(status().isOk()));
        assertEquals(129900, row.get("priceMonthly").asLong());
        assertEquals(6, row.get("maxUsers").asInt());

        assertEquals(6, entitlements.snapshot(target.getId()).maxUsers(), "la caché de permisos se vació");
        var rows = jdbc.queryForList("SELECT details FROM audit_log WHERE action = 'PLAN_UPDATED'");
        assertEquals(1, rows.size());
        assertTrue(rows.get(0).get("details").toString().contains("mensual 119900 → 129900"));
        assertFalse(rows.get(0).get("details").toString().contains(PIN));

        // el listado público ya muestra el precio nuevo
        JsonNode pub = json.readTree(mvc.perform(MockMvcRequestBuilders.get("/public/plans")).andReturn().getResponse().getContentAsString());
        boolean found = false;
        for (JsonNode p : pub) if ("PRO".equals(p.get("code").asText())) { found = true; assertEquals(129900, p.get("priceMonthly").asLong()); }
        assertTrue(found);
    }

    @Test
    @DisplayName("Funciones del plan: agregar o quitar una se refleja en las empresas al instante")
    void plansFeatures() throws Exception {
        assertTrue(entitlements.snapshot(target.getId()).hasFeature("REPORTS"));
        Map<String, Object> b = planBody(PIN);
        b.put("features", java.util.List.of("PREDICTIONS"));
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isOk());
        assertFalse(entitlements.snapshot(target.getId()).hasFeature("REPORTS"));
        assertTrue(entitlements.snapshot(target.getId()).hasFeature("PREDICTIONS"));
    }

    @Test
    @DisplayName("Validaciones del plan: anual ≤ 12 meses, funciones conocidas, sin cambios, plan por defecto y plan inexistente")
    void plansValidation() throws Exception {
        Map<String, Object> b = planBody(PIN);
        b.put("priceYearly", 129900L * 12 + 1);
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isBadRequest());

        b = planBody(PIN);
        b.put("features", java.util.List.of("REPORTS", "MAGIA"));
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isBadRequest());

        b = planBody(PIN);
        b.put("priceMonthly", 10);
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isBadRequest());

        b = planBody(PIN);
        b.put("maxUsers", 0);
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isBadRequest());

        b = planBody(PIN);
        b.put("active", false);
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isBadRequest());     // PRO es el plan por defecto

        call("PUT", "/platform/plans/NOEXISTE", owner, planBody(PIN)).andExpect(status().isNotFound());

        // sin cambios reales no guarda
        b = planBody(PIN);
        b.put("priceMonthly", 119900); b.put("priceYearly", 1199000); b.put("maxUsers", 5);
        call("PUT", "/platform/plans/PRO", owner, b).andExpect(status().isBadRequest());

        // un plan que no es el por defecto sí puede desactivarse y deja de verse en el listado público
        Map<String, Object> starter = new HashMap<>(Map.of("name", "Starter", "priceMonthly", 59900, "priceYearly", 599000, "maxUsers", 2,
            "maxProducts", 300, "extraUserPrice", 15000, "active", false, "features", java.util.List.of(), "pin", PIN));
        call("PUT", "/platform/plans/STARTER", owner, starter).andExpect(status().isOk());
        JsonNode pub = json.readTree(mvc.perform(MockMvcRequestBuilders.get("/public/plans")).andReturn().getResponse().getContentAsString());
        for (JsonNode p : pub) assertNotEquals("STARTER", p.get("code").asText());
    }
}
