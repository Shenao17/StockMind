package com.stockmind.support;

import com.stockmind.config.JwtConfig;
import com.stockmind.model.Category;
import com.stockmind.model.Product;
import com.stockmind.model.User;
import com.stockmind.repository.CategoryRepository;
import com.stockmind.repository.InventoryMovementRepository;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.SaleRepository;
import com.stockmind.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
    @Autowired protected JwtConfig jwtConfig;

    @BeforeEach
    void cleanDatabase() {
        movementRepository.deleteAll();
        saleRepository.deleteAll();
        productRepository.deleteAll();
        categoryRepository.deleteAll();
        userRepository.deleteAll();
    }

    protected User createUser(String username, User.Role role) {
        return userRepository.save(User.builder()
            .username(username)
            .email(username + "@test.com")
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
        return productRepository.save(Product.builder()
            .category(category)
            .name("Producto de prueba")
            .sku("SKU-" + UUID.randomUUID().toString().substring(0, 8))
            .price(new BigDecimal(price))
            .stockCurrent(stock)
            .stockMinimum(2)
            .unit("UNIT")
            .build());
    }
}
