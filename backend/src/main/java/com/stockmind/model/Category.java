package com.stockmind.model;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import java.time.LocalDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * Entidad: Category
 * Clasificación de productos. Un producto pertenece a exactamente una categoría.
 */
@Entity
@Table(name = "categories", uniqueConstraints = @UniqueConstraint(name = "uk_categories_org_name", columnNames = {"organization_id", "name"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Empresa dueña de la fila. Hibernate la filtra y la asigna solo (@TenantId). */
    @TenantId
    @JsonIgnore
    @Column(name = "organization_id", nullable = false, updatable = false)
    private Long organizationId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(length = 255)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    // Relación inversa — no cargada en cascada para evitar N+1
    @JsonIgnore
    @OneToMany(mappedBy = "category", fetch = FetchType.LAZY)
    private List<Product> products;
}
