package com.stockmind.util;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Set;

/**
 * Construye un Pageable seguro a partir de los parámetros de la petición.
 *
 *  - page: base 0, por defecto 0
 *  - size: por defecto 20, máximo 100 (evita pedir "todo" de un golpe)
 *  - sort: SOLO campos de una lista permitida (nunca un nombre arbitrario del cliente)
 *  - dir: asc | desc
 *
 * Los valores inválidos lanzan IllegalArgumentException → 400 en GlobalExceptionHandler.
 */
public final class Paging {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    private Paging() {}

    public static boolean isRequested(Integer page, Integer size) {
        return page != null || size != null;
    }

    public static Pageable of(Integer page, Integer size, String sort, String dir,
                              Set<String> allowedSortFields, Sort defaultSort) {
        int p = page == null ? 0 : page;
        int s = size == null ? DEFAULT_SIZE : size;
        if (p < 0) {
            throw new IllegalArgumentException("El número de página no puede ser negativo");
        }
        if (s < 1 || s > MAX_SIZE) {
            throw new IllegalArgumentException("El tamaño de página debe estar entre 1 y " + MAX_SIZE);
        }

        Sort order = defaultSort;
        if (sort != null && !sort.isBlank()) {
            if (!allowedSortFields.contains(sort)) {
                throw new IllegalArgumentException("Campo de orden no permitido: " + sort);
            }
            Sort.Direction direction;
            if (dir == null || dir.isBlank() || dir.equalsIgnoreCase("asc")) {
                direction = Sort.Direction.ASC;
            } else if (dir.equalsIgnoreCase("desc")) {
                direction = Sort.Direction.DESC;
            } else {
                throw new IllegalArgumentException("La dirección de orden debe ser asc o desc");
            }
            // desempate estable por id para que la paginación no repita ni pierda filas
            order = Sort.by(direction, sort).and(Sort.by(Sort.Direction.DESC, "id"));
        }
        return PageRequest.of(p, s, order);
    }

    /** Escapa % _ y ! para usar el texto en un LIKE con ESCAPE '!' y lo envuelve en %...% */
    public static String likePattern(String text) {
        String escaped = text.trim().toLowerCase()
            .replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return "%" + escaped + "%";
    }
}
