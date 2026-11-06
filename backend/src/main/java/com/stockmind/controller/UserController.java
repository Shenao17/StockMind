package com.stockmind.controller;

import com.stockmind.dto.UserDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.User;
import com.stockmind.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    @GetMapping
    public ResponseEntity<List<User>> getAll() {
        return ResponseEntity.ok(userRepository.findAll());
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody UserDTO.CreateRequest body) {
        String username = body.getUsername().trim();
        String email    = body.getEmail().trim().toLowerCase();

        if (userRepository.existsByUsername(username)) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "El nombre de usuario ya existe"));
        }
        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.badRequest()
                .body(Map.of("error", "El correo electrónico ya está registrado"));
        }

        User user = User.builder()
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
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        // Evita que un administrador se quede sin acceso a sí mismo
        boolean isSelf = user.getUsername().equals(authentication.getName());
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
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        if (user.getUsername().equals(authentication.getName())) {
            throw new IllegalStateException("No puedes desactivar tu propia cuenta");
        }

        user.setActive(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Usuario desactivado correctamente"));
    }
}
