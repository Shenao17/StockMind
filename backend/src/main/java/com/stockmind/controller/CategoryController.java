package com.stockmind.controller;

import com.stockmind.model.Category;
import com.stockmind.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * CategoryController — Catálogo de categorías (ADMIN y SELLER)
 *
 * GET /categories → todas las categorías ordenadas por nombre
 * (son pocas; alimentan filtros y formularios)
 */
@RestController
@RequestMapping("/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryRepository categoryRepository;

    @GetMapping
    public ResponseEntity<List<Category>> getAll() {
        return ResponseEntity.ok(categoryRepository.findAll(Sort.by("name")));
    }
}
