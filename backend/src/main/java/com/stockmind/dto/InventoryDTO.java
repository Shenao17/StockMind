package com.stockmind.dto;

import com.stockmind.model.InventoryMovement;
import jakarta.validation.constraints.*;
import lombok.Data;

// =============================================================================
// InventoryDTO — Para registrar movimientos manuales de inventario
// =============================================================================
public class InventoryDTO {

    @Data
    public static class MovementRequest {

        @NotNull(message = "El producto es obligatorio")
        private Long productId;

        // Valor fuera del enum → 400 (lo rechaza Jackson)
        @NotNull(message = "El tipo de movimiento es obligatorio")
        private InventoryMovement.MovementType type;

        // Siempre positivo: el sentido (suma o resta) lo define el tipo
        @NotNull(message = "La cantidad es obligatoria")
        @Min(value = 1, message = "La cantidad mínima es 1")
        @Max(value = 1000000, message = "La cantidad máxima por movimiento es 1000000")
        private Integer quantity;

        @Size(max = 255, message = "El motivo no puede superar 255 caracteres")
        private String reason;
    }
}
