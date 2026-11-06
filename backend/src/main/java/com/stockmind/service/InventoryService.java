package com.stockmind.service;

import com.stockmind.dto.InventoryDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.InventoryMovement;
import com.stockmind.model.InventoryMovement.MovementType;
import com.stockmind.model.Product;
import com.stockmind.model.User;
import com.stockmind.repository.InventoryMovementRepository;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * InventoryService — Movimientos manuales de inventario
 *
 * Solo ENTRY, EXIT y ADJUSTMENT se registran a mano. SALE los crea el módulo de
 * ventas y RETURN no está habilitado todavía.
 *
 * Igual que en ventas, el producto se lee con bloqueo pesimista y todo ocurre en
 * una sola transacción (stock + movimiento).
 */
@Service
@RequiredArgsConstructor
public class InventoryService {

    private final InventoryMovementRepository movementRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;

    @Transactional
    public InventoryMovement registerMovement(String username, InventoryDTO.MovementRequest request) {
        MovementType type = request.getType();
        if (type == MovementType.SALE || type == MovementType.RETURN) {
            throw new IllegalStateException(
                "El tipo " + type + " no se puede registrar manualmente");
        }

        Product product = productRepository.findByIdForUpdate(request.getProductId())
            .orElseThrow(() -> new ResourceNotFoundException("Producto no encontrado"));
        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        int quantity = request.getQuantity();
        int stockBefore = product.getStockCurrent();
        // ENTRY suma; EXIT y ADJUSTMENT restan (comportamiento existente)
        int delta = (type == MovementType.ENTRY) ? quantity : -quantity;
        int stockAfter = stockBefore + delta;

        if (stockAfter < 0) {
            throw new IllegalStateException("El stock resultante no puede ser negativo");
        }

        product.setStockCurrent(stockAfter);
        productRepository.save(product);

        InventoryMovement movement = InventoryMovement.builder()
            .product(product)
            .user(user)
            .type(type)
            .quantity(delta)
            .reason(request.getReason())
            .stockBefore(stockBefore)
            .stockAfter(stockAfter)
            .build();

        return movementRepository.save(movement);
    }
}
