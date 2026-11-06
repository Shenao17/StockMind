package com.stockmind.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

/** Plan comercial. Precios en COP, SIN IVA. */
@Entity
@Table(name = "plans")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Plan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "price_monthly", nullable = false)
    private Long priceMonthly;

    @Column(name = "price_yearly", nullable = false)
    private Long priceYearly;

    @Column(name = "max_users", nullable = false)
    private Integer maxUsers;

    @Column(name = "max_products", nullable = false)
    private Integer maxProducts;

    @Column(name = "extra_user_price", nullable = false)
    @Builder.Default
    private Long extraUserPrice = 0L;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    /** Funciones premium incluidas (REPORTS, PREDICTIONS, EXPORT, AI_ASSISTANT, API). */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "plan_features", joinColumns = @JoinColumn(name = "plan_id"))
    @Column(name = "feature", length = 30)
    @Builder.Default
    private Set<String> features = new HashSet<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
