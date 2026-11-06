package com.stockmind.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;

// =============================================================================
// ProductDTO — Para crear o actualizar un producto
// =============================================================================
public class ProductDTO {

    @Data
    public static class Request {

        @NotNull(message = "La categoría es obligatoria")
        private Long categoryId;

        @NotBlank(message = "El nombre es obligatorio")
        @Size(max = 150, message = "El nombre no puede superar 150 caracteres")
        private String name;

        @NotBlank(message = "El SKU es obligatorio")
        @Size(max = 50, message = "El SKU no puede superar 50 caracteres")
        private String sku;

        @Size(max = 2000, message = "La descripción no puede superar 2000 caracteres")
        private String description;

        @NotNull(message = "El precio es obligatorio")
        @DecimalMin(value = "0.0", message = "El precio no puede ser negativo")
        @Digits(integer = 10, fraction = 2, message = "El precio admite hasta 10 enteros y 2 decimales")
        private BigDecimal price;

        // Solo se usa al crear; después el stock cambia únicamente con movimientos y ventas
        @Min(value = 0, message = "El stock actual no puede ser negativo")
        @Max(value = 100000000, message = "El stock actual es demasiado grande")
        private Integer stockCurrent = 0;

        @Min(value = 0, message = "El stock mínimo no puede ser negativo")
        @Max(value = 100000000, message = "El stock mínimo es demasiado grande")
        private Integer stockMinimum = 5;

        @Pattern(regexp = "^(UNIT|KG|LT|BOX)$", message = "La unidad debe ser UNIT, KG, LT o BOX")
        private String unit = "UNIT";
    }
}
