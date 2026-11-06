package com.stockmind.controller;

import com.stockmind.dto.InventoryDTO;
import com.stockmind.model.InventoryMovement;
import com.stockmind.repository.InventoryMovementRepository;
import com.stockmind.service.InventoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
    private final InventoryService inventoryService;

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
    public ResponseEntity<InventoryMovement> registerMovement(
            @Valid @RequestBody InventoryDTO.MovementRequest request,
            Authentication authentication) {
        InventoryMovement saved = inventoryService.registerMovement(authentication.getName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }
}
