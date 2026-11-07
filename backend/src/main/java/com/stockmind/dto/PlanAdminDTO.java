package com.stockmind.dto;

import com.stockmind.model.Plan;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Set;

/** Edición de planes por el dueño. Precios en COP, SIN IVA. */
public class PlanAdminDTO {

    public static final Set<String> FEATURES = Set.of("REPORTS", "PREDICTIONS", "EXPORT", "AI_ASSISTANT", "API");

    public record Row(String code, String name, long priceMonthly, long priceYearly, int maxUsers, int maxProducts,
                      long extraUserPrice, boolean active, int sortOrder, List<String> features, long subscribers) {
        public static Row of(Plan p, long subscribers) {
            return new Row(p.getCode(), p.getName(), p.getPriceMonthly(), p.getPriceYearly(), p.getMaxUsers(),
                p.getMaxProducts(), p.getExtraUserPrice(), Boolean.TRUE.equals(p.getActive()), p.getSortOrder(),
                p.getFeatures().stream().sorted().toList(), subscribers);
        }
    }

    @Data
    public static class Update {
        @NotBlank(message = "El nombre es obligatorio")
        @Size(min = 2, max = 50, message = "El nombre debe tener entre 2 y 50 caracteres")
        private String name;

        @NotNull(message = "El precio mensual es obligatorio")
        @Min(value = 1000, message = "El precio mensual debe ser de al menos $1.000")
        @Max(value = 100_000_000, message = "El precio mensual es demasiado alto")
        private Long priceMonthly;

        @NotNull(message = "El precio anual es obligatorio")
        @Min(value = 1000, message = "El precio anual debe ser de al menos $1.000")
        @Max(value = 1_000_000_000, message = "El precio anual es demasiado alto")
        private Long priceYearly;

        @NotNull(message = "El límite de usuarios es obligatorio")
        @Min(value = 1, message = "El límite de usuarios debe ser al menos 1")
        @Max(value = 10_000, message = "El límite de usuarios es demasiado alto")
        private Integer maxUsers;

        @NotNull(message = "El límite de productos es obligatorio")
        @Min(value = 1, message = "El límite de productos debe ser al menos 1")
        @Max(value = 1_000_000, message = "El límite de productos es demasiado alto")
        private Integer maxProducts;

        @NotNull(message = "El precio del usuario adicional es obligatorio")
        @Min(value = 0, message = "El precio del usuario adicional no puede ser negativo")
        @Max(value = 10_000_000, message = "El precio del usuario adicional es demasiado alto")
        private Long extraUserPrice;

        @NotNull(message = "Indica si el plan está activo")
        private Boolean active;

        @NotNull(message = "Las funciones son obligatorias (puede ser una lista vacía)")
        private Set<String> features;

        @NotBlank(message = "Confirma con tu PIN")
        @Size(max = 20)
        private String pin;
    }
}
