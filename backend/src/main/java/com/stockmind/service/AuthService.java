package com.stockmind.service;

import com.stockmind.config.JwtConfig;
import com.stockmind.dto.LoginRequest;
import com.stockmind.dto.LoginResponse;
import com.stockmind.model.Organization;
import com.stockmind.model.User;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
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
    private final OrganizationRepository organizationRepository;
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
        // El correo es único en toda la plataforma: identifica al usuario y, con él, a su empresa
        String email = request.getEmail().trim().toLowerCase();
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new BadCredentialsException("Credenciales inválidas"));

        if (!user.getActive()) {
            throw new BadCredentialsException("Usuario inactivo. Contacte al administrador.");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BadCredentialsException("Credenciales inválidas");
        }

        // La empresa debe estar activa (pendiente de verificar, suspendida o cancelada no entran)
        if (user.getOrganizationId() != null) {
            Organization org = organizationRepository.findById(user.getOrganizationId()).orElse(null);
            if (org == null || org.getStatus() != Organization.Status.ACTIVE) {
                throw new BadCredentialsException(
                    "La cuenta de la empresa no está activa. Contacte a soporte.");
            }
        }

        String token = jwtConfig.generateToken(user);

        return LoginResponse.builder()
            .token(token)
            .userId(user.getId())
            .username(user.getUsername())
            .email(user.getEmail())
            .organizationId(user.getOrganizationId())
            .role(user.getRole().name())
            .build();
    }
}
