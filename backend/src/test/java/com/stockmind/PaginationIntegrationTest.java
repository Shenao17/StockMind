package com.stockmind;

import com.stockmind.dto.SaleDTO;
import com.stockmind.model.Category;
import com.stockmind.model.Product;
import com.stockmind.model.User;
import com.stockmind.service.SaleService;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Paginación, filtros, orden permitido y resumen del dashboard. */
class PaginationIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired SaleService saleService;

    String auth;
    Category electronics;
    Category food;

    @BeforeEach
    void setUp() {
        User admin = createUser("admin", User.Role.ADMIN);
        auth = bearer(admin);
        electronics = createCategory();
        food = createCategory();
    }

    private ResultActions api(String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", auth));
    }

    private Product product(Category c, String name, String sku, int stock, int min, String price) {
        return productRepository.save(Product.builder()
            .category(c).name(name).sku(sku).price(new BigDecimal(price))
            .stockCurrent(stock).stockMinimum(min).unit("UNIT").build());
    }

    private void sell(Product p, int qty) {
        SaleDTO.ItemRequest item = new SaleDTO.ItemRequest();
        item.setProductId(p.getId());
        item.setQuantity(qty);
        SaleDTO.Request r = new SaleDTO.Request();
        r.setItems(List.of(item));
        saleService.registerSale("admin", r);
    }

    // ───────────────────────────── Productos ─────────────────────────────

    @Test
    @DisplayName("Productos: páginas, totales y sobre de respuesta")
    void productPages() throws Exception {
        for (int i = 1; i <= 25; i++) product(electronics, String.format("Producto %02d", i), "SKU-" + i, 10, 2, "100.00");

        api("/products?page=0&size=10")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content", hasSize(10)))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(10))
            .andExpect(jsonPath("$.totalElements").value(25))
            .andExpect(jsonPath("$.totalPages").value(3))
            .andExpect(jsonPath("$.content[0].name").value("Producto 01"));
        api("/products?page=2&size=10")
            .andExpect(jsonPath("$.content", hasSize(5)))
            .andExpect(jsonPath("$.content[4].name").value("Producto 25"));
        api("/products?page=9&size=10")
            .andExpect(jsonPath("$.content", hasSize(0)))
            .andExpect(jsonPath("$.totalElements").value(25));
        // solo size → página 0 con ese tamaño; sin parámetros → arreglo (compatibilidad)
        api("/products?size=5").andExpect(jsonPath("$.content", hasSize(5)));
        api("/products").andExpect(jsonPath("$", hasSize(25)));
    }

    @Test
    @DisplayName("Productos: búsqueda por nombre/SKU (sin distinguir mayúsculas), categoría y stock bajo")
    void productFilters() throws Exception {
        product(electronics, "Mouse Logitech", "ELEC-001", 20, 5, "50.00");
        product(electronics, "Teclado Mecánico", "ELEC-002", 2, 5, "150.00");   // stock bajo
        product(food, "Arroz 5kg", "FOOD-001", 100, 10, "20.00");
        Product inactive = product(food, "Arroz viejo", "FOOD-002", 5, 1, "1.00");
        inactive.setActive(false);
        productRepository.save(inactive);

        api("/products?page=0&size=20&search=LOGI").andExpect(jsonPath("$.totalElements").value(1));
        api("/products?page=0&size=20&search=food").andExpect(jsonPath("$.totalElements").value(1)); // por SKU, sin el inactivo
        api("/products?page=0&size=20&categoryId=" + electronics.getId()).andExpect(jsonPath("$.totalElements").value(2));
        api("/products?page=0&size=20&lowStock=true")
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].sku").value("ELEC-002"));
        api("/products?page=0&size=20&search=arroz&categoryId=" + food.getId())
            .andExpect(jsonPath("$.totalElements").value(1));
        api("/products?page=0&size=20&search=zzz").andExpect(jsonPath("$.totalElements").value(0));
        // los filtros también funcionan sin paginar
        api("/products?search=mouse").andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    @DisplayName("Productos: los comodines % y _ de la búsqueda se tratan como texto, no como patrón")
    void searchWildcardsAreLiteral() throws Exception {
        product(electronics, "Producto normal", "A-1", 5, 1, "1.00");
        product(electronics, "Descuento 100% real", "A-2", 5, 1, "1.00");

        // .param() evita que MockMvc vuelva a codificar el texto de búsqueda
        mvc.perform(get("/products").header("Authorization", auth)
                .param("page", "0").param("size", "20").param("search", "%"))
            .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/products").header("Authorization", auth)
                .param("page", "0").param("size", "20").param("search", "_"))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    @DisplayName("Productos: orden permitido ascendente/descendente; orden por campo no permitido → 400")
    void productSorting() throws Exception {
        product(electronics, "B", "S-1", 5, 1, "30.00");
        product(electronics, "A", "S-2", 5, 1, "10.00");
        product(electronics, "C", "S-3", 5, 1, "20.00");

        api("/products?page=0&size=10&sort=price&dir=desc")
            .andExpect(jsonPath("$.content[0].name").value("B"))
            .andExpect(jsonPath("$.content[2].name").value("A"));
        api("/products?page=0&size=10&sort=price&dir=asc")
            .andExpect(jsonPath("$.content[0].name").value("A"));
        api("/products?page=0&size=10&sort=passwordHash").andExpect(status().isBadRequest());
        api("/products?page=0&size=10&sort=price&dir=sideways").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Paginación: page/size inválidos → 400")
    void invalidPagingParams() throws Exception {
        api("/products?page=-1&size=10").andExpect(status().isBadRequest());
        api("/products?page=0&size=0").andExpect(status().isBadRequest());
        api("/products?page=0&size=101").andExpect(status().isBadRequest());
        api("/products?page=abc&size=10").andExpect(status().isBadRequest());
        api("/products?page=0&size=100").andExpect(status().isOk());
    }

    // ───────────────────────────── Ventas ─────────────────────────────

    @Test
    @DisplayName("Ventas: paginadas de la más reciente a la más antigua, con filtros de fecha y estado")
    void salesPagination() throws Exception {
        createUser("vendedor", User.Role.SELLER);
        Product p = product(electronics, "Item", "I-1", 100, 1, "10.00");
        userRepository.save(userRepository.findByUsername("admin").orElseThrow());
        for (int i = 0; i < 7; i++) sell(p, 1);

        String today = LocalDate.now().toString();
        api("/sales?page=0&size=3")
            .andExpect(jsonPath("$.content", hasSize(3)))
            .andExpect(jsonPath("$.totalElements").value(7))
            .andExpect(jsonPath("$.totalPages").value(3));
        api("/sales?page=0&size=10&from=" + today + "&to=" + today)
            .andExpect(jsonPath("$.totalElements").value(7));
        api("/sales?page=0&size=10&from=2000-01-01&to=2000-01-02")
            .andExpect(jsonPath("$.totalElements").value(0));
        api("/sales?page=0&size=10&status=COMPLETED").andExpect(jsonPath("$.totalElements").value(7));
        api("/sales?page=0&size=10&status=CANCELLED").andExpect(jsonPath("$.totalElements").value(0));
        api("/sales?page=0&size=10&status=NOPE").andExpect(status().isBadRequest());
        api("/sales?page=0&size=10&from=hola").andExpect(status().isBadRequest());
        // sin paginar sigue devolviendo un arreglo
        api("/sales").andExpect(jsonPath("$", hasSize(7)));
    }

    // ───────────────────────────── Movimientos ─────────────────────────────

    @Test
    @DisplayName("Movimientos: filtro por producto y tipo, paginados")
    void movementFilters() throws Exception {
        Product a = product(electronics, "A", "M-1", 100, 1, "1.00");
        Product b = product(electronics, "B", "M-2", 100, 1, "1.00");
        sell(a, 1);
        sell(a, 1);
        sell(b, 1);

        api("/inventory/movements?page=0&size=10").andExpect(jsonPath("$.totalElements").value(3));
        api("/inventory/movements?page=0&size=10&productId=" + a.getId()).andExpect(jsonPath("$.totalElements").value(2));
        api("/inventory/movements?page=0&size=10&type=SALE").andExpect(jsonPath("$.totalElements").value(3));
        api("/inventory/movements?page=0&size=10&type=ENTRY").andExpect(jsonPath("$.totalElements").value(0));
        api("/inventory/movements?page=0&size=2")
            .andExpect(jsonPath("$.content", hasSize(2)))
            .andExpect(jsonPath("$.totalPages").value(2));
        api("/inventory/movements?productId=" + a.getId()).andExpect(jsonPath("$", hasSize(2)));
        api("/inventory/movements?page=0&size=10&type=NOPE").andExpect(status().isBadRequest());
    }

    // ───────────────────────────── Usuarios ─────────────────────────────

    @Test
    @DisplayName("Usuarios: búsqueda, filtro por rol y estado, paginados; nunca expone el hash")
    void userFilters() throws Exception {
        createUser("ana", User.Role.SELLER);
        createUser("beto", User.Role.SELLER);
        User off = createUser("carlos", User.Role.SELLER);
        off.setActive(false);
        userRepository.save(off);

        api("/users?page=0&size=10").andExpect(jsonPath("$.totalElements").value(4));
        api("/users?page=0&size=10&search=AN").andExpect(jsonPath("$.totalElements").value(1));
        api("/users?page=0&size=10&search=test.com").andExpect(jsonPath("$.totalElements").value(4)); // por correo
        api("/users?page=0&size=10&role=ADMIN").andExpect(jsonPath("$.totalElements").value(1));
        api("/users?page=0&size=10&active=false")
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].username").value("carlos"));
        api("/users?page=0&size=2").andExpect(jsonPath("$.totalPages").value(2));
        api("/users?page=0&size=10").andExpect(jsonPath("$.content[0].passwordHash").doesNotExist());
        api("/users?page=0&size=10&sort=passwordHash").andExpect(status().isBadRequest());
        api("/users").andExpect(jsonPath("$", hasSize(4)));
    }

    @Test
    @DisplayName("Categorías: lista completa ordenada por nombre, accesible para SELLER")
    void categories() throws Exception {
        categoryRepository.save(Category.builder().name("Zeta").build());
        categoryRepository.save(Category.builder().name("Alfa").build());
        String seller = bearer(createUser("vendedor", User.Role.SELLER));
        mvc.perform(get("/categories").header("Authorization", seller))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.name=='Alfa')]").exists())
            .andExpect(jsonPath("$", hasSize(4)));   // 2 de setUp + Alfa + Zeta
    }

    // ───────────────────────────── Dashboard ─────────────────────────────

    @Test
    @DisplayName("Dashboard: contadores y totales calculados en el servidor")
    void dashboardSummary() throws Exception {
        Product ok = product(electronics, "Normal", "D-1", 50, 5, "100.00");
        product(electronics, "Critico", "D-2", 1, 5, "10.00");
        sell(ok, 2);
        sell(ok, 1);

        api("/dashboard/summary")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.activeProducts").value(2))
            .andExpect(jsonPath("$.lowStockCount").value(1))
            .andExpect(jsonPath("$.lowStockItems", hasSize(1)))
            .andExpect(jsonPath("$.salesToday.count").value(2))
            .andExpect(jsonPath("$.salesToday.total").value(300.00))
            .andExpect(jsonPath("$.salesMonth.count").value(2))
            .andExpect(jsonPath("$.recentSales", hasSize(2)));
    }

    @Test
    @DisplayName("Dashboard: lo puede ver un SELLER; sin sesión no")
    void dashboardAccess() throws Exception {
        String seller = bearer(createUser("vendedor", User.Role.SELLER));
        mvc.perform(get("/dashboard/summary").header("Authorization", seller)).andExpect(status().isOk());
        mvc.perform(get("/dashboard/summary")).andExpect(status().isForbidden());
    }
}
