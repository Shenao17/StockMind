package com.stockmind.controller;

import com.stockmind.dto.PageResponse;
import com.stockmind.dto.RequestDTO;
import com.stockmind.model.PlatformRequest;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformPermission;
import com.stockmind.platform.PlatformRequestService;
import com.stockmind.platform.PlatformSecurityService;
import com.stockmind.repository.UserRepository;
import com.stockmind.util.Paging;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Set;

/**
 * PlatformRequestController — Solicitudes de acciones sensibles.
 *
 * POST /platform/requests                  → pedir una acción con motivo (Soporte y Cobranza)
 * GET  /platform/requests                  → el dueño ve todas; el resto solo las suyas
 * POST /platform/requests/{id}/approve     → { pin, note? } solo el dueño: ejecuta la acción
 * POST /platform/requests/{id}/reject      → { note } solo el dueño
 * POST /platform/requests/{id}/cancel      → quien la pidió, mientras esté pendiente
 */
@RestController
@RequestMapping("/platform/requests")
@RequiredArgsConstructor
public class PlatformRequestController {

    private static final Set<String> SORT = Set.of("id", "createdAt", "status", "type");

    private final PlatformRequestService service;
    private final PlatformSecurityService security;
    private final UserRepository userRepository;

    @PostMapping
    public ResponseEntity<RequestDTO.Row> create(@Valid @RequestBody RequestDTO.Create body, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(auth.getName(), body));
    }

    @GetMapping
    public ResponseEntity<PageResponse<RequestDTO.Row>> list(
            @RequestParam(required = false) PlatformRequest.Status status,
            @RequestParam(required = false) PlatformRequest.Type type,
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size,
            @RequestParam(required = false) String sort, @RequestParam(required = false) String dir,
            Authentication auth) {
        boolean reviewer = auth.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals(PlatformPermission.REQUEST_REVIEW.authority()));
        var pageable = Paging.of(page, size, sort, dir, SORT, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        return ResponseEntity.ok(service.list(auth.getName(), reviewer, status, type, organizationId, pageable));
    }

    @PostMapping("/{id}/approve")
    public ResponseEntity<RequestDTO.Row> approve(@PathVariable Long id, @Valid @RequestBody RequestDTO.Approve body,
                                                  Authentication auth) {
        User actor = userRepository.findByEmail(auth.getName()).orElseThrow(() -> new BadCredentialsException("Sesión no válida"));
        security.verifyPin(actor, body.getPin());
        return ResponseEntity.ok(service.approve(id, auth.getName(), body.getNote()));
    }

    @PostMapping("/{id}/reject")
    public ResponseEntity<RequestDTO.Row> reject(@PathVariable Long id, @Valid @RequestBody RequestDTO.Reject body,
                                                 Authentication auth) {
        return ResponseEntity.ok(service.reject(id, auth.getName(), body.getNote()));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<RequestDTO.Row> cancel(@PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(service.cancel(id, auth.getName()));
    }
}
