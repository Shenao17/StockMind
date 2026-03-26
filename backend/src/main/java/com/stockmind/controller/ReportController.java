package com.stockmind.controller;

import com.stockmind.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

/**
 * ReportController — Reportes de ventas y analítica básica
 *
 * GET /reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD → Ventas por período
 * GET /reports/top-products?limit=10                 → Top productos más vendidos
 */
@RestController
@RequestMapping("/reports")
@RequiredArgsConstructor
public class ReportController {

    private final SaleRepository saleRepository;

    /**
     * Reporte de ventas en un rango de fechas.
     * Retorna: total vendido, número de transacciones, promedio por venta.
     */
    @GetMapping("/sales")
    public ResponseEntity<Map<String, Object>> salesReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) String from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) String to) {

        LocalDateTime fromDt = LocalDateTime.parse(from + "T00:00:00");
        LocalDateTime toDt   = LocalDateTime.parse(to + "T23:59:59");

        List<?> sales = saleRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(fromDt, toDt);
        BigDecimal totalRevenue = saleRepository.sumTotalByPeriod(fromDt, toDt);

        if (totalRevenue == null) totalRevenue = BigDecimal.ZERO;

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("from", from);
        report.put("to", to);
        report.put("totalTransactions", sales.size());
        report.put("totalRevenue", totalRevenue);
        report.put("averagePerSale", sales.isEmpty() ? 0
            : totalRevenue.divide(BigDecimal.valueOf(sales.size()), 2, java.math.RoundingMode.HALF_UP));
        report.put("sales", sales);

        return ResponseEntity.ok(report);
    }

    /**
     * Top N productos más vendidos en los últimos 30 días por defecto.
     */
    @GetMapping("/top-products")
    public ResponseEntity<List<Map<String, Object>>> topProducts(
            @RequestParam(defaultValue = "10") int limit) {

        LocalDateTime from = LocalDateTime.now().minusDays(30);
        LocalDateTime to   = LocalDateTime.now();

        List<Object[]> rows = saleRepository.findTopProductsByPeriod(from, to);

        List<Map<String, Object>> result = new ArrayList<>();
        int count = 0;
        for (Object[] row : rows) {
            if (count >= limit) break;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("productId",    row[0]);
            entry.put("productName",  row[1]);
            entry.put("totalQty",     row[2]);
            entry.put("totalRevenue", row[3]);
            result.add(entry);
            count++;
        }

        return ResponseEntity.ok(result);
    }
}
