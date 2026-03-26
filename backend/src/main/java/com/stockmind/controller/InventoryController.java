package com.stockmind.controller;

import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.InventoryMovement;
import com.stockmind.model.Product;
import com.stockmind.model.User;
import com.stockmind.repository.InventoryMovementRepository;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * InventoryController — Movimientos manuales de inventario
 *
 * GET  /inventory/movements              → Historial completo
 * GET  /inventory/movements?productId=N  → Filtrado por producto
 * POST /inventory/movements              → Registrar movimiento manual (ENTRY, EXIT, ADJUSTMENT)
 */
@RestController
@RequestMapping("/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final InventoryMovementRepository movementRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    @GetMapping("/movements")
    public ResponseEntity<List<InventoryMovement>> getMovements(
            @RequestParam(required = false) Long productId) {

        if (productId != null) {
            return ResponseEntity.ok(
                movementRepository.findByProductIdOrderByCreatedAtDesc(productId));
        }
        return ResponseEntity.ok(movementRepository.findAll());
    }

    @PostMapping("/movements")
    public ResponseEntity<?> registerMovement(@RequestBody Map<String, Object> body,
                                               Authentication authentication) {
        try {
            Long productId = Long.parseLong(body.get("productId").toString());
            String typeStr = body.get("type").toString();
            Integer quantity = Integer.parseInt(body.get("quantity").toString());
            String reason = body.containsKey("reason") ? body.get("reason").toString() : null;

            Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Producto no encontrado"));

            User user = userRepository.findByUsername(authentication.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

            InventoryMovement.MovementType type =
                InventoryMovement.MovementType.valueOf(typeStr);

            int stockBefore = product.getStockCurrent();
            int delta = (type == InventoryMovement.MovementType.ENTRY) ? quantity : -quantity;
            int stockAfter = stockBefore + delta;

            if (stockAfter < 0) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "El stock resultante no puede ser negativo"));
            }

            product.setStockCurrent(stockAfter);
            productRepository.save(product);

            InventoryMovement movement = InventoryMovement.builder()
                .product(product)
                .user(user)
                .type(type)
                .quantity(delta)
                .reason(reason)
                .stockBefore(stockBefore)
                .stockAfter(stockAfter)
                .build();

            return ResponseEntity.status(HttpStatus.CREATED)
                .body(movementRepository.save(movement));

        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "Tipo de movimiento inválido: " + body.get("type")));
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
