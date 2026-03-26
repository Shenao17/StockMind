package com.stockmind.controller;

import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Category;
import com.stockmind.model.Product;
import com.stockmind.repository.CategoryRepository;
import com.stockmind.service.ProductService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * ProductController — CRUD de productos
 *
 * GET    /products              → Listar todos los productos activos
 * GET    /products/low-stock    → Productos en stock crítico
 * GET    /products/{id}         → Detalle de un producto
 * POST   /products              → Crear producto
 * PUT    /products/{id}         → Actualizar producto
 * DELETE /products/{id}         → Soft delete (active = false)
 */
@RestController
@RequestMapping("/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;
    private final CategoryRepository categoryRepository;

    @GetMapping
    public ResponseEntity<List<Product>> getAll() {
        return ResponseEntity.ok(productService.findAll());
    }

    @GetMapping("/low-stock")
    public ResponseEntity<List<Product>> getLowStock() {
        return ResponseEntity.ok(productService.findLowStock());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.findById(id));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody Map<String, Object> body) {
        try {
            Product product = buildProductFromBody(body);
            Product saved = productService.create(product);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                     @RequestBody Map<String, Object> body) {
        try {
            Product updated = buildProductFromBody(body);
            return ResponseEntity.ok(productService.update(id, updated));
        } catch (ResourceNotFoundException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable Long id) {
        productService.softDelete(id);
        return ResponseEntity.ok(Map.of("message", "Producto desactivado correctamente"));
    }

    // ---------------------------------------------------------------------------
    // Helper privado: construye una entidad Product desde el body del request
    // ---------------------------------------------------------------------------
    private Product buildProductFromBody(Map<String, Object> body) {
        Long categoryId = Long.parseLong(body.get("categoryId").toString());
        Category category = categoryRepository.findById(categoryId)
            .orElseThrow(() -> new ResourceNotFoundException("Categoría no encontrada: " + categoryId));

        return Product.builder()
            .category(category)
            .name(body.get("name").toString())
            .sku(body.get("sku").toString())
            .description(body.containsKey("description") ? body.get("description").toString() : null)
            .price(new BigDecimal(body.get("price").toString()))
            .stockCurrent(body.containsKey("stockCurrent")
                ? Integer.parseInt(body.get("stockCurrent").toString()) : 0)
            .stockMinimum(body.containsKey("stockMinimum")
                ? Integer.parseInt(body.get("stockMinimum").toString()) : 5)
            .unit(body.containsKey("unit") ? body.get("unit").toString() : "UNIT")
            .build();
    }
}
