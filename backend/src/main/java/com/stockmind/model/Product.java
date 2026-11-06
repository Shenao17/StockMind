package com.stockmind.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import jakarta.validation.constraints.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Entidad: Product
 * Núcleo del sistema. Contiene información de catálogo, precio y control de stock.
 * El campo stock_current es actualizado automáticamente en cada venta
 * o movimiento de inventario registrado por el servicio correspondiente.
 */
@Entity
@Table(name = "products", uniqueConstraints = @UniqueConstraint(name = "uk_products_org_sku", columnNames = {"organization_id", "sku"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Empresa dueña de la fila. Hibernate la filtra y la asigna solo (@TenantId). */
    @TenantId
    @JsonIgnore
    @Column(name = "organization_id", nullable = false, updatable = false)
    private Long organizationId;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @NotBlank(message = "El nombre del producto es obligatorio")
    @Column(nullable = false, length = 150)
    private String name;

    @NotBlank(message = "El SKU es obligatorio")
    @Column(nullable = false, length = 50)
    private String sku;

    @Column(columnDefinition = "TEXT")
    private String description;

    @NotNull(message = "El precio es obligatorio")
    @DecimalMin(value = "0.0", message = "El precio no puede ser negativo")
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal price;

    @Min(value = 0, message = "El stock actual no puede ser negativo")
    @Column(name = "stock_current", nullable = false)
    @Builder.Default
    private Integer stockCurrent = 0;

    @Min(value = 0, message = "El stock mínimo no puede ser negativo")
    @Column(name = "stock_minimum", nullable = false)
    @Builder.Default
    private Integer stockMinimum = 5;

    /**
     * Unidad de medida: UNIT, KG, LT, BOX
     */
    @Column(nullable = false, length = 20)
    @Builder.Default
    private String unit = "UNIT";

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    /**
     * Verifica si el stock actual está en nivel crítico
     * (por debajo o igual al stock mínimo configurado).
     */
    public boolean isLowStock() {
        return this.stockCurrent <= this.stockMinimum;
    }
}
