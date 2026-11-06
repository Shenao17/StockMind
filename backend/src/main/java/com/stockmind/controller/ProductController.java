package com.stockmind.controller;

import com.stockmind.dto.ProductDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Category;
import com.stockmind.model.Product;
import com.stockmind.repository.CategoryRepository;
import com.stockmind.service.ProductService;
import com.stockmind.util.Paging;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

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

    private static final Set<String> SORT_FIELDS =
        Set.of("id", "name", "sku", "price", "stockCurrent", "createdAt");

    /**
     * GET /products
     * Filtros: search (nombre o SKU), categoryId, lowStock
     * Paginación opcional: page (base 0), size (1-100), sort, dir (asc|desc)
     *  - Con page o size → { content, page, size, totalElements, totalPages }
     *  - Sin ellos       → arreglo completo (compatibilidad con pantallas que aún lo necesitan)
     */
    @GetMapping
    public ResponseEntity<?> getAll(@RequestParam(required = false) String search,
                                    @RequestParam(required = false) Long categoryId,
                                    @RequestParam(defaultValue = "false") boolean lowStock,
                                    @RequestParam(required = false) Integer page,
                                    @RequestParam(required = false) Integer size,
                                    @RequestParam(required = false) String sort,
                                    @RequestParam(required = false) String dir) {
        if (Paging.isRequested(page, size)) {
            Pageable pageable = Paging.of(page, size, sort, dir, SORT_FIELDS, Sort.by("name"));
            return ResponseEntity.ok(productService.search(search, categoryId, lowStock, pageable));
        }
        return ResponseEntity.ok(productService.list(search, categoryId, lowStock));
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
    public ResponseEntity<Product> create(@Valid @RequestBody ProductDTO.Request body) {
        Product saved = productService.create(buildProduct(body));
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Product> update(@PathVariable Long id,
                                          @Valid @RequestBody ProductDTO.Request body) {
        return ResponseEntity.ok(productService.update(id, buildProduct(body)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable Long id) {
        productService.softDelete(id);
        return ResponseEntity.ok(Map.of("message", "Producto desactivado correctamente"));
    }

    // ---------------------------------------------------------------------------
    // Helper privado: construye una entidad Product desde el DTO ya validado
    // ---------------------------------------------------------------------------
    private Product buildProduct(ProductDTO.Request body) {
        Category category = categoryRepository.findById(body.getCategoryId())
            .orElseThrow(() -> new ResourceNotFoundException(
                "Categoría no encontrada: " + body.getCategoryId()));

        return Product.builder()
            .category(category)
            .name(body.getName().trim())
            .sku(body.getSku().trim())
            .description(body.getDescription())
            .price(body.getPrice())
            .stockCurrent(body.getStockCurrent() != null ? body.getStockCurrent() : 0)
            .stockMinimum(body.getStockMinimum() != null ? body.getStockMinimum() : 5)
            .unit(body.getUnit() != null ? body.getUnit() : "UNIT")
            .build();
    }
}
