package com.stockmind.repository;

import com.stockmind.model.InventoryMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Repositorio: InventoryMovement
 */
@Repository
public interface InventoryMovementRepository extends JpaRepository<InventoryMovement, Long>, JpaSpecificationExecutor<InventoryMovement> {

    /**
     * Redeclarado con JPQL a propósito: el método heredado usa EntityManager.find(), que en
     * Hibernate NO aplica el filtro de empresa (@TenantId) y permitiría leer por id datos de
     * otra empresa. La consulta JPQL sí lo aplica. Un test de arquitectura impide quitarlo.
     */
    @Query("SELECT m FROM InventoryMovement m WHERE m.id = :id")
    java.util.Optional<InventoryMovement> findById(@Param("id") Long id);


    List<InventoryMovement> findByProductIdOrderByCreatedAtDesc(Long productId);

    List<InventoryMovement> findByCreatedAtBetweenOrderByCreatedAtDesc(
        LocalDateTime from, LocalDateTime to);

    List<InventoryMovement> findByTypeOrderByCreatedAtDesc(
        InventoryMovement.MovementType type);
}
