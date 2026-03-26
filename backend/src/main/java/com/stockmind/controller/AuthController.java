package com.stockmind.controller;

import com.stockmind.dto.LoginRequest;
import com.stockmind.dto.LoginResponse;
import com.stockmind.model.User;
import com.stockmind.repository.UserRepository;
import com.stockmind.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * AuthController — Endpoints de autenticación
 *
 * GET  /auth/me     → Retorna perfil del usuario autenticado
 * POST /auth/login  → Autentica y retorna JWT
 */
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request) {
        try {
            LoginResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication authentication) {
        String username = authentication.getName();
        return userRepository.findByUsername(username)
            .map(user -> ResponseEntity.ok(Map.of(
                "id", user.getId(),
                "username", user.getUsername(),
                "email", user.getEmail(),
                "role", user.getRole().name()
            )))
            .orElse(ResponseEntity.notFound().build());
    }
}
