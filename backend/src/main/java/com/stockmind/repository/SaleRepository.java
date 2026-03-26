package com.stockmind.repository;

import com.stockmind.model.Sale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Repositorio: Sale
 */
@Repository
public interface SaleRepository extends JpaRepository<Sale, Long> {

    List<Sale> findByCreatedAtBetweenOrderByCreatedAtDesc(
        LocalDateTime from, LocalDateTime to);

    List<Sale> findByUserIdOrderByCreatedAtDesc(Long userId);

    @Query("SELECT SUM(s.total) FROM Sale s WHERE s.status = 'COMPLETED' " +
           "AND s.createdAt BETWEEN :from AND :to")
    BigDecimal sumTotalByPeriod(@Param("from") LocalDateTime from,
                                 @Param("to") LocalDateTime to);

    /**
     * Top productos más vendidos por cantidad total en un período.
     * Retorna array de [productId, productName, totalQty, totalRevenue]
     */
    @Query("SELECT sd.product.id, sd.product.name, SUM(sd.quantity), SUM(sd.subtotal) " +
           "FROM SaleDetail sd JOIN sd.sale s " +
           "WHERE s.status = 'COMPLETED' AND s.createdAt BETWEEN :from AND :to " +
           "GROUP BY sd.product.id, sd.product.name " +
           "ORDER BY SUM(sd.quantity) DESC")
    List<Object[]> findTopProductsByPeriod(@Param("from") LocalDateTime from,
                                            @Param("to") LocalDateTime to);
}
