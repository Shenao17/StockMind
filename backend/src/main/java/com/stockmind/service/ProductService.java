package com.stockmind.service;

import com.stockmind.billing.EntitlementService;
import com.stockmind.dto.PageResponse;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Product;
import com.stockmind.repository.ProductRepository;
import com.stockmind.repository.spec.ProductSpecs;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * ProductService — Servicio de gestión de productos
 */
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final EntitlementService entitlementService;

    public List<Product> findAll() {
        return productRepository.findByActiveTrue();
    }

    /** Listado sin paginar (compatibilidad), con los mismos filtros opcionales. */
    public List<Product> list(String search, Long categoryId, boolean lowStock) {
        return productRepository.findAll(
            ProductSpecs.filter(search, categoryId, lowStock), Sort.by("id"));
    }

    /** Listado paginado con filtros. */
    public PageResponse<Product> search(String search, Long categoryId, boolean lowStock, Pageable pageable) {
        return PageResponse.of(productRepository.findAll(
            ProductSpecs.filter(search, categoryId, lowStock), pageable));
    }

    public Product findById(Long id) {
        return productRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Producto no encontrado: ID " + id));
    }

    public List<Product> findLowStock() {
        return productRepository.findLowStockProducts();
    }

    public Product create(Product product) {
        entitlementService.assertCanAddProduct();
        if (productRepository.existsBySku(product.getSku())) {
            throw new IllegalArgumentException("Ya existe un producto con SKU: " + product.getSku());
        }
        return productRepository.save(product);
    }

    public Product update(Long id, Product updated) {
        Product existing = findById(id);
        existing.setName(updated.getName());
        existing.setDescription(updated.getDescription());
        existing.setPrice(updated.getPrice());
        existing.setStockMinimum(updated.getStockMinimum());
        existing.setUnit(updated.getUnit());
        existing.setCategory(updated.getCategory());
        return productRepository.save(existing);
    }

    public void softDelete(Long id) {
        Product product = findById(id);
        product.setActive(false);
        productRepository.save(product);
    }
}
