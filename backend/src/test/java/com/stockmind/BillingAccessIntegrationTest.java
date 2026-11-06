package com.stockmind;

import com.stockmind.model.Category;
import com.stockmind.model.Subscription;
import com.stockmind.model.User;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Qué puede hacer una empresa según su plan y el estado de su suscripción. */
class BillingAccessIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;

    String admin;
    String seller;
    Category category;

    @BeforeEach
    void setUp() {
        admin = bearer(createUser("admin", User.Role.ADMIN));
        seller = bearer(createUser("vendedor", User.Role.SELLER));
        category = createCategory();
    }

    private ResultActions api(String method, String path, String auth, String json) throws Exception {
        var b = switch (method) {
            case "POST" -> post(path);
            case "PUT" -> put(path);
            case "DELETE" -> delete(path);
            default -> get(path);
        };
        return mvc.perform(b.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
            .content(json == null ? "" : json));
    }

    private String newProduct(String sku) {
        return "{\"categoryId\":" + category.getId() + ",\"name\":\"x\",\"sku\":\"" + sku + "\",\"price\":10}";
    }

    // ───────────────────────────── Planes ─────────────────────────────

    @Test
    @DisplayName("Los planes son públicos y muestran el IVA y el total")
    void publicPlans() throws Exception {
        mvc.perform(get("/public/plans"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(3)))
            .andExpect(jsonPath("$[0].code").value("STARTER"))
            .andExpect(jsonPath("$[0].priceMonthly").value(59900))
            .andExpect(jsonPath("$[0].ivaMonthly").value(11381))      // 19 %
            .andExpect(jsonPath("$[0].totalMonthly").value(71281))
            .andExpect(jsonPath("$[0].totalYearly").value(712810))
            .andExpect(jsonPath("$[2].features", hasItems("AI_ASSISTANT", "API", "REPORTS")));
    }

    @Test
    @DisplayName("La suscripción informa plan, estado, días de prueba, funciones, límites y uso")
    void subscriptionView() throws Exception {
        Subscription s = setSubscription(org.getId(), "PRO", Subscription.Status.TRIAL);
        s.setTrialEndsAt(java.time.LocalDateTime.now().plusDays(4).plusHours(2));
        subscriptionRepository.save(s);
        entitlements.evict(org.getId());
        createProduct(category, 5, "10.00");

        api("GET", "/billing/subscription", seller, null)
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.planCode").value("PRO"))
            .andExpect(jsonPath("$.status").value("TRIAL"))
            .andExpect(jsonPath("$.trialDaysLeft").value(5))           // se redondea hacia arriba
            .andExpect(jsonPath("$.readOnly").value(false))
            .andExpect(jsonPath("$.features", hasItem("PREDICTIONS")))
            .andExpect(jsonPath("$.maxUsers").value(5))
            .andExpect(jsonPath("$.usage.users").value(2))
            .andExpect(jsonPath("$.usage.products").value(1));
    }

    // ───────────────────────────── Estado ─────────────────────────────

    @Test
    @DisplayName("En prueba o activa: acceso completo")
    void fullAccess() throws Exception {
        for (Subscription.Status st : new Subscription.Status[]{Subscription.Status.TRIAL, Subscription.Status.ACTIVE}) {
            setSubscription(org.getId(), "PRO", st);
            api("POST", "/products", admin, newProduct("OK-" + st)).andExpect(status().isCreated());
            api("GET", "/reports/top-products", admin, null).andExpect(status().isOk());
        }
    }

    @Test
    @DisplayName("Vencida (gracia): se puede consultar pero no cambiar nada; pagar sigue disponible")
    void graceIsReadOnly() throws Exception {
        setSubscription(org.getId(), "PRO", Subscription.Status.GRACE);

        api("GET", "/products", admin, null).andExpect(status().isOk());
        api("GET", "/sales", seller, null).andExpect(status().isOk());
        api("GET", "/dashboard/summary", seller, null).andExpect(status().isOk());

        for (String[] write : new String[][]{{"POST", "/products"}, {"POST", "/sales"}, {"POST", "/inventory/movements"},
                {"POST", "/users"}, {"PUT", "/products/1"}, {"DELETE", "/products/1"}}) {
            api(write[0], write[1], admin, "{}").andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("SUBSCRIPTION_READ_ONLY"));
        }
        // La vía para pagar y consultar el estado nunca se bloquea
        api("GET", "/billing/subscription", admin, null).andExpect(status().isOk())
            .andExpect(jsonPath("$.readOnly").value(true));
        api("GET", "/billing/plans", seller, null).andExpect(status().isOk());
        api("GET", "/auth/me", seller, null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Suspendida o cancelada: nada funciona (aunque el token siga vigente), salvo /billing y /auth")
    void suspendedIsBlocked() throws Exception {
        for (Subscription.Status st : new Subscription.Status[]{Subscription.Status.SUSPENDED, Subscription.Status.CANCELLED}) {
            setSubscription(org.getId(), "PRO", st);
            api("GET", "/products", admin, null).andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("SUBSCRIPTION_BLOCKED"));
            api("GET", "/dashboard/summary", seller, null).andExpect(status().isPaymentRequired());
            api("GET", "/billing/subscription", admin, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.blocked").value(true));
        }
    }

    @Test
    @DisplayName("Una empresa sin suscripción se bloquea (falla cerrado)")
    void noSubscriptionIsBlocked() throws Exception {
        subscriptionRepository.deleteAll();
        entitlements.evict(org.getId());
        api("GET", "/products", admin, null).andExpect(status().isPaymentRequired());
    }

    // ───────────────────────────── Funciones y límites ─────────────────────────────

    @Test
    @DisplayName("Los reportes exigen un plan que los incluya (Starter no; Pro y Business sí)")
    void reportsRequirePlanFeature() throws Exception {
        setSubscription(org.getId(), "STARTER", Subscription.Status.ACTIVE);
        api("GET", "/reports/top-products", admin, null).andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("FEATURE_NOT_IN_PLAN"))
            .andExpect(jsonPath("$.error", containsString("Starter")));
        api("GET", "/reports/sales?from=2026-01-01&to=2026-01-02", admin, null).andExpect(status().isPaymentRequired());
        api("GET", "/products", admin, null).andExpect(status().isOk());    // lo básico sigue

        setSubscription(org.getId(), "PRO", Subscription.Status.ACTIVE);
        api("GET", "/reports/top-products", admin, null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Límite de usuarios del plan: crear y reactivar cuentan contra el límite")
    void userLimit() throws Exception {
        setSubscription(org.getId(), "STARTER", Subscription.Status.ACTIVE);   // 2 usuarios; ya hay 2
        api("POST", "/users", admin, "{\"username\":\"nuevo\",\"email\":\"n@t.com\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PLAN_LIMIT_REACHED"))
            .andExpect(jsonPath("$.error", containsString("2 usuarios")));

        // desactivar a uno libera un cupo; reactivarlo ya no cabe
        User seller2 = userRepository.findByEmail("vendedor@test.com").orElseThrow();
        api("DELETE", "/users/" + seller2.getId(), admin, null).andExpect(status().isOk());
        api("POST", "/users", admin, "{\"username\":\"nuevo\",\"email\":\"n@t.com\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isCreated());
        api("PUT", "/users/" + seller2.getId(), admin, "{\"active\":true}").andExpect(status().isPaymentRequired());

        // un plan mayor lo permite
        setSubscription(org.getId(), "PRO", Subscription.Status.ACTIVE);
        api("PUT", "/users/" + seller2.getId(), admin, "{\"active\":true}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("Límite de productos activos del plan")
    void productLimit() throws Exception {
        setSubscription(org.getId(), "STARTER", Subscription.Status.ACTIVE);
        var plan = planRepository.findByCode("STARTER").orElseThrow();
        int original = plan.getMaxProducts();
        plan.setMaxProducts(2);
        planRepository.save(plan);
        entitlements.evict(org.getId());
        try {
            api("POST", "/products", admin, newProduct("P-1")).andExpect(status().isCreated());
            api("POST", "/products", admin, newProduct("P-2")).andExpect(status().isCreated());
            api("POST", "/products", admin, newProduct("P-3")).andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("PLAN_LIMIT_REACHED"));
            assertEquals(2, productRepository.count());
        } finally {
            plan.setMaxProducts(original);
            planRepository.save(plan);
        }
    }

    @Test
    @DisplayName("El permiso se calcula por empresa: la suspensión de una no afecta a otra")
    void accessIsPerOrganization() throws Exception {
        var other = createOrganization("Empresa B");
        String adminB = bearer(createUser(other, "adminB", User.Role.ADMIN));
        setSubscription(org.getId(), "PRO", Subscription.Status.SUSPENDED);

        api("GET", "/products", admin, null).andExpect(status().isPaymentRequired());
        api("GET", "/products", adminB, null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Los pagos están desactivados si no hay pasarela configurada (nunca se puede 'pagar' solo)")
    void noProviderMeansNoPayments() throws Exception {
        api("POST", "/billing/checkout", admin, "{\"planCode\":\"PRO\"}").andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("PAYMENTS_UNAVAILABLE"));
        mvc.perform(post("/public/payments/cualquiera/simulate")).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Solo ADMIN crea cobros y ve el historial; SELLER puede ver el plan")
    void billingRoles() throws Exception {
        api("POST", "/billing/checkout", seller, "{\"planCode\":\"PRO\"}").andExpect(status().isForbidden());
        api("GET", "/billing/payments", seller, null).andExpect(status().isForbidden());
        api("GET", "/billing/subscription", seller, null).andExpect(status().isOk());
        mvc.perform(get("/billing/subscription")).andExpect(status().isForbidden());   // sin sesión
    }
}
