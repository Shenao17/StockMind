package com.stockmind.repository;

import com.stockmind.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
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
public interface ProductRepository extends JpaRepository<Product, Long> {

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
