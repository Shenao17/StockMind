package com.stockmind;

import com.stockmind.dto.SaleDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.*;
import com.stockmind.service.SaleService;
import com.stockmind.tenant.TenantContext;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

/** Reglas de integridad del registro de ventas (precio, stock, trazabilidad, concurrencia). */
class SaleServiceIntegrationTest extends IntegrationTestBase {

    @Autowired SaleService saleService;

    Category category;

    @BeforeEach
    void setUp() {
        createUser("vendedor", User.Role.SELLER);
        category = createCategory();
    }

    private SaleDTO.Request request(Object... productIdQuantityPairs) {
        List<SaleDTO.ItemRequest> items = new ArrayList<>();
        for (int i = 0; i < productIdQuantityPairs.length; i += 2) {
            SaleDTO.ItemRequest item = new SaleDTO.ItemRequest();
            item.setProductId((Long) productIdQuantityPairs[i]);
            item.setQuantity((Integer) productIdQuantityPairs[i + 1]);
            items.add(item);
        }
        SaleDTO.Request r = new SaleDTO.Request();
        r.setItems(items);
        return r;
    }

    @Test
    @DisplayName("El precio y el total salen de la base de datos")
    void priceComesFromDatabase() {
        Product p = createProduct(category, 10, "45000.00");

        Sale sale = saleService.registerSale("vendedor@test.com", request(p.getId(), 2));

        assertEquals(0, new BigDecimal("90000.00").compareTo(sale.getTotal()));
        assertEquals(0, new BigDecimal("45000.00").compareTo(sale.getDetails().get(0).getUnitPrice()));
    }

    @Test
    @DisplayName("Descuenta el stock y deja un movimiento SALE con la referencia de la venta")
    void discountsStockAndLinksMovement() {
        Product p = createProduct(category, 10, "100.00");

        Sale sale = saleService.registerSale("vendedor@test.com", request(p.getId(), 3));

        assertEquals(7, productRepository.findById(p.getId()).orElseThrow().getStockCurrent());
        List<InventoryMovement> movs = movementRepository.findAll();
        assertEquals(1, movs.size());
        InventoryMovement m = movs.get(0);
        assertEquals(InventoryMovement.MovementType.SALE, m.getType());
        assertEquals(sale.getId(), m.getReferenceId());
        assertEquals(-3, m.getQuantity());
        assertEquals(10, m.getStockBefore());
        assertEquals(7, m.getStockAfter());
    }

    @Test
    @DisplayName("Stock insuficiente: rechaza la venta y no cambia nada")
    void insufficientStock() {
        Product p = createProduct(category, 2, "100.00");

        IllegalStateException ex = assertThrows(IllegalStateException.class,
            () -> saleService.registerSale("vendedor@test.com", request(p.getId(), 5)));

        assertTrue(ex.getMessage().contains("Stock insuficiente"));
        assertEquals(2, productRepository.findById(p.getId()).orElseThrow().getStockCurrent());
        assertEquals(0, saleRepository.count());
        assertEquals(0, movementRepository.count());
    }

    @Test
    @DisplayName("Si falla una línea, se revierte toda la venta (transacción)")
    void rollbackOnFailure() {
        Product ok = createProduct(category, 10, "100.00");
        Product poor = createProduct(category, 1, "100.00");

        assertThrows(IllegalStateException.class,
            () -> saleService.registerSale("vendedor@test.com", request(ok.getId(), 3, poor.getId(), 5)));

        assertEquals(10, productRepository.findById(ok.getId()).orElseThrow().getStockCurrent());
        assertEquals(0, saleRepository.count());
        assertEquals(0, movementRepository.count());
    }

    @Test
    @DisplayName("No se vende un producto inactivo ni inexistente")
    void inactiveOrMissingProduct() {
        Product p = createProduct(category, 10, "100.00");
        p.setActive(false);
        productRepository.save(p);

        assertThrows(IllegalStateException.class,
            () -> saleService.registerSale("vendedor@test.com", request(p.getId(), 1)));
        assertThrows(ResourceNotFoundException.class,
            () -> saleService.registerSale("vendedor@test.com", request(999999L, 1)));
    }

    @Test
    @DisplayName("Ventas simultáneas: nunca se vende más del stock disponible")
    void concurrentSalesNeverOversell() throws Exception {
        int stock = 5;
        int attempts = 12;
        Product p = createProduct(category, stock, "100.00");

        ExecutorService pool = Executors.newFixedThreadPool(attempts);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger rejected = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();

        Long orgId = org.getId();
        for (int i = 0; i < attempts; i++) {
            futures.add(pool.submit(() -> {
                start.await();
                TenantContext.set(orgId); // el contexto de empresa es por hilo
                try {
                    saleService.registerSale("vendedor@test.com", request(p.getId(), 1));
                    ok.incrementAndGet();
                } catch (IllegalStateException e) {
                    rejected.incrementAndGet();
                } finally {
                    TenantContext.clear();
                }
                return null;
            }));
        }
        start.countDown();
        for (Future<?> f : futures) f.get(30, TimeUnit.SECONDS);
        pool.shutdown();

        assertEquals(stock, ok.get(), "Deben aprobarse exactamente tantas ventas como unidades hay");
        assertEquals(attempts - stock, rejected.get());
        assertEquals(0, productRepository.findById(p.getId()).orElseThrow().getStockCurrent());
        assertEquals(stock, saleRepository.count());
        // cada movimiento apunta a una venta distinta y existente
        List<Long> refs = movementRepository.findAll().stream().map(InventoryMovement::getReferenceId).toList();
        assertEquals(stock, refs.stream().distinct().count());
        assertTrue(refs.stream().allMatch(r -> r != null && saleRepository.existsById(r)));
    }
}
