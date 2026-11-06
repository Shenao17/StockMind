package com.stockmind.controller;

import com.stockmind.dto.SaleDTO;
import com.stockmind.model.Sale;
import jakarta.validation.Valid;
import com.stockmind.service.SaleService;
import com.stockmind.util.Paging;
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

    private static final Set<String> SORT_FIELDS = Set.of("id", "createdAt", "total");

    /**
     * GET /sales
     * Filtros: from, to (yyyy-MM-dd), status, userId
     * Paginación opcional: page (base 0), size (1-100), sort, dir (asc|desc)
     *  - Con page o size → { content, page, size, totalElements, totalPages }
     *  - Sin ellos       → arreglo (comportamiento anterior)
     */
    @GetMapping
    public ResponseEntity<?> getAll(@RequestParam(required = false) String from,
                                    @RequestParam(required = false) String to,
                                    @RequestParam(required = false) Sale.Status status,
                                    @RequestParam(required = false) Long userId,
                                    @RequestParam(required = false) Integer page,
                                    @RequestParam(required = false) Integer size,
                                    @RequestParam(required = false) String sort,
                                    @RequestParam(required = false) String dir) {
        LocalDateTime fromDt = (from == null || from.isBlank()) ? null
            : LocalDateTime.parse(from + "T00:00:00");
        LocalDateTime toDt = (to == null || to.isBlank()) ? null
            : LocalDateTime.parse(to + "T23:59:59");

        if (Paging.isRequested(page, size)) {
            Pageable pageable = Paging.of(page, size, sort, dir, SORT_FIELDS,
                Sort.by(Sort.Direction.DESC, "createdAt", "id"));
            return ResponseEntity.ok(saleService.search(fromDt, toDt, status, userId, pageable));
        }
        if (fromDt != null && toDt != null) {
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
