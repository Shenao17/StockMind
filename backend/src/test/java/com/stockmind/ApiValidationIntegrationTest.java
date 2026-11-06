package com.stockmind;

import com.stockmind.model.Category;
import com.stockmind.model.Product;
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
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Validación de entradas y forma de las respuestas de error. */
class ApiValidationIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;

    User admin;
    String auth;
    Category category;

    @BeforeEach
    void setUp() {
        admin = createUser("admin", User.Role.ADMIN);
        auth = bearer(admin);
        category = createCategory();
    }

    private ResultActions send(String method, String path, String json) throws Exception {
        var b = switch (method) {
            case "POST" -> post(path);
            case "PUT" -> put(path);
            case "DELETE" -> delete(path);
            case "PATCH" -> patch(path);
            default -> get(path);
        };
        return mvc.perform(b.header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content(json == null ? "" : json));
    }

    // ───────────────────────────── Usuarios ─────────────────────────────

    @Test
    @DisplayName("Usuarios: valida campos, contraseña y rol")
    void userValidation() throws Exception {
        send("POST", "/users", "{}").andExpect(status().isBadRequest());
        send("POST", "/users", "{\"username\":\"ab\",\"email\":\"x\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("correo")));
        send("POST", "/users", "{\"username\":\"nuevo\",\"email\":\"n@t.com\",\"password\":\"abc\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("contraseña")));
        send("POST", "/users", "{\"username\":\"nuevo\",\"email\":\"n@t.com\",\"password\":\"soloLetras\"}")
            .andExpect(status().isBadRequest());
        send("POST", "/users", "{\"username\":\"nuevo\",\"email\":\"n@t.com\",\"password\":\"Abcdef12\",\"role\":\"ROOT\"}")
            .andExpect(status().isBadRequest());
        send("POST", "/users", "{no es json").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Usuarios: crea con rol SELLER por defecto, normaliza el correo y no expone el hash")
    void createUserOk() throws Exception {
        send("POST", "/users", "{\"username\":\"nuevo\",\"email\":\"Nuevo@Test.COM\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.role").value("SELLER"))
            .andExpect(jsonPath("$.email").value("nuevo@test.com"))
            .andExpect(jsonPath("$.passwordHash").doesNotExist());
        User saved = userRepository.findByUsername("nuevo").orElseThrow();
        assertNotEquals("Abcdef12", saved.getPasswordHash());
        assertTrue(saved.getPasswordHash().startsWith("$2"), "la contraseña debe guardarse con BCrypt");
    }

    @Test
    @DisplayName("Usuarios: rechaza usuario o correo duplicado")
    void duplicateUser() throws Exception {
        send("POST", "/users", "{\"username\":\"admin\",\"email\":\"otro@t.com\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("usuario")));
        send("POST", "/users", "{\"username\":\"otro\",\"email\":\"admin@test.com\",\"password\":\"Abcdef12\"}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("correo")));
    }

    @Test
    @DisplayName("Usuarios: el admin no puede desactivarse, eliminarse ni quitarse el rol a sí mismo")
    void adminCannotLockSelfOut() throws Exception {
        send("PUT", "/users/" + admin.getId(), "{\"active\":false}").andExpect(status().isBadRequest());
        send("PUT", "/users/" + admin.getId(), "{\"role\":\"SELLER\"}").andExpect(status().isBadRequest());
        send("DELETE", "/users/" + admin.getId(), null).andExpect(status().isBadRequest());
        // Mantener su mismo rol sí está permitido
        send("PUT", "/users/" + admin.getId(), "{\"role\":\"ADMIN\"}").andExpect(status().isOk());
        assertTrue(userRepository.findById(admin.getId()).orElseThrow().getActive());
    }

    // ───────────────────────────── Productos ─────────────────────────────

    @Test
    @DisplayName("Productos: valida precio, stock, unidad y categoría")
    void productValidation() throws Exception {
        long cat = category.getId();
        send("POST", "/products", "{}").andExpect(status().isBadRequest());
        send("POST", "/products", "{\"categoryId\":" + cat + ",\"name\":\"x\",\"sku\":\"S1\",\"price\":-5}")
            .andExpect(status().isBadRequest());
        send("POST", "/products", "{\"categoryId\":" + cat + ",\"name\":\"x\",\"sku\":\"S1\",\"price\":1.234}")
            .andExpect(status().isBadRequest());
        send("POST", "/products", "{\"categoryId\":" + cat + ",\"name\":\"x\",\"sku\":\"S1\",\"price\":1,\"stockCurrent\":-1}")
            .andExpect(status().isBadRequest());
        send("POST", "/products", "{\"categoryId\":" + cat + ",\"name\":\"x\",\"sku\":\"S1\",\"price\":1,\"unit\":\"XX\"}")
            .andExpect(status().isBadRequest());
        send("POST", "/products", "{\"categoryId\":999999,\"name\":\"x\",\"sku\":\"S1\",\"price\":1}")
            .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Productos: crea con valores por defecto, recorta espacios y rechaza SKU duplicado")
    void productCreateAndDuplicateSku() throws Exception {
        long cat = category.getId();
        send("POST", "/products",
            "{\"categoryId\":" + cat + ",\"name\":\"  Mouse  \",\"sku\":\"MOU-1\",\"price\":10.5,"
                + "\"stockCurrent\":null,\"stockMinimum\":null,\"unit\":null}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value("Mouse"))
            .andExpect(jsonPath("$.stockCurrent").value(0))
            .andExpect(jsonPath("$.stockMinimum").value(5))
            .andExpect(jsonPath("$.unit").value("UNIT"));
        send("POST", "/products",
            "{\"categoryId\":" + cat + ",\"name\":\"Otro\",\"sku\":\"MOU-1\",\"price\":1}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("SKU")));
    }

    // ───────────────────────────── Inventario ─────────────────────────────

    @Test
    @DisplayName("Inventario: valida cantidad y tipo; SALE y RETURN no se registran a mano")
    void inventoryValidation() throws Exception {
        Product p = createProduct(category, 10, "100.00");
        String base = "{\"productId\":" + p.getId() + ",";
        send("POST", "/inventory/movements", "{}").andExpect(status().isBadRequest());
        send("POST", "/inventory/movements", base + "\"type\":\"ENTRY\",\"quantity\":0}").andExpect(status().isBadRequest());
        send("POST", "/inventory/movements", base + "\"type\":\"ENTRY\",\"quantity\":-5}").andExpect(status().isBadRequest());
        send("POST", "/inventory/movements", base + "\"type\":\"XX\",\"quantity\":1}").andExpect(status().isBadRequest());
        send("POST", "/inventory/movements", base + "\"type\":\"SALE\",\"quantity\":1}").andExpect(status().isBadRequest());
        send("POST", "/inventory/movements", base + "\"type\":\"RETURN\",\"quantity\":1}").andExpect(status().isBadRequest());
        send("POST", "/inventory/movements", "{\"productId\":999999,\"type\":\"ENTRY\",\"quantity\":1}")
            .andExpect(status().isNotFound());
        assertEquals(10, productRepository.findById(p.getId()).orElseThrow().getStockCurrent());
    }

    @Test
    @DisplayName("Inventario: entrada suma, salida resta y nunca deja stock negativo")
    void inventoryStockMath() throws Exception {
        Product p = createProduct(category, 10, "100.00");
        String base = "{\"productId\":" + p.getId() + ",";
        send("POST", "/inventory/movements", base + "\"type\":\"ENTRY\",\"quantity\":5}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.stockBefore").value(10))
            .andExpect(jsonPath("$.stockAfter").value(15));
        send("POST", "/inventory/movements", base + "\"type\":\"EXIT\",\"quantity\":4}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.stockAfter").value(11));
        send("POST", "/inventory/movements", base + "\"type\":\"EXIT\",\"quantity\":50}")
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error", containsString("negativo")));
        assertEquals(11, productRepository.findById(p.getId()).orElseThrow().getStockCurrent());
    }

    // ───────────────────────────── Ventas (API) ─────────────────────────────

    @Test
    @DisplayName("Ventas: ignora el unitPrice del cliente y valida el cuerpo")
    void salesApi() throws Exception {
        Product p = createProduct(category, 10, "45000.00");
        send("POST", "/sales", "{\"items\":[{\"productId\":" + p.getId() + ",\"quantity\":2,\"unitPrice\":1}]}")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.total").value(90000.00));
        send("POST", "/sales", "{}").andExpect(status().isBadRequest());
        send("POST", "/sales", "{\"items\":[]}").andExpect(status().isBadRequest());
        send("POST", "/sales", "{\"items\":[{\"productId\":" + p.getId() + ",\"quantity\":0}]}").andExpect(status().isBadRequest());
        send("POST", "/sales", "{\"items\":[{\"quantity\":1}]}").andExpect(status().isBadRequest());
        send("POST", "/sales", "{\"items\":[{\"productId\":999999,\"quantity\":1}]}").andExpect(status().isNotFound());
    }

    // ───────────────────────────── Errores ─────────────────────────────

    @Test
    @DisplayName("Errores: rutas, métodos, fechas y parámetros inválidos no producen 500")
    void errorShapes() throws Exception {
        send("GET", "/no-existe", null).andExpect(status().isNotFound());
        send("PATCH", "/products/1", null).andExpect(status().isMethodNotAllowed());
        send("GET", "/reports/sales?from=hola&to=2026-01-01", null).andExpect(status().isBadRequest());
        send("GET", "/reports/sales", null).andExpect(status().isBadRequest());
        send("GET", "/products/abc", null).andExpect(status().isBadRequest());
        send("GET", "/products/999999", null).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.timestamp").exists());
    }
}
