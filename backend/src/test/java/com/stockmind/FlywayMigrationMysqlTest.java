package com.stockmind;

import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Solo corre cuando MYSQL_TEST_URL está definida (CI con servicio MySQL).
 * El simple hecho de arrancar el contexto ya prueba dos cosas: que las migraciones
 * de Flyway se aplican sobre una base vacía y que Hibernate (ddl-auto=validate)
 * confirma que las entidades coinciden con el esquema resultante.
 */
@EnabledIfEnvironmentVariable(named = "MYSQL_TEST_URL", matches = ".+")
class FlywayMigrationMysqlTest extends IntegrationTestBase {

    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("Flyway aplicó V1 correctamente")
    void baselineApplied() {
        Integer failed = jdbc.queryForObject(
            "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 0", Integer.class);
        assertEquals(0, failed);
        String v1 = jdbc.queryForObject(
            "SELECT description FROM flyway_schema_history WHERE version = '1'", String.class);
        assertEquals("baseline schema", v1);
    }

    @Test
    @DisplayName("Existen todas las tablas del esquema")
    void tablesExist() {
        for (String table : new String[]{"users", "categories", "products", "sales",
                "sale_details", "inventory_movements", "demand_predictions"}) {
            Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables "
                    + "WHERE table_schema = DATABASE() AND table_name = ?", Integer.class, table);
            assertEquals(1, n, "falta la tabla " + table);
        }
    }

    @Test
    @DisplayName("MySQL hace cumplir las restricciones: stock no negativo y SKU único")
    void databaseConstraintsHold() {
        var category = createCategory();
        var product = createProduct(category, 5, "10.00");

        assertThrows(DataAccessException.class, () ->
            jdbc.update("UPDATE products SET stock_current = -1 WHERE id = ?", product.getId()));

        assertThrows(DataAccessException.class, () ->
            jdbc.update("INSERT INTO products (category_id, name, sku, price) VALUES (?, 'dup', ?, 1)",
                category.getId(), product.getSku()));
    }
}
