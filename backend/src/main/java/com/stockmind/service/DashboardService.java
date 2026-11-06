package com.stockmind.service;

import com.stockmind.model.Product;
import com.stockmind.model.Sale;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.SaleRepository;
import com.stockmind.repository.spec.ProductSpecs;
import com.stockmind.repository.spec.SaleSpecs;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * DashboardService — Indicadores del panel principal calculados en la base de datos.
 *
 * Reemplaza la carga de TODAS las ventas y productos hacia el navegador: aquí solo
 * viajan contadores, totales y unas pocas filas (stock crítico y ventas recientes).
 * "Hoy" y "mes" usan el mismo reloj (LocalDateTime.now) con el que se guarda createdAt.
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final int LOW_STOCK_ITEMS = 10;
    private static final int RECENT_SALES = 8;

    private final ProductRepository productRepository;
    private final SaleRepository saleRepository;

    @Transactional(readOnly = true)
    public Map<String, Object> summary() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startOfDay = now.toLocalDate().atStartOfDay();
        LocalDateTime startOfMonth = now.toLocalDate().withDayOfMonth(1).atStartOfDay();
        LocalDateTime endOfToday = now.toLocalDate().atTime(23, 59, 59);

        long activeProducts = productRepository.count(ProductSpecs.filter(null, null, false));
        var lowStockSpec = ProductSpecs.filter(null, null, true);
        long lowStockCount = productRepository.count(lowStockSpec);
        List<Product> lowStockItems = productRepository.findAll(lowStockSpec,
            PageRequest.of(0, LOW_STOCK_ITEMS, Sort.by("stockCurrent").and(Sort.by("name")))).getContent();

        List<Sale> recentSales = saleRepository.findAll(SaleSpecs.filter(null, null, null, null),
            PageRequest.of(0, RECENT_SALES, Sort.by(Sort.Direction.DESC, "createdAt", "id"))).getContent();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("activeProducts", activeProducts);
        out.put("lowStockCount", lowStockCount);
        out.put("lowStockItems", lowStockItems);
        out.put("salesToday", salesBlock(startOfDay, endOfToday));
        out.put("salesMonth", salesBlock(startOfMonth, endOfToday));
        out.put("recentSales", recentSales);
        return out;
    }

    private Map<String, Object> salesBlock(LocalDateTime from, LocalDateTime to) {
        BigDecimal total = saleRepository.sumTotalByPeriod(from, to);
        long count = saleRepository.count(SaleSpecs.filter(from, to, Sale.Status.COMPLETED, null));
        Map<String, Object> block = new LinkedHashMap<>();
        block.put("total", total == null ? BigDecimal.ZERO : total);
        block.put("count", count);
        return block;
    }
}
