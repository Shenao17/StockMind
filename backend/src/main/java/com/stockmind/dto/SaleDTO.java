package com.stockmind.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

// =============================================================================
// ProductDTO — Para crear o actualizar un producto
// =============================================================================
class ProductDTO {

    @Data
    public static class Request {
        @NotNull(message = "La categoría es obligatoria")
        private Long categoryId;

        @NotBlank(message = "El nombre es obligatorio")
        private String name;

        @NotBlank(message = "El SKU es obligatorio")
        private String sku;

        private String description;

        @NotNull @DecimalMin("0.0")
        private BigDecimal price;

        @Min(0)
        private Integer stockCurrent = 0;

        @Min(0)
        private Integer stockMinimum = 5;

        private String unit = "UNIT";
    }

    @Data
    public static class Response {
        private Long id;
        private Long categoryId;
        private String categoryName;
        private String name;
        private String sku;
        private String description;
        private BigDecimal price;
        private Integer stockCurrent;
        private Integer stockMinimum;
        private String unit;
        private Boolean active;
        private Boolean lowStock;
        private LocalDateTime createdAt;
    }
}

// =============================================================================
// SaleDTO — Para registrar y consultar ventas
// =============================================================================
public class SaleDTO {

    @Data
    public static class ItemRequest {
        @NotNull(message = "El producto es obligatorio")
        private Long productId;

        @NotNull(message = "La cantidad es obligatoria")
        @Min(value = 1, message = "La cantidad mínima es 1")
        @Max(value = 100000, message = "La cantidad máxima por línea es 100000")
        private Integer quantity;

        // El precio unitario NO se acepta del cliente: lo fija el servidor
        // desde Product.price. Si el cliente lo envía, se ignora.
    }

    @Data
    public static class Request {
        @NotNull(message = "La venta debe tener al menos un producto")
        @Size(min = 1, max = 200, message = "La venta debe tener entre 1 y 200 productos")
        @Valid
        private List<ItemRequest> items;

        @Size(max = 255, message = "Las notas no pueden superar 255 caracteres")
        private String notes;
    }

    @Data
    public static class Response {
        private Long id;
        private Long userId;
        private String username;
        private BigDecimal total;
        private String status;
        private String notes;
        private List<DetailResponse> details;
        private LocalDateTime createdAt;
    }

    @Data
    public static class DetailResponse {
        private Long productId;
        private String productName;
        private String productSku;
        private Integer quantity;
        private BigDecimal unitPrice;
        private BigDecimal subtotal;
    }
}
