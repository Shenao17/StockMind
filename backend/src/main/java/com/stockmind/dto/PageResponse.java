package com.stockmind.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Envoltorio estándar de los listados paginados.
 * { content, page (base 0), size, totalElements, totalPages }
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <T> PageResponse<T> of(Page<T> p) {
        return new PageResponse<>(p.getContent(), p.getNumber(), p.getSize(),
            p.getTotalElements(), p.getTotalPages());
    }
}
