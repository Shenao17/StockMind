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

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Base de las pruebas de integración: levanta la aplicación completa con H2 y
 * deja la base vacía antes de cada prueba. Ofrece helpers para crear datos y tokens.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTestBase {

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
