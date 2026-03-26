package com.stockmind.service;

import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.*;
import com.stockmind.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * SaleService — Servicio de ventas
 *
 * Contiene la lógica de negocio más crítica del sistema:
 * el registro de una venta implica:
 *   1. Validar stock disponible por producto
 *   2. Calcular subtotales y total
 *   3. Persistir la venta y sus detalles (transacción ACID)
 *   4. Descontar el stock del producto
 *   5. Registrar el movimiento de inventario tipo SALE
 *
 * Todo ocurre en una sola transacción de base de datos.
 * Si cualquier paso falla, se hace rollback completo.
 */
@Service
@RequiredArgsConstructor
public class SaleService {

    private final SaleRepository saleRepository;
    private final ProductRepository productRepository;
    private final UserRepository userRepository;
    private final InventoryMovementRepository inventoryMovementRepository;

    /**
     * Registra una venta completa con descuento automático de inventario.
     *
     * @param username  Usuario que realiza la venta (del token JWT)
     * @param items     Lista de productos, cantidades y precios
     * @param notes     Notas opcionales de la venta
     * @return Venta persistida con todos sus detalles
     */
    @Transactional
    public Sale registerSale(String username,
                              List<Map<String, Object>> items,
                              String notes) {

        // 1. Obtener usuario autenticado
        User seller = userRepository.findByUsername(username)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));

        // 2. Construir cabecera de la venta
        Sale sale = Sale.builder()
            .user(seller)
            .notes(notes)
            .status(Sale.Status.COMPLETED)
            .details(new ArrayList<>())
            .build();

        BigDecimal total = BigDecimal.ZERO;

        // 3. Procesar cada ítem
        for (Map<String, Object> item : items) {
            Long productId = Long.parseLong(item.get("productId").toString());
            Integer quantity = Integer.parseInt(item.get("quantity").toString());
            BigDecimal unitPrice = new BigDecimal(item.get("unitPrice").toString());

            // 3a. Obtener producto con bloqueo pesimista para evitar race conditions
            Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Producto no encontrado: ID " + productId));

            if (!product.getActive()) {
                throw new IllegalStateException(
                    "El producto '" + product.getName() + "' está inactivo");
            }

            // 3b. Validar stock suficiente
            if (product.getStockCurrent() < quantity) {
                throw new IllegalStateException(
                    "Stock insuficiente para '" + product.getName() +
                    "'. Disponible: " + product.getStockCurrent() +
                    ", solicitado: " + quantity);
            }

            // 3c. Crear línea de detalle
            SaleDetail detail = SaleDetail.builder()
                .sale(sale)
                .product(product)
                .quantity(quantity)
                .unitPrice(unitPrice)
                .build();
            detail.calculateSubtotal();

            sale.getDetails().add(detail);
            total = total.add(detail.getSubtotal());

            // 3d. Descontar stock
            int stockBefore = product.getStockCurrent();
            product.setStockCurrent(stockBefore - quantity);
            productRepository.save(product);

            // 3e. Registrar movimiento de inventario
            InventoryMovement movement = InventoryMovement.builder()
                .product(product)
                .user(seller)
                .type(InventoryMovement.MovementType.SALE)
                .quantity(-quantity)
                .reason("Venta registrada")
                .stockBefore(stockBefore)
                .stockAfter(product.getStockCurrent())
                .build();

            inventoryMovementRepository.save(movement);
        }

        sale.setTotal(total);
        Sale savedSale = saleRepository.save(sale);

        // Actualizar referenceId en los movimientos con el ID de la venta
        inventoryMovementRepository.findByTypeOrderByCreatedAtDesc(
                InventoryMovement.MovementType.SALE)
            .stream()
            .filter(m -> m.getReferenceId() == null &&
                         m.getCreatedAt().isAfter(LocalDateTime.now().minusSeconds(5)))
            .forEach(m -> {
                m.setReferenceId(savedSale.getId());
                inventoryMovementRepository.save(m);
            });

        return savedSale;
    }

    public List<Sale> findAll() {
        return saleRepository.findAll();
    }

    public Sale findById(Long id) {
        return saleRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Venta no encontrada: ID " + id));
    }

    public List<Sale> findByPeriod(LocalDateTime from, LocalDateTime to) {
        return saleRepository.findByCreatedAtBetweenOrderByCreatedAtDesc(from, to);
    }
}
