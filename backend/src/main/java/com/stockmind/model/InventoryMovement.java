package com.stockmind.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;

/**
 * Entidad: InventoryMovement
 * Registro inmutable de cada movimiento de inventario.
 * Actúa como ledger de auditoría: cada entrada, salida, venta o ajuste
 * queda registrada con el stock anterior y posterior para trazabilidad completa.
 */
@Entity
@Table(name = "inventory_movements")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InventoryMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MovementType type;

    /**
     * Positivo para entradas, negativo para salidas.
     */
    @Column(nullable = false)
    private Integer quantity;

    @Column(length = 255)
    private String reason;

    @Column(name = "stock_before", nullable = false)
    private Integer stockBefore;

    @Column(name = "stock_after", nullable = false)
    private Integer stockAfter;

    /**
     * ID de la venta relacionada (si el tipo es SALE).
     */
    @Column(name = "reference_id")
    private Long referenceId;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    public enum MovementType {
        ENTRY,      // Entrada de inventario (compra/recepción)
        EXIT,       // Salida manual (merma, pérdida)
        SALE,       // Salida por venta registrada
        ADJUSTMENT, // Ajuste por conteo físico
        RETURN      // Devolución de cliente
    }
}
