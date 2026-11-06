package com.stockmind;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.model.Organization;
import com.stockmind.model.Payment;
import com.stockmind.model.Subscription;
import com.stockmind.model.User;
import com.stockmind.repository.AuditLogRepository;
import com.stockmind.repository.PaymentRepository;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Cobros con la pasarela SIMULADA y acciones del panel de plataforma. */
@TestPropertySource(properties = "stockmind.payments.provider=simulated")
class BillingPaymentsIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PaymentRepository paymentRepository;
    @Autowired AuditLogRepository auditLogRepository;
    @Autowired PasswordEncoder encoder;

    String admin;
    String seller;
    String owner;

    @BeforeEach
    void setUp() {
        admin = bearer(createUser("admin", User.Role.ADMIN));
        seller = bearer(createUser("vendedor", User.Role.SELLER));
        owner = bearer(createUser("dueno", User.Role.PLATFORM_ADMIN));
        setSubscription(org.getId(), "STARTER", Subscription.Status.TRIAL);
    }

    private ResultActions as(String auth, String method, String path, Object body) throws Exception {
        var b = method.equals("POST") ? post(path) : get(path);
        return mvc.perform(b.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
            .content(body == null ? "" : json.writeValueAsString(body)));
    }

    private String checkout(String plan, String cycle) throws Exception {
        String res = as(admin, "POST", "/billing/checkout", Map.of("planCode", plan, "billingCycle", cycle))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(res).get("reference").asText();
    }

    private ResultActions simulate(String ref) throws Exception {
        return mvc.perform(post("/public/payments/" + ref + "/simulate"));
    }

    private Subscription sub() {
        return subscriptionRepository.findByOrganizationId(org.getId()).orElseThrow();
    }

    // ───────────────────────────── Cobro ─────────────────────────────

    @Test
    @DisplayName("El cobro calcula IVA y total, y devuelve el enlace de pago")
    void checkoutAmounts() throws Exception {
        as(admin, "POST", "/billing/checkout", Map.of("planCode", "PRO", "billingCycle", "MONTHLY"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.amountNet").value(119900))
            .andExpect(jsonPath("$.ivaAmount").value(22781))
            .andExpect(jsonPath("$.amountTotal").value(142681))
            .andExpect(jsonPath("$.provider").value("SIMULATED"))
            .andExpect(jsonPath("$.checkoutUrl", containsString("/pay/")));

        as(admin, "POST", "/billing/checkout", Map.of("planCode", "PRO", "billingCycle", "YEARLY"))
            .andExpect(jsonPath("$.amountNet").value(1199000))
            .andExpect(jsonPath("$.amountTotal").value(1426810));
    }

    @Test
    @DisplayName("Un plan inexistente se rechaza")
    void unknownPlan() throws Exception {
        as(admin, "POST", "/billing/checkout", Map.of("planCode", "NOPE")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("El enlace público muestra el resumen sin exponer nada más")
    void publicSummary() throws Exception {
        String ref = checkout("PRO", "MONTHLY");
        mvc.perform(get("/public/payments/" + ref))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.company").value("Empresa A"))
            .andExpect(jsonPath("$.planName").value("Pro"))
            .andExpect(jsonPath("$.amountTotal").value(142681))
            .andExpect(jsonPath("$.canSimulate").value(true))
            .andExpect(jsonPath("$.organizationId").doesNotExist());
        mvc.perform(get("/public/payments/no-existe")).andExpect(status().isNotFound());
    }

    // ───────────────────────────── Confirmación ─────────────────────────────

    @Test
    @DisplayName("Pagar activa el plan: estado ACTIVE, plan nuevo y periodo de un mes")
    void paymentActivatesPlan() throws Exception {
        simulate(checkout("PRO", "MONTHLY")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));

        Subscription s = sub();
        assertEquals(Subscription.Status.ACTIVE, s.getStatus());
        assertEquals("PRO", s.getPlan().getCode());
        assertEquals(Subscription.BillingCycle.MONTHLY, s.getBillingCycle());
        assertTrue(s.getCurrentPeriodEnd().isAfter(LocalDateTime.now().plusDays(27)));
        assertTrue(s.getCurrentPeriodEnd().isBefore(LocalDateTime.now().plusDays(32)));
        // las funciones del plan nuevo ya están disponibles
        as(admin, "GET", "/reports/top-products", null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("El plan anual dura un año")
    void yearlyPlan() throws Exception {
        simulate(checkout("BUSINESS", "YEARLY")).andExpect(status().isOk());
        assertTrue(sub().getCurrentPeriodEnd().isAfter(LocalDateTime.now().plusDays(360)));
    }

    @Test
    @DisplayName("Confirmar dos veces el mismo pago no extiende el plan dos veces (idempotente)")
    void idempotent() throws Exception {
        String ref = checkout("PRO", "MONTHLY");
        simulate(ref).andExpect(status().isOk());
        LocalDateTime end = sub().getCurrentPeriodEnd();
        simulate(ref).andExpect(status().isOk());
        assertEquals(end, sub().getCurrentPeriodEnd());
        assertEquals(1, paymentRepository.findAll().stream().filter(p -> p.getStatus() == Payment.Status.PAID).count());
    }

    @Test
    @DisplayName("Renovar antes de vencer suma el nuevo periodo al final del actual (no se pierde lo pagado)")
    void earlyRenewalExtends() throws Exception {
        simulate(checkout("PRO", "MONTHLY")).andExpect(status().isOk());
        LocalDateTime firstEnd = sub().getCurrentPeriodEnd();
        simulate(checkout("PRO", "MONTHLY")).andExpect(status().isOk());
        assertEquals(firstEnd.plusMonths(1).withNano(0), sub().getCurrentPeriodEnd().withNano(0));
    }

    @Test
    @DisplayName("Pagar reactiva una empresa suspendida (vuelve a poder iniciar sesión)")
    void paymentReactivatesSuspended() throws Exception {
        String ref = checkout("PRO", "MONTHLY");
        setSubscription(org.getId(), "PRO", Subscription.Status.SUSPENDED);
        org.setStatus(Organization.Status.SUSPENDED);
        organizationRepository.save(org);

        simulate(ref).andExpect(status().isOk());

        assertEquals(Organization.Status.ACTIVE, organizationRepository.findById(org.getId()).orElseThrow().getStatus());
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
        as(admin, "GET", "/products", null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Un enlace vencido no se puede pagar")
    void expiredLink() throws Exception {
        String ref = checkout("PRO", "MONTHLY");
        Payment p = paymentRepository.findByReference(ref).orElseThrow();
        p.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        paymentRepository.save(p);

        simulate(ref).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error", containsString("venció")));
        mvc.perform(get("/public/payments/" + ref)).andExpect(jsonPath("$.status").value("EXPIRED"))
            .andExpect(jsonPath("$.canSimulate").value(false));
        assertEquals(Subscription.Status.TRIAL, sub().getStatus());
    }

    @Test
    @DisplayName("La referencia es larga y aleatoria; una inventada devuelve 404")
    void unpredictableReference() throws Exception {
        String a = checkout("PRO", "MONTHLY");
        String b = checkout("PRO", "MONTHLY");
        assertNotEquals(a, b);
        assertTrue(a.length() >= 30);
        simulate("referencia-inventada").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("El historial lo ve solo el ADMIN de la empresa y no incluye cobros de otras")
    void history() throws Exception {
        checkout("PRO", "MONTHLY");
        Organization other = createOrganization("Empresa B");
        String adminB = bearer(createUser(other, "adminB", User.Role.ADMIN));
        mvc.perform(post("/billing/checkout").header("Authorization", adminB)
            .contentType(MediaType.APPLICATION_JSON).content("{\"planCode\":\"PRO\"}")).andExpect(status().isCreated());

        as(admin, "GET", "/billing/payments", null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        as(seller, "GET", "/billing/payments", null).andExpect(status().isForbidden());
    }

    // ───────────────────────────── Panel de plataforma ─────────────────────────────

    private ResultActions platform(String method, String suffix, Object body) throws Exception {
        return as(owner, method, "/platform/organizations/" + org.getId() + suffix, body);
    }

    @Test
    @DisplayName("Plataforma: solo PLATFORM_ADMIN puede usar las acciones")
    void platformRolesOnly() throws Exception {
        for (String[] a : new String[][]{{"suspend"}, {"reactivate"}, {"cancel"}, {"extend-trial"}, {"plan"}, {"payment-links"}, {"manual-payment"}}) {
            as(admin, "POST", "/platform/organizations/" + org.getId() + "/" + a[0], Map.of("days", 5, "planCode", "PRO"))
                .andExpect(status().isForbidden());
        }
    }

    @Test
    @DisplayName("Plataforma: suspender bloquea a la empresa (sesión y login) y reactivar la devuelve; todo queda auditado")
    void suspendAndReactivate() throws Exception {
        User ana = createUser("ana", User.Role.ADMIN);
        ana.setPasswordHash(encoder.encode("Clave1234"));
        userRepository.save(ana);

        platform("POST", "/suspend", null).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUSPENDED"))
            .andExpect(jsonPath("$.subscription.status").value("SUSPENDED"));
        as(admin, "GET", "/products", null).andExpect(status().isPaymentRequired());   // el token vigente ya no sirve
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"email\":\"ana@test.com\",\"password\":\"Clave1234\"}")).andExpect(status().isUnauthorized());

        platform("POST", "/reactivate", null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        as(admin, "GET", "/products", null).andExpect(status().isOk());

        assertEquals(2, auditLogRepository.count());
        assertEquals("dueno@test.com", auditLogRepository.findAll().get(0).getActorEmail());
        assertEquals(org.getId(), auditLogRepository.findAll().get(0).getOrganizationId());
    }

    @Test
    @DisplayName("Plataforma: cancelar deja la empresa CANCELLED")
    void cancel() throws Exception {
        platform("POST", "/cancel", null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        assertEquals(Subscription.Status.CANCELLED, sub().getStatus());
    }

    @Test
    @DisplayName("Plataforma: extender la prueba suma días; en gracia o suspendida la reinicia")
    void extendTrial() throws Exception {
        Subscription s = sub();
        s.setTrialEndsAt(LocalDateTime.now().plusDays(2));
        subscriptionRepository.save(s);
        platform("POST", "/extend-trial", Map.of("days", 10)).andExpect(status().isOk());
        assertTrue(sub().getTrialEndsAt().isAfter(LocalDateTime.now().plusDays(11)));

        setSubscription(org.getId(), "STARTER", Subscription.Status.GRACE);
        platform("POST", "/extend-trial", Map.of("days", 7)).andExpect(status().isOk());
        assertEquals(Subscription.Status.TRIAL, sub().getStatus());
        assertTrue(sub().getTrialEndsAt().isBefore(LocalDateTime.now().plusDays(8)));

        platform("POST", "/extend-trial", Map.of("days", 0)).andExpect(status().isBadRequest());
        platform("POST", "/extend-trial", Map.of("days", 91)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Plataforma: cambiar plan, cortesía y registrar un pago recibido por teléfono")
    void planAndManualPayment() throws Exception {
        platform("POST", "/plan", Map.of("planCode", "BUSINESS")).andExpect(status().isOk())
            .andExpect(jsonPath("$.subscription.planCode").value("BUSINESS"));
        platform("POST", "/plan", Map.of("planCode", "NOPE")).andExpect(status().isBadRequest());

        platform("POST", "/manual-payment", Map.of("planCode", "PRO", "billingCycle", "YEARLY"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.provider").value("MANUAL"))
            .andExpect(jsonPath("$.status").value("PAID"));
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
        assertEquals("PRO", sub().getPlan().getCode());
        assertTrue(sub().getCurrentPeriodEnd().isAfter(LocalDateTime.now().plusDays(360)));
    }

    @Test
    @DisplayName("Plataforma: genera un enlace de pago para enviar al cliente, y al pagarlo se activa el plan")
    void paymentLinkForCustomer() throws Exception {
        String res = platform("POST", "/payment-links", Map.of("planCode", "PRO", "billingCycle", "MONTHLY"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.checkoutUrl", containsString("/pay/")))
            .andReturn().getResponse().getContentAsString();
        String ref = json.readTree(res).get("reference").asText();

        assertTrue(paymentRepository.findByReference(ref).orElseThrow().getCreatedByPlatform());
        simulate(ref).andExpect(status().isOk());
        assertEquals(Subscription.Status.ACTIVE, sub().getStatus());
    }

    @Test
    @DisplayName("Plataforma: una empresa que aún no verificó su correo no se puede suspender ni reactivar")
    void pendingOrganization() throws Exception {
        org.setStatus(Organization.Status.PENDING);
        organizationRepository.save(org);
        platform("POST", "/suspend", null).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ORGANIZATION_PENDING"));
    }

    @Test
    @DisplayName("Plataforma: el listado incluye el resumen de la suscripción de cada empresa")
    void listIncludesSubscription() throws Exception {
        as(owner, "GET", "/platform/organizations?page=0&size=10", null).andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].subscription.planCode").value("STARTER"))
            .andExpect(jsonPath("$.content[0].subscription.status").value("TRIAL"));
        as(owner, "GET", "/platform/organizations/" + org.getId(), null).andExpect(status().isOk());
        as(owner, "GET", "/platform/organizations/999999", null).andExpect(status().isNotFound());
    }
}
