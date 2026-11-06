package com.stockmind.controller;

import com.stockmind.dto.PageResponse;
import com.stockmind.dto.RegistrationDTO;
import com.stockmind.model.Organization;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.service.RegistrationService;
import com.stockmind.util.Paging;
import jakarta.persistence.criteria.Predicate;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * PlatformController — Operaciones del dueño de la plataforma (rol PLATFORM_ADMIN).
 *
 * POST /platform/organizations → da de alta una empresa y su primer administrador (queda ACTIVE)
 * GET  /platform/organizations → lista paginada de empresas (search, status, page, size, sort, dir)
 */
@RestController
@RequestMapping("/platform")
@RequiredArgsConstructor
public class PlatformController {

    private static final Set<String> SORT_FIELDS = Set.of("id", "name", "status", "createdAt");

    private final RegistrationService registrationService;
    private final OrganizationRepository organizationRepository;

    @PostMapping("/organizations")
    public ResponseEntity<Organization> create(@Valid @RequestBody RegistrationDTO.ByPlatform body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(registrationService.createByPlatform(body));
    }

    @GetMapping("/organizations")
    public ResponseEntity<PageResponse<Organization>> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Organization.Status status,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String dir) {

        Specification<Organization> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = Paging.likePattern(search);
                ps.add(cb.or(
                    cb.like(cb.lower(root.get("name")), like, '!'),
                    cb.like(cb.lower(root.get("taxId")), like, '!'),
                    cb.like(cb.lower(root.get("contactEmail")), like, '!')));
            }
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            return cb.and(ps.toArray(new Predicate[0]));
        };
        // Listado siempre paginado (puede haber miles de empresas): sin page/size → página 0
        Pageable pageable = Paging.of(page, size, sort, dir, SORT_FIELDS,
            Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        return ResponseEntity.ok(PageResponse.of(organizationRepository.findAll(spec, pageable)));
    }
}
