package com.stockmind.service;

import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.*;
import com.stockmind.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import com.stockmind.dto.SaleDTO;

import java.util.ArrayList;
import java.util.Comparator;
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
     * Reglas de integridad:
     *  - El precio unitario SIEMPRE se toma de Product.price (nunca del cliente).
     *  - Cada producto se lee con bloqueo pesimista (SELECT ... FOR UPDATE), por lo
     *    que dos ventas concurrentes del mismo producto se serializan y el stock
     *    no puede quedar inconsistente.
     *  - Los productos se bloquean en orden de ID para evitar deadlocks entre
     *    ventas que incluyen los mismos productos en distinto orden.
     *  - Cada movimiento de inventario guarda directamente el ID de su venta.
     *
     * @param username Usuario que realiza la venta (del token JWT)
     * @param request  Líneas (productId, quantity) y notas
     * @return Venta persistida con todos sus detalles
     */
    @Transactional
    public Sale registerSale(String username, SaleDTO.Request request) {
        User seller = userRepository.findByUsername(username)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + username));

        Sale sale = Sale.builder()
            .user(seller)
            .notes(request.getNotes())
            .status(Sale.Status.COMPLETED)
            .details(new ArrayList<>())
            .build();

        List<SaleDTO.ItemRequest> items = new ArrayList<>(request.getItems());
        items.sort(Comparator.comparing(SaleDTO.ItemRequest::getProductId));

        BigDecimal total = BigDecimal.ZERO;
        List<InventoryMovement> movements = new ArrayList<>();

        for (SaleDTO.ItemRequest item : items) {
            Long productId = item.getProductId();
            int quantity = item.getQuantity();

            Product product = productRepository.findByIdForUpdate(productId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Producto no encontrado: ID " + productId));

            if (!product.getActive()) {
                throw new IllegalStateException(
                    "El producto '" + product.getName() + "' está inactivo");
            }

            if (product.getStockCurrent() < quantity) {
                throw new IllegalStateException(
                    "Stock insuficiente para '" + product.getName() +
                    "'. Disponible: " + product.getStockCurrent() +
                    ", solicitado: " + quantity);
            }

            SaleDetail detail = SaleDetail.builder()
                .sale(sale)
                .product(product)
                .quantity(quantity)
                .unitPrice(product.getPrice())
                .build();
            detail.calculateSubtotal();
            sale.getDetails().add(detail);
            total = total.add(detail.getSubtotal());

            int stockBefore = product.getStockCurrent();
            product.setStockCurrent(stockBefore - quantity);
            productRepository.save(product);

            movements.add(InventoryMovement.builder()
                .product(product)
                .user(seller)
                .type(InventoryMovement.MovementType.SALE)
                .quantity(-quantity)
                .reason("Venta registrada")
                .stockBefore(stockBefore)
                .stockAfter(product.getStockCurrent())
                .build());
        }

        sale.setTotal(total);
        Sale savedSale = saleRepository.save(sale);

        for (InventoryMovement movement : movements) {
            movement.setReferenceId(savedSale.getId());
            inventoryMovementRepository.save(movement);
        }

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
