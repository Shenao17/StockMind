package com.stockmind.controller;

import com.stockmind.dto.SaleDTO;
import com.stockmind.model.Sale;
import jakarta.validation.Valid;
import com.stockmind.service.SaleService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

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
     *   "items": [ { "productId": 1, "quantity": 2 } ],
     *   "notes": "Venta mostrador"
     * }
     * El precio lo fija el servidor (Product.price); un "unitPrice" enviado se ignora.
     * Los errores de validación/negocio los resuelve GlobalExceptionHandler.
     */
    @PostMapping
    public ResponseEntity<Sale> create(@Valid @RequestBody SaleDTO.Request request,
                                       Authentication authentication) {
        Sale sale = saleService.registerSale(authentication.getName(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(sale);
    }
}
