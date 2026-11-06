package com.stockmind;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.billing.AuditService;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Subscription;
import com.stockmind.model.User;
import com.stockmind.repository.PaymentRepository;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Resumen con métricas, pantalla de cobros y auditoría del panel de plataforma. */
class PlatformStatsIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PaymentRepository paymentRepository;
    @Autowired AuditService audit;

    String owner, billing, support, viewer;

    @BeforeEach
    void team() {
        owner = platform("dueno", User.Role.PLATFORM_OWNER);
        billing = platform("cobro", User.Role.PLATFORM_BILLING);
        support = platform("soporte", User.Role.PLATFORM_SUPPORT);
        viewer = platform("lector", User.Role.PLATFORM_VIEWER);
    }

    private String platform(String name, User.Role role) {
        User u = createUser(name, role);
        u.setOrganizationId(null);
        userRepository.save(u);
        return bearer(u).substring(7);
    }

    private ResultActions get(String url, String token) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.get(url).header("Authorization", "Bearer " + token));
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private Subscription sub(Organization o, String plan, Subscription.Status st, Subscription.BillingCycle cycle, boolean compl) {
        Subscription s = setSubscription(o.getId(), plan, st);
        s.setBillingCycle(cycle);
        s.setComplimentary(compl);
        return subscriptionRepository.save(s);
    }

    private Payment payment(Organization o, Payment.Status st, LocalDateTime created, LocalDateTime paidAt, String plan, long net) {
        long iva = Math.round(net * 0.19);
        return paymentRepository.save(Payment.builder().organizationId(o.getId()).plan(planRepository.findByCode(plan).orElseThrow())
            .billingCycle(Subscription.BillingCycle.MONTHLY).reference("ref-" + java.util.UUID.randomUUID() + "-xxxxxxxx")
            .provider("SIMULATED").amountNet(net).ivaAmount(iva).amountTotal(net + iva).status(st)
            .expiresAt(created.plusHours(48)).createdAt(created).paidAt(paidAt).build());
    }

    private List<String> texts(JsonNode arr, String field) {
        return StreamSupport.stream(arr.spliterator(), false).map(n -> n.get(field).asText()).toList();
    }

    // ───────────────────────── Resumen ─────────────────────────

    @Test
    @DisplayName("El resumen cuenta empresas y suscripciones por estado, por plan y las altas de los últimos 30 días")
    void summaryCounts() throws Exception {
        Organization pending = createOrganization("Pendiente SA");
        pending.setStatus(Organization.Status.PENDING);
        organizationRepository.save(pending);
        Organization suspended = createOrganization("Suspendida SA");
        suspended.setStatus(Organization.Status.SUSPENDED);
        organizationRepository.save(suspended);
        sub(suspended, "STARTER", Subscription.Status.SUSPENDED, Subscription.BillingCycle.MONTHLY, false);
        Organization trial = createOrganization("En prueba SA");
        sub(trial, "PRO", Subscription.Status.TRIAL, Subscription.BillingCycle.MONTHLY, false);
        Organization old = createOrganization("Antigua SA");
        // created_at no es actualizable por JPA: se fija directo en la base
        jdbc.update("UPDATE organizations SET created_at = ? WHERE id = ?", LocalDateTime.now().minusDays(90), old.getId());

        JsonNode s = read(get("/platform/summary", owner).andExpect(status().isOk()));
        assertEquals(3, s.get("organizations").get("ACTIVE").asInt());           // Empresa A, En prueba, Antigua
        assertEquals(1, s.get("organizations").get("PENDING").asInt());
        assertEquals(1, s.get("organizations").get("SUSPENDED").asInt());
        assertEquals(0, s.get("organizations").get("CANCELLED").asInt(), "los estados sin empresas llegan en 0");
        assertEquals(1, s.get("subscriptions").get("TRIAL").asInt());
        assertEquals(1, s.get("subscriptions").get("SUSPENDED").asInt());
        assertEquals(3, s.get("complimentary").asInt());                          // Empresa A, Pendiente y Antigua (cortesía Business)
        assertEquals(1, s.get("plans").get("PRO").asInt());
        assertFalse(s.get("plans").has("STARTER"), "una suscripción suspendida no cuenta como vigente");
        assertEquals(4, s.get("newLast30Days").asInt());                          // todas menos la antigua
    }

    @Test
    @DisplayName("Pruebas por vencer (≤ 5 días, la más urgente primero) y empresas en gracia")
    void trialsAndGrace() throws Exception {
        Organization soon = createOrganization("Vence pronto");
        sub(soon, "PRO", Subscription.Status.TRIAL, Subscription.BillingCycle.MONTHLY, false).setTrialEndsAt(LocalDateTime.now().plusDays(4));
        Organization tomorrow = createOrganization("Vence mañana");
        sub(tomorrow, "STARTER", Subscription.Status.TRIAL, Subscription.BillingCycle.MONTHLY, false);
        Organization far = createOrganization("Vence lejos");
        sub(far, "PRO", Subscription.Status.TRIAL, Subscription.BillingCycle.MONTHLY, false);
        Organization grace = createOrganization("En gracia SA");
        sub(grace, "PRO", Subscription.Status.GRACE, Subscription.BillingCycle.MONTHLY, false);

        setTrial(soon, 4);
        setTrial(tomorrow, 1);
        setTrial(far, 20);
        var g = subscriptionRepository.findByOrganizationId(grace.getId()).orElseThrow();
        g.setGraceEndsAt(LocalDateTime.now().plusDays(3));
        subscriptionRepository.save(g);

        JsonNode s = read(get("/platform/summary", owner));
        assertEquals(List.of("Vence mañana", "Vence pronto"), texts(s.get("trialsEnding"), "name"));
        assertEquals(1, s.get("trialsEnding").get(0).get("daysLeft").asInt());
        assertEquals(4, s.get("trialsEnding").get(1).get("daysLeft").asInt());
        assertEquals(List.of("En gracia SA"), texts(s.get("inGrace"), "name"));
        assertEquals(5, s.get("trialWarningDays").asInt());
    }

    private void setTrial(Organization o, int days) {
        var s = subscriptionRepository.findByOrganizationId(o.getId()).orElseThrow();
        s.setTrialEndsAt(LocalDateTime.now().plusDays(days).minusHours(1));
        subscriptionRepository.save(s);
    }

    @Test
    @DisplayName("Ingresos: mes actual y anterior, MRR (anual ÷ 12, sin cortesías), pendientes vigentes y fallidos")
    void revenue() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime thisMonth = now.toLocalDate().withDayOfMonth(1).atStartOfDay().plusMinutes(5);
        LocalDateTime lastMonth = thisMonth.minusMonths(1).plusDays(2);

        Organization a = createOrganization("A");
        sub(a, "PRO", Subscription.Status.ACTIVE, Subscription.BillingCycle.MONTHLY, false);           // 119.900
        Organization b = createOrganization("B");
        sub(b, "BUSINESS", Subscription.Status.ACTIVE, Subscription.BillingCycle.YEARLY, false);       // 2.499.000 / 12 = 208.250
        Organization c = createOrganization("C");                                                       // cortesía: no cuenta
        Organization t = createOrganization("T");
        sub(t, "PRO", Subscription.Status.TRIAL, Subscription.BillingCycle.MONTHLY, false);            // prueba: no cuenta

        payment(a, Payment.Status.PAID, thisMonth, thisMonth, "PRO", 119900);
        payment(b, Payment.Status.PAID, thisMonth, thisMonth, "BUSINESS", 2499000);
        payment(a, Payment.Status.PAID, lastMonth, lastMonth, "PRO", 119900);
        payment(c, Payment.Status.PENDING, now.minusHours(1), null, "PRO", 119900);                     // pendiente vigente
        payment(c, Payment.Status.PENDING, now.minusDays(5), null, "PRO", 119900);                      // vencido: no es pendiente
        payment(c, Payment.Status.FAILED, now.minusDays(2), null, "PRO", 119900);
        payment(c, Payment.Status.FAILED, now.minusDays(60), null, "PRO", 119900);                      // fuera de 30 días

        JsonNode r = read(get("/platform/summary", owner)).get("revenue");
        assertEquals(119900 + 2499000, r.get("thisMonth").get("net").asLong());
        assertEquals(2, r.get("thisMonth").get("count").asInt());
        assertEquals(Math.round(119900 * 0.19) + Math.round(2499000 * 0.19), r.get("thisMonth").get("iva").asLong());
        assertEquals(119900, r.get("lastMonth").get("net").asLong());
        assertEquals(119900 + 208250, r.get("mrr").asLong());
        assertEquals(1, r.get("pendingCount").asInt());
        assertEquals(142681, r.get("pendingTotal").asLong());
        assertEquals(1, r.get("failedLast30Days").asInt());
    }

    @Test
    @DisplayName("Los ingresos solo los ven roles con permiso de cobros: Soporte ve el resumen sin ellos")
    void revenueVisibility() throws Exception {
        assertTrue(read(get("/platform/summary", support).andExpect(status().isOk())).get("revenue").isNull());
        for (String t : new String[]{owner, billing, viewer}) {
            assertFalse(read(get("/platform/summary", t).andExpect(status().isOk())).get("revenue").isNull());
        }
        String admin = bearer(createUser("jefe", User.Role.ADMIN)).substring(7);
        get("/platform/summary", admin).andExpect(status().isForbidden());
    }

    // ───────────────────────── Cobros ─────────────────────────

    @Test
    @DisplayName("Cobros: filtra por estado (incluido vencido), empresa y fechas; los totales cubren todas las páginas")
    void payments() throws Exception {
        LocalDateTime now = LocalDateTime.now();
        Organization a = createOrganization("Ferretería Alfa");
        Organization b = createOrganization("Panadería Beta");
        payment(a, Payment.Status.PAID, now.minusDays(10), now.minusDays(10), "PRO", 100000);
        payment(a, Payment.Status.PAID, now.minusDays(3), now.minusDays(3), "PRO", 200000);
        payment(b, Payment.Status.PAID, now.minusDays(2), now.minusDays(2), "STARTER", 50000);
        payment(b, Payment.Status.PENDING, now.minusHours(2), null, "PRO", 100000);
        payment(b, Payment.Status.PENDING, now.minusDays(9), null, "PRO", 100000);                     // vencido
        payment(a, Payment.Status.FAILED, now.minusDays(1), null, "PRO", 100000);

        JsonNode all = read(get("/platform/payments?size=2&page=0", owner).andExpect(status().isOk()));
        assertEquals(6, all.get("page").get("totalElements").asInt());
        assertEquals(2, all.get("page").get("content").size());
        assertEquals(350000, all.get("totals").get("paidNet").asLong(), "suma de TODAS las páginas, no de la visible");
        assertEquals(3, all.get("totals").get("paidCount").asInt());
        assertEquals(Math.round(100000 * 0.19) + Math.round(200000 * 0.19) + Math.round(50000 * 0.19), all.get("totals").get("paidIva").asLong());

        assertEquals(3, read(get("/platform/payments?status=PAID", owner)).get("page").get("totalElements").asInt());
        assertEquals(1, read(get("/platform/payments?status=PENDING", owner)).get("page").get("totalElements").asInt());
        JsonNode expired = read(get("/platform/payments?status=EXPIRED", owner));
        assertEquals(1, expired.get("page").get("totalElements").asInt());
        assertEquals("EXPIRED", expired.get("page").get("content").get(0).get("status").asText());
        assertEquals(1, read(get("/platform/payments?status=FAILED", owner)).get("page").get("totalElements").asInt());

        JsonNode byName = read(get("/platform/payments?search=ferreter", owner));
        assertEquals(3, byName.get("page").get("totalElements").asInt());
        assertEquals("Ferretería Alfa", byName.get("page").get("content").get(0).get("organizationName").asText());
        assertEquals(300000, byName.get("totals").get("paidNet").asLong());
        assertEquals(0, read(get("/platform/payments?search=noexiste", owner)).get("page").get("totalElements").asInt());
        assertEquals(3, read(get("/platform/payments?organizationId=" + a.getId(), owner)).get("page").get("totalElements").asInt());

        String from = LocalDate.now().minusDays(4).toString();
        JsonNode recent = read(get("/platform/payments?from=" + from + "&status=PAID", owner));
        assertEquals(2, recent.get("page").get("totalElements").asInt());
        assertEquals(250000, recent.get("totals").get("paidNet").asLong());
        assertEquals(0, read(get("/platform/payments?to=" + LocalDate.now().minusDays(30), owner)).get("page").get("totalElements").asInt());
    }

    @Test
    @DisplayName("Cobros: orden, validación de parámetros y permisos; nunca muestra la referencia del enlace")
    void paymentsRulesAndLeaks() throws Exception {
        Organization a = createOrganization("Alfa");
        Payment p = payment(a, Payment.Status.PENDING, LocalDateTime.now(), null, "PRO", 100000);

        String body = get("/platform/payments", owner).andReturn().getResponse().getContentAsString();
        assertFalse(body.contains(p.getReference()));
        assertFalse(body.contains("\"reference\""));

        get("/platform/payments?status=RARO", owner).andExpect(status().isBadRequest());
        get("/platform/payments?from=ayer", owner).andExpect(status().isBadRequest());
        get("/platform/payments?size=1000", owner).andExpect(status().isBadRequest());
        get("/platform/payments?sort=reference", owner).andExpect(status().isBadRequest());
        get("/platform/payments?sort=amountTotal&dir=desc", owner).andExpect(status().isOk());

        for (String t : new String[]{owner, billing, viewer}) get("/platform/payments", t).andExpect(status().isOk());
        get("/platform/payments", support).andExpect(status().isForbidden());
        get("/platform/payments", bearer(createUser("jefe", User.Role.ADMIN)).substring(7)).andExpect(status().isForbidden());
    }

    // ───────────────────────── Auditoría ─────────────────────────

    @Test
    @DisplayName("Auditoría: filtra por acción, quién, empresa y fechas; con el nombre de la empresa y paginada")
    void auditList() throws Exception {
        Organization a = createOrganization("Alfa SAS");
        audit.record("ana@x.com", "ORGANIZATION_SUSPENDED", a.getId(), null);
        audit.record("ana@x.com", "ORGANIZATION_REACTIVATED", a.getId(), "motivo");
        audit.record("luis@x.com", "TEAM_MEMBER_CREATED", null, "nuevo@x.com");

        JsonNode all = read(get("/platform/audit", owner).andExpect(status().isOk()));
        assertEquals(3, all.get("totalElements").asInt());
        JsonNode first = all.get("content").get(0);
        assertNotNull(first.get("at"));

        assertEquals(1, read(get("/platform/audit?action=ORGANIZATION_SUSPENDED", owner)).get("totalElements").asInt());
        JsonNode byActor = read(get("/platform/audit?actor=ANA", owner));
        assertEquals(2, byActor.get("totalElements").asInt());
        assertEquals("Alfa SAS", byActor.get("content").get(0).get("organizationName").asText());
        assertEquals(2, read(get("/platform/audit?organizationId=" + a.getId(), owner)).get("totalElements").asInt());
        assertEquals(1, read(get("/platform/audit?actor=luis", owner)).get("totalElements").asInt());
        assertTrue(read(get("/platform/audit?actor=luis", owner)).get("content").get(0).get("organizationName").isNull());
        assertEquals(3, read(get("/platform/audit?from=" + LocalDate.now(), owner)).get("totalElements").asInt());
        assertEquals(0, read(get("/platform/audit?to=" + LocalDate.now().minusDays(1), owner)).get("totalElements").asInt());
        JsonNode page = read(get("/platform/audit?size=2&page=1", owner));
        assertEquals(1, page.get("content").size());
        assertEquals(2, page.get("totalPages").asInt());
    }

    @Test
    @DisplayName("Auditoría: todos los roles de plataforma la ven; las empresas no; parámetros inválidos dan 400")
    void auditPermissions() throws Exception {
        for (String t : new String[]{owner, billing, support, viewer}) get("/platform/audit", t).andExpect(status().isOk());
        get("/platform/audit", bearer(createUser("jefe", User.Role.ADMIN)).substring(7)).andExpect(status().isForbidden());
        get("/platform/audit?from=x", owner).andExpect(status().isBadRequest());
        get("/platform/audit?size=0", owner).andExpect(status().isBadRequest());
        get("/platform/audit?sort=details", owner).andExpect(status().isBadRequest());
    }
}
