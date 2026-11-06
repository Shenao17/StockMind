package com.stockmind.controller;

import com.stockmind.dto.InventoryDTO;
import com.stockmind.dto.PageResponse;
import com.stockmind.model.InventoryMovement;
import com.stockmind.repository.InventoryMovementRepository;
import com.stockmind.repository.spec.MovementSpecs;
import com.stockmind.service.InventoryService;
import com.stockmind.util.Paging;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Set;

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

    private static final Set<String> SORT_FIELDS = Set.of("id", "createdAt", "quantity");

    /**
     * GET /inventory/movements
     * Filtros: productId, type, from, to (yyyy-MM-dd)
     * Paginación opcional: page (base 0), size (1-100), sort, dir (asc|desc)
     *  - Con page o size → { content, page, size, totalElements, totalPages }
     *  - Sin ellos       → arreglo (comportamiento anterior)
     */
    @GetMapping("/movements")
    public ResponseEntity<?> getMovements(
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) InventoryMovement.MovementType type,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String dir) {

        LocalDateTime fromDt = (from == null || from.isBlank()) ? null
            : LocalDateTime.parse(from + "T00:00:00");
        LocalDateTime toDt = (to == null || to.isBlank()) ? null
            : LocalDateTime.parse(to + "T23:59:59");
        var spec = MovementSpecs.filter(productId, type, fromDt, toDt);

        if (Paging.isRequested(page, size)) {
            Pageable pageable = Paging.of(page, size, sort, dir, SORT_FIELDS,
                Sort.by(Sort.Direction.DESC, "createdAt", "id"));
            return ResponseEntity.ok(PageResponse.of(movementRepository.findAll(spec, pageable)));
        }
        if (productId != null && type == null && fromDt == null && toDt == null) {
            return ResponseEntity.ok(
                movementRepository.findByProductIdOrderByCreatedAtDesc(productId));
        }
        if (productId == null && type == null && fromDt == null && toDt == null) {
            return ResponseEntity.ok(movementRepository.findAll());
        }
        return ResponseEntity.ok(movementRepository.findAll(spec,
            Sort.by(Sort.Direction.DESC, "createdAt", "id")));
    }

    @PostMapping("/movements")
    public ResponseEntity<InventoryMovement> registerMovement(
            @Valid @RequestBody InventoryDTO.MovementRequest request,
            Authentication authentication) {
        InventoryMovement saved = inventoryService.registerMovement(authentication.getName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }
}
