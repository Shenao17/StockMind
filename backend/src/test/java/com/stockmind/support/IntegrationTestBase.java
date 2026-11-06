package com.stockmind.support;

import com.stockmind.config.JwtConfig;
import com.stockmind.model.Category;
import com.stockmind.billing.EntitlementService;
import com.stockmind.model.Organization;
import com.stockmind.model.Plan;
import com.stockmind.model.Subscription;
import com.stockmind.model.Product;
import com.stockmind.model.User;
import com.stockmind.repository.CategoryRepository;
import com.stockmind.repository.InventoryMovementRepository;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.PlanRepository;
import com.stockmind.repository.SubscriptionRepository;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.SaleRepository;
import com.stockmind.repository.UserRepository;
import com.stockmind.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Base de las pruebas de integración: levanta la aplicación completa y deja la
 * base vacía antes de cada prueba. Ofrece helpers para crear datos y tokens.
 *
 * Por defecto usa H2 en memoria (rápido, sin dependencias). Si existe la variable
 * de entorno MYSQL_TEST_URL, TODA la suite corre contra ese MySQL real, aplicando
 * las migraciones de Flyway y validando el esquema con Hibernate (así lo hace el CI).
 *   MYSQL_TEST_URL=jdbc:mysql://host:3306/stockmind_test
 *   MYSQL_TEST_USER / MYSQL_TEST_PASSWORD
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestEmailConfig.class)
public abstract class IntegrationTestBase {

    @DynamicPropertySource
    static void useRealMysqlWhenConfigured(DynamicPropertyRegistry registry) {
        String url = System.getenv("MYSQL_TEST_URL");
        if (url == null || url.isBlank()) {
            return; // H2 + esquema generado por Hibernate (application.properties de test)
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv().getOrDefault("MYSQL_TEST_USER", "root"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("MYSQL_TEST_PASSWORD", ""));
        registry.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }

    @Autowired protected UserRepository userRepository;
    @Autowired protected ProductRepository productRepository;
    @Autowired protected CategoryRepository categoryRepository;
    @Autowired protected SaleRepository saleRepository;
    @Autowired protected InventoryMovementRepository movementRepository;
    @Autowired protected OrganizationRepository organizationRepository;
    @Autowired protected JwtConfig jwtConfig;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected CapturingEmailSender emails;
    @Autowired protected PlanRepository planRepository;
    @Autowired protected SubscriptionRepository subscriptionRepository;
    @Autowired protected EntitlementService entitlements;

    /** Empresa por defecto de cada prueba (la "A"); el contexto de empresa queda apuntando a ella. */
    protected Organization org;

    @BeforeEach
    void cleanDatabaseAndStartTenant() {
        TenantContext.clear();
        emails.clear();
        // SQL directo (sin filtro de empresa) para vaciar TODAS las empresas, hijos primero
        for (String table : new String[]{"email_verification_tokens", "inventory_movements", "sale_details", "sales", "demand_predictions",
                "products", "categories", "payments", "subscriptions", "audit_log", "users", "organizations"}) {
            try {
                jdbc.update("DELETE FROM " + table);
            } catch (DataAccessException e) {
                // demand_predictions no tiene entidad: en H2 (esquema generado) no existe; en MySQL sí (Flyway)
                if (!table.equals("demand_predictions")) throw e;
            }
        }
        ensurePlans();
        org = createOrganization("Empresa A");
        TenantContext.set(org.getId());
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    /** Los planes son datos de referencia: en MySQL los crea la migración V4; en H2 se crean aquí. */
    protected void ensurePlans() {
        if (planRepository.count() > 0) return;
        planRepository.save(plan("STARTER", "Starter", 59900, 599000, 2, 300, 15000, 1));
        planRepository.save(plan("PRO", "Pro", 119900, 1199000, 5, 3000, 15000, 2, "REPORTS", "PREDICTIONS", "EXPORT"));
        planRepository.save(plan("BUSINESS", "Business", 249900, 2499000, 15, 20000, 12000, 3,
            "REPORTS", "PREDICTIONS", "EXPORT", "AI_ASSISTANT", "API"));
    }

    private Plan plan(String code, String name, long monthly, long yearly, int users, int products,
                      long extra, int order, String... features) {
        return Plan.builder().code(code).name(name).priceMonthly(monthly).priceYearly(yearly)
            .maxUsers(users).maxProducts(products).extraUserPrice(extra).sortOrder(order)
            .features(new java.util.HashSet<>(java.util.Arrays.asList(features))).build();
    }

    /** Empresa ACTIVE con suscripción de cortesía (plan Business): acceso completo, sin límites prácticos. */
    protected Organization createOrganization(String name) {
        Organization o = organizationRepository.save(Organization.builder()
            .name(name)
            .contactEmail(name.toLowerCase().replace(' ', '.') + "@test.com")
            .status(Organization.Status.ACTIVE)
            .origin(Organization.Origin.PLATFORM_ADMIN)
            .build());
        subscriptionRepository.save(Subscription.builder().organizationId(o.getId())
            .plan(planRepository.findByCode("BUSINESS").orElseThrow())
            .status(Subscription.Status.ACTIVE).complimentary(true).build());
        return o;
    }

    /** Fija el estado/plan de la suscripción de una empresa (y limpia la caché de permisos). */
    protected Subscription setSubscription(Long orgId, String planCode, Subscription.Status status) {
        Subscription s = subscriptionRepository.findByOrganizationId(orgId).orElseThrow();
        s.setPlan(planRepository.findByCode(planCode).orElseThrow());
        s.setStatus(status);
        s.setComplimentary(false);
        Subscription saved = subscriptionRepository.save(s);
        entitlements.evict(orgId);
        return saved;
    }

    protected User createUser(String username, User.Role role) {
        return createUser(org, username, role);
    }

    protected User createUser(Organization organization, String username, User.Role role) {
        return userRepository.save(User.builder()
            .organizationId(role == User.Role.PLATFORM_ADMIN ? null : organization.getId())
            .username(username)
            .email((username + "@test.com").toLowerCase())
            .passwordHash("no-importa-en-estas-pruebas")
            .role(role)
            .active(true)
            .build());
    }

    protected String bearer(User user) {
        return "Bearer " + jwtConfig.generateToken(user);
    }

    protected Category createCategory() {
        return categoryRepository.save(Category.builder()
            .name("Cat-" + UUID.randomUUID().toString().substring(0, 8))
            .build());
    }

    protected Product createProduct(Category category, int stock, String price) {
        return createProduct(category, "SKU-" + UUID.randomUUID().toString().substring(0, 8), stock, price);
    }

    protected Product createProduct(Category category, String sku, int stock, String price) {
        return productRepository.save(Product.builder()
            .category(category)
            .name("Producto de prueba")
            .sku(sku)
            .price(new BigDecimal(price))
            .stockCurrent(stock)
            .stockMinimum(2)
            .unit("UNIT")
            .build());
    }
}
