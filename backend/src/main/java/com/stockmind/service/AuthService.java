package com.stockmind.service;

import com.stockmind.config.JwtConfig;
import com.stockmind.dto.LoginRequest;
import com.stockmind.dto.LoginResponse;
import com.stockmind.model.User;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * AuthService — Servicio de autenticación
 *
 * Responsabilidades:
 * - Validar credenciales de usuario contra la base de datos
 * - Generar token JWT para usuarios autenticados exitosamente
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtConfig jwtConfig;

    /**
     * Autentica un usuario con username y password.
     * Si las credenciales son válidas, genera y retorna un JWT.
     *
     * @param request DTO con username y password
     * @return LoginResponse con token y datos básicos del usuario
     * @throws BadCredentialsException si las credenciales son incorrectas
     */
    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
            .orElseThrow(() -> new BadCredentialsException("Credenciales inválidas"));

        if (!user.getActive()) {
            throw new BadCredentialsException("Usuario inactivo. Contacte al administrador.");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BadCredentialsException("Credenciales inválidas");
        }

        String token = jwtConfig.generateToken(user);

        return LoginResponse.builder()
            .token(token)
            .userId(user.getId())
            .username(user.getUsername())
            .role(user.getRole().name())
            .build();
    }
}
