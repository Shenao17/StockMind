package com.stockmind.repository;

import com.stockmind.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repositorio: Product
 */
@Repository
public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

    /**
     * Redeclarado con JPQL a propósito: el método heredado usa EntityManager.find(), que en
     * Hibernate NO aplica el filtro de empresa (@TenantId) y permitiría leer por id datos de
     * otra empresa. La consulta JPQL sí lo aplica. Un test de arquitectura impide quitarlo.
     */
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    java.util.Optional<Product> findById(@Param("id") Long id);


    Optional<Product> findBySku(String sku);

    List<Product> findByActiveTrue();

    List<Product> findByCategoryIdAndActiveTrue(Long categoryId);

    /**
     * Retorna productos activos cuyo stock actual sea menor o igual al mínimo configurado.
     * Usado para alertas de stock bajo en dashboard y notificaciones.
     */
    @Query("SELECT p FROM Product p WHERE p.active = true AND p.stockCurrent <= p.stockMinimum")
    List<Product> findLowStockProducts();

    /**
     * Lee el producto con bloqueo pesimista de escritura (SELECT ... FOR UPDATE).
     * Garantiza que dos ventas concurrentes no lean el mismo stock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") Long id);

    boolean existsBySku(String sku);
}
