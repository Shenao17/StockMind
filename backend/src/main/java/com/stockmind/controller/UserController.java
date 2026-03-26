package com.stockmind.controller;

import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.User;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        String username = body.get("username").toString();
        String email    = body.get("email").toString();

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
            .passwordHash(passwordEncoder.encode(body.get("password").toString()))
            .role(User.Role.valueOf(body.getOrDefault("role", "SELLER").toString()))
            .active(true)
            .build();

        return ResponseEntity.status(HttpStatus.CREATED).body(userRepository.save(user));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable Long id,
                                     @RequestBody Map<String, Object> body) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        if (body.containsKey("email"))    user.setEmail(body.get("email").toString());
        if (body.containsKey("role"))     user.setRole(User.Role.valueOf(body.get("role").toString()));
        if (body.containsKey("active"))   user.setActive(Boolean.parseBoolean(body.get("active").toString()));
        if (body.containsKey("password")) user.setPasswordHash(
            passwordEncoder.encode(body.get("password").toString()));

        return ResponseEntity.ok(userRepository.save(user));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable Long id) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));
        user.setActive(false);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "Usuario desactivado correctamente"));
    }
}
