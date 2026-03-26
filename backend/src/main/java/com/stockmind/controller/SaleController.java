package com.stockmind.controller;

import com.stockmind.model.Sale;
import com.stockmind.service.SaleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * SaleController — Registro y consulta de ventas
 *
 * GET  /sales        → Listar todas las ventas
 * GET  /sales/{id}   → Detalle de venta
 * POST /sales        → Registrar nueva venta (descuenta inventario automáticamente)
 */
@RestController
@RequestMapping("/sales")
@RequiredArgsConstructor
public class SaleController {

    private final SaleService saleService;

    @GetMapping
    public ResponseEntity<List<Sale>> getAll(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        if (from != null && to != null) {
            LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
            LocalDateTime toDt   = LocalDateTime.parse(to + "T23:59:59");
            return ResponseEntity.ok(saleService.findByPeriod(fromDt, toDt));
        }
        return ResponseEntity.ok(saleService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Sale> getById(@PathVariable Long id) {
        return ResponseEntity.ok(saleService.findById(id));
    }

    /**
     * POST /sales
     * Body esperado:
     * {
     *   "items": [
     *     { "productId": 1, "quantity": 2, "unitPrice": 45000.00 }
     *   ],
     *   "notes": "Venta mostrador"
     * }
     */
    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body,
                                     Authentication authentication) {
        try {
            String username = authentication.getName();
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items =
                (List<Map<String, Object>>) body.get("items");
            String notes = body.containsKey("notes") ? body.get("notes").toString() : null;

            if (items == null || items.isEmpty()) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "La venta debe contener al menos un producto"));
            }

            Sale sale = saleService.registerSale(username, items, notes);
            return ResponseEntity.status(HttpStatus.CREATED).body(sale);

        } catch (IllegalStateException e) {
            // Stock insuficiente u otro error de negocio
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .body(Map.of("error", "Error al registrar la venta: " + e.getMessage()));
        }
    }
}
