package com.stockmind.controller;

import com.stockmind.billing.EntitlementService;
import com.stockmind.dto.PageResponse;
import com.stockmind.dto.UserDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.User;
import com.stockmind.repository.UserRepository;
import com.stockmind.tenant.TenantContext;
import com.stockmind.repository.spec.UserSpecs;
import com.stockmind.util.Paging;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;

/**
 * UserController — CRUD de usuarios del sistema
 *
 * GET    /users       → Listar todos los usuarios
 * POST   /users       → Crear usuario
 * PUT    /users/{id}  → Actualizar usuario
 * DELETE /users/{id}  → Desactivar usuario (soft delete)
 */
@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EntitlementService entitlementService;

    private static final Set<String> SORT_FIELDS = Set.of("id", "username", "email", "role", "createdAt");

    /**
     * GET /users
     * Filtros: search (usuario o correo), role, active
     * Paginación opcional: page (base 0), size (1-100), sort, dir (asc|desc)
     *  - Con page o size → { content, page, size, totalElements, totalPages }
     *  - Sin ellos       → arreglo con todos los usuarios (comportamiento anterior)
     */
    @GetMapping
    public ResponseEntity<?> getAll(@RequestParam(required = false) String search,
                                    @RequestParam(required = false) User.Role role,
                                    @RequestParam(required = false) Boolean active,
                                    @RequestParam(required = false) Integer page,
                                    @RequestParam(required = false) Integer size,
                                    @RequestParam(required = false) String sort,
                                    @RequestParam(required = false) String dir) {
        var spec = UserSpecs.filter(TenantContext.require(), search, role, active);
        if (Paging.isRequested(page, size)) {
            Pageable pageable = Paging.of(page, size, sort, dir, SORT_FIELDS, Sort.by("username"));
            return ResponseEntity.ok(PageResponse.of(userRepository.findAll(spec, pageable)));
        }
        return ResponseEntity.ok(userRepository.findAll(spec, Sort.by("id")));
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody UserDTO.CreateRequest body) {
        String username = body.getUsername().trim();
        String email    = body.getEmail().trim().toLowerCase();

        Long organizationId = TenantContext.require();
        assertAssignableRole(body.getRole());
        entitlementService.assertCanAddUser(organizationId);

        if (userRepository.existsByOrganizationIdAndUsername(organizationId, username)) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "El nombre de usuario ya existe"));
        }
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "El correo electrónico ya está registrado"));
        }

        User user = User.builder()
            .organizationId(organizationId)
            .username(username)
            .email(email)
            .passwordHash(passwordEncoder.encode(body.getPassword()))
            .role(body.getRole())
            .active(true)
            .build();

        return ResponseEntity.status(HttpStatus.CREATED).body(userRepository.save(user));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                     @Valid @RequestBody UserDTO.UpdateRequest body,
                                     Authentication authentication) {
        User user = findInOwnOrganization(id);
        if (body.getRole() != null) assertAssignableRole(body.getRole());
        if (Boolean.TRUE.equals(body.getActive()) && !Boolean.TRUE.equals(user.getActive())) {
            entitlementService.assertCanAddUser(user.getOrganizationId());   // reactivar también cuenta contra el límite
        }

        // Evita que un administrador se quede sin acceso a sí mismo
        boolean isSelf = user.getEmail().equals(authentication.getName());
        if (isSelf && (Boolean.FALSE.equals(body.getActive())
                || (body.getRole() != null && body.getRole() != user.getRole()))) {
            throw new IllegalStateException(
                "No puedes desactivar tu propia cuenta ni cambiar tu propio rol");
        }

        if (body.getEmail() != null && !body.getEmail().isBlank()) {
            String email = body.getEmail().trim().toLowerCase();
            boolean takenByOther = userRepository.findByEmail(email)
                .filter(other -> !other.getId().equals(user.getId()))
                .isPresent();
            if (takenByOther) {
                return ResponseEntity.badRequest()
                    .body(Map.of("error", "El correo electrónico ya está registrado"));
            }
            user.setEmail(email);
        }
        if (body.getRole() != null)     user.setRole(body.getRole());
        if (body.getActive() != null)   user.setActive(body.getActive());
        if (body.getPassword() != null) user.setPasswordHash(
            passwordEncoder.encode(body.getPassword()));

        return ResponseEntity.ok(userRepository.save(user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable Long id,
                                                       Authentication authentication) {
        User user = findInOwnOrganization(id);

        if (user.getEmail().equals(authentication.getName())) {
            throw new IllegalStateException("No puedes desactivar tu propia cuenta");
        }

        user.setActive(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Usuario desactivado correctamente"));
    }

    /** Un usuario de otra empresa se comporta como si no existiera (404), nunca como prohibido. */
    private User findInOwnOrganization(Long id) {
        Long organizationId = TenantContext.require();
        return userRepository.findById(id)
            .filter(u -> organizationId.equals(u.getOrganizationId()))
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
    }

    /** Un administrador de empresa solo puede asignar ADMIN o SELLER, nunca PLATFORM_ADMIN. */
    private void assertAssignableRole(User.Role role) {
        if (role == User.Role.PLATFORM_ADMIN) {
            throw new IllegalStateException("No se puede asignar ese rol");
        }
    }
}
