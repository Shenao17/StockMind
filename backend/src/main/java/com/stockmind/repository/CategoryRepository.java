package com.stockmind.repository;

import com.stockmind.model.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repositorio: Category
 */
@Repository
public interface CategoryRepository extends JpaRepository<Category, Long> {

    /**
     * Redeclarado con JPQL a propósito: el método heredado usa EntityManager.find(), que en
     * Hibernate NO aplica el filtro de empresa (@TenantId) y permitiría leer por id datos de
     * otra empresa. La consulta JPQL sí lo aplica. Un test de arquitectura impide quitarlo.
     */
    @Query("SELECT c FROM Category c WHERE c.id = :id")
    java.util.Optional<Category> findById(@Param("id") Long id);

    Optional<Category> findByName(String name);
    boolean existsByName(String name);
}
