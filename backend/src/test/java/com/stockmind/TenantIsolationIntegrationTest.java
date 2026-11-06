package com.stockmind;

import com.stockmind.dto.SaleDTO;
import com.stockmind.model.*;
import com.stockmind.service.SaleService;
import com.stockmind.support.IntegrationTestBase;
import com.stockmind.tenant.TenantContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Aislamiento entre empresas: la empresa A NUNCA ve, modifica ni referencia datos de la B,
 * ni por listados, ni por id, ni por reportes, ni por escritura cruzada.
 */
class TenantIsolationIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired SaleService saleService;

    Organization orgB;
    User adminA;
    User adminB;
    String authA;
    Category catA, catB;
    Product productA, productB;
    Sale saleB;

    @BeforeEach
    void setUp() {
        orgB = createOrganization("Empresa B");

        adminA = createUser("adminA", User.Role.ADMIN);
        authA = bearer(adminA);
        catA = createCategory();
        productA = createProduct(catA, "SKU-1", 50, "100.00");
        createProduct(catA, "SKU-A2", 50, "10.00");
        sell(adminA.getEmail(), productA, 1);

        adminB = createUser(orgB, "adminB", User.Role.ADMIN);
        createUser(orgB, "vendedorB", User.Role.SELLER);
        TenantContext.runAs(orgB.getId(), () -> {
            catB = createCategory();
            productB = createProduct(catB, "SKU-1", 80, "500.00");   // mismo SKU que A: permitido
            createProduct(catB, "SKU-B2", 80, "20.00");
            createProduct(catB, "SKU-B3", 80, "30.00");
            saleB = sell(adminB.getEmail(), productB, 5);
        });
    }

    private Sale sell(String email, Product p, int qty) {
        SaleDTO.ItemRequest item = new SaleDTO.ItemRequest();
        item.setProductId(p.getId());
        item.setQuantity(qty);
        SaleDTO.Request r = new SaleDTO.Request();
        r.setItems(List.of(item));
        return saleService.registerSale(email, r);
    }

    private ResultActions asA(String method, String path, String json) throws Exception {
        var b = switch (method) {
            case "POST" -> post(path);
            case "PUT" -> put(path);
            case "DELETE" -> delete(path);
            default -> get(path);
        };
        return mvc.perform(b.header("Authorization", authA)
            .contentType(MediaType.APPLICATION_JSON).content(json == null ? "" : json));
    }

    // ───────────────────────────── Lecturas ─────────────────────────────

    @Test
    @DisplayName("Productos: el listado solo trae los de la propia empresa")
    void productListIsScoped() throws Exception {
        asA("GET", "/products?page=0&size=50", null)
            .andExpect(jsonPath("$.totalElements").value(2));
        asA("GET", "/products", null).andExpect(jsonPath("$", hasSize(2)));
        asA("GET", "/products?search=B2", null).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("Por id: pedir un recurso de otra empresa devuelve 404, como si no existiera")
    void byIdAcrossTenants() throws Exception {
        asA("GET", "/products/" + productB.getId(), null).andExpect(status().isNotFound());
        asA("GET", "/sales/" + saleB.getId(), null).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Ventas, movimientos y categorías: solo los propios")
    void salesMovementsCategoriesScoped() throws Exception {
        asA("GET", "/sales?page=0&size=50", null).andExpect(jsonPath("$.totalElements").value(1));
        asA("GET", "/inventory/movements?page=0&size=50", null).andExpect(jsonPath("$.totalElements").value(1));
        asA("GET", "/categories", null)
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id").value(catA.getId()));
    }

    @Test
    @DisplayName("Dashboard y reportes: totales y top de productos solo de la propia empresa")
    void dashboardAndReportsScoped() throws Exception {
        asA("GET", "/dashboard/summary", null)
            .andExpect(jsonPath("$.activeProducts").value(2))
            .andExpect(jsonPath("$.salesToday.count").value(1))
            .andExpect(jsonPath("$.salesToday.total").value(100.00))
            .andExpect(jsonPath("$.recentSales", hasSize(1)));

        // El JPQL con JOIN (reporte de más vendidos) también debe respetar la empresa
        asA("GET", "/reports/top-products", null)
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].productId").value(productA.getId()));

        String today = java.time.LocalDate.now().toString();
        asA("GET", "/reports/sales?from=" + today + "&to=" + today, null)
            .andExpect(jsonPath("$.totalTransactions").value(1))
            .andExpect(jsonPath("$.totalRevenue").value(100.00));
    }

    // ───────────────────────────── Escrituras cruzadas ─────────────────────────────

    @Test
    @DisplayName("No se puede modificar ni borrar un producto de otra empresa")
    void cannotWriteOtherTenantProduct() throws Exception {
        String body = "{\"categoryId\":" + catA.getId() + ",\"name\":\"Hackeado\",\"sku\":\"SKU-1\",\"price\":1}";
        asA("PUT", "/products/" + productB.getId(), body).andExpect(status().isNotFound());
        asA("DELETE", "/products/" + productB.getId(), null).andExpect(status().isNotFound());

        TenantContext.runAs(orgB.getId(), () -> {
            Product still = productRepository.findById(productB.getId()).orElseThrow();
            assertEquals("Producto de prueba", still.getName());
            assertTrue(still.getActive());
        });
    }

    @Test
    @DisplayName("No se puede vender ni mover inventario de un producto de otra empresa")
    void cannotSellOrMoveOtherTenantProduct() throws Exception {
        asA("POST", "/sales", "{\"items\":[{\"productId\":" + productB.getId() + ",\"quantity\":1}]}")
            .andExpect(status().isNotFound());
        asA("POST", "/inventory/movements",
            "{\"productId\":" + productB.getId() + ",\"type\":\"EXIT\",\"quantity\":1}")
            .andExpect(status().isNotFound());

        TenantContext.runAs(orgB.getId(), () ->
            assertEquals(75, productRepository.findById(productB.getId()).orElseThrow().getStockCurrent()));
    }

    @Test
    @DisplayName("No se puede crear un producto con la categoría de otra empresa")
    void cannotUseOtherTenantCategory() throws Exception {
        asA("POST", "/products",
            "{\"categoryId\":" + catB.getId() + ",\"name\":\"x\",\"sku\":\"NUEVO\",\"price\":1}")
            .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("El SKU es único por empresa: A no ve el SKU de B, pero sí choca con los suyos")
    void skuUniquenessIsPerTenant() throws Exception {
        asA("POST", "/products",
            "{\"categoryId\":" + catA.getId() + ",\"name\":\"x\",\"sku\":\"SKU-B2\",\"price\":1}")
            .andExpect(status().isCreated());                       // SKU-B2 solo existe en B
        asA("POST", "/products",
            "{\"categoryId\":" + catA.getId() + ",\"name\":\"x\",\"sku\":\"SKU-1\",\"price\":1}")
            .andExpect(status().isBadRequest());                    // SKU-1 ya es de A
    }

    // ───────────────────────────── Usuarios ─────────────────────────────

    @Test
    @DisplayName("Usuarios: el listado solo trae los de la propia empresa")
    void userListIsScoped() throws Exception {
        asA("GET", "/users?page=0&size=50", null)
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].username").value("adminA"));
        asA("GET", "/users", null).andExpect(jsonPath("$", hasSize(1)));
        asA("GET", "/users?search=vendedorB", null).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("Usuarios: no se puede editar, desactivar ni borrar a un usuario de otra empresa")
    void cannotTouchOtherTenantUser() throws Exception {
        asA("PUT", "/users/" + adminB.getId(), "{\"role\":\"SELLER\",\"password\":\"Nueva1234\"}")
            .andExpect(status().isNotFound());
        asA("DELETE", "/users/" + adminB.getId(), null).andExpect(status().isNotFound());

        User untouched = userRepository.findById(adminB.getId()).orElseThrow();
        assertEquals(User.Role.ADMIN, untouched.getRole());
        assertTrue(untouched.getActive());
    }

    @Test
    @DisplayName("Usuarios: el correo es único en toda la plataforma; el username solo dentro de la empresa")
    void emailGlobalUsernamePerTenant() throws Exception {
        // correo de un usuario de B → rechazado aunque A no lo vea
        asA("POST", "/users", "{\"username\":\"otro\",\"email\":\"adminB@test.com\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isBadRequest());
        // username 'vendedorB' existe en B, pero en A está libre
        asA("POST", "/users", "{\"username\":\"vendedorB\",\"email\":\"nuevo@test.com\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isCreated());
        User created = userRepository.findByEmail("nuevo@test.com").orElseThrow();
        assertEquals(org.getId(), created.getOrganizationId());
    }

    @Test
    @DisplayName("Un administrador de empresa no puede crear ni asignar un rol de plataforma")
    void cannotEscalateToPlatformAdmin() throws Exception {
        asA("POST", "/users",
            "{\"username\":\"jefe\",\"email\":\"jefe@test.com\",\"password\":\"Abcdef12\",\"role\":\"PLATFORM_OWNER\"}")
            .andExpect(status().isBadRequest());
        User seller = createUser("vendedorA", User.Role.SELLER);
        asA("PUT", "/users/" + seller.getId(), "{\"role\":\"PLATFORM_OWNER\"}").andExpect(status().isBadRequest());
        assertEquals(User.Role.SELLER, userRepository.findById(seller.getId()).orElseThrow().getRole());
    }

    // ───────────────────────────── Capa de datos ─────────────────────────────

    @Test
    @DisplayName("Repositorios: findAll y findById solo ven la empresa actual")
    void repositoriesAreFiltered() {
        assertEquals(2, productRepository.findAll().size());
        assertTrue(productRepository.findById(productB.getId()).isEmpty());
        assertTrue(saleRepository.findById(saleB.getId()).isEmpty());
        assertEquals(1, categoryRepository.findAll().size());
    }

    @Test
    @DisplayName("Sin empresa en el contexto no se lee nada y lo que se escriba queda invisible para todos")
    void noTenantFailsClosed() {
        TenantContext.clear();
        assertTrue(productRepository.findAll().isEmpty());
        assertTrue(saleRepository.findAll().isEmpty());
        // En MySQL la clave foránea rechaza la escritura; en H2 (sin FK) la fila queda con empresa
        // inexistente. En ambos casos ninguna empresa real puede verla.
        try {
            productRepository.saveAndFlush(Product.builder().category(catA).name("x").sku("NOPE")
                .price(java.math.BigDecimal.ONE).build());
        } catch (Exception expected) {
            // aceptable: la base de datos lo rechazó
        }
        TenantContext.set(org.getId());
        assertTrue(productRepository.findAll().stream().noneMatch(p -> "NOPE".equals(p.getSku())));
    }

    // ───────────────────────────── Tokens ─────────────────────────────

    @Test
    @DisplayName("Un PLATFORM_OWNER no accede a los datos de negocio de ninguna empresa")
    void platformAdminHasNoBusinessAccess() throws Exception {
        User owner = createUser("dueno", User.Role.PLATFORM_OWNER);
        String auth = bearer(owner);
        mvc.perform(get("/products").header("Authorization", auth)).andExpect(status().isForbidden());
        mvc.perform(get("/users").header("Authorization", auth)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Un token de ADMIN/SELLER sin empresa no concede acceso")
    void tokenWithoutOrganization() throws Exception {
        User noOrg = User.builder().id(99L).organizationId(null).username("x").email("x@test.com")
            .passwordHash("h").role(User.Role.ADMIN).active(true).build();
        mvc.perform(get("/products").header("Authorization", bearer(noOrg))).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("El token lleva la empresa del usuario")
    void tokenCarriesOrganization() {
        String token = bearer(adminB).substring(7);
        assertEquals(orgB.getId(), jwtConfig.extractOrganizationId(token));
        assertEquals("adminb@test.com", jwtConfig.extractUsername(token).toLowerCase());
    }
}
