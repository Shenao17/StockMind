package com.stockmind;

import com.stockmind.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Salvaguarda de diseño: EntityManager.find() ignora el filtro de empresa (@TenantId), así que
 * todo repositorio de entidades con empresa DEBE redeclarar findById con una consulta JPQL.
 * Si alguien lo elimina, esta prueba falla antes de que exista una fuga entre empresas.
 */
class TenantArchitectureTest {

    @Test
    @DisplayName("Los repositorios de entidades con empresa redeclaran findById con @Query")
    void tenantRepositoriesOverrideFindById() throws Exception {
        List<Class<?>> repos = List.of(ProductRepository.class, CategoryRepository.class,
            SaleRepository.class, InventoryMovementRepository.class);
        for (Class<?> repo : repos) {
            Method m = repo.getDeclaredMethod("findById", Long.class);
            assertNotNull(m.getAnnotation(Query.class),
                repo.getSimpleName() + ".findById debe usar @Query para respetar el filtro de empresa");
        }
    }
}
