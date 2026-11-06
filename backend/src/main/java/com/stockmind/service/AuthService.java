package com.stockmind.service;

import com.stockmind.config.JwtConfig;
import com.stockmind.dto.LoginRequest;
import com.stockmind.dto.LoginResponse;
import com.stockmind.model.Organization;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformSecurityService;
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
    private final PlatformSecurityService platformSecurity;

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

        // Primero la contraseña: los avisos específicos (inactivo, pendiente de verificar, suspendida)
        // solo se muestran a quien demuestra conocer la clave; si no, se permitiría averiguar qué
        // correos existen y en qué estado están.
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new BadCredentialsException("Credenciales inválidas");
        }

        if (!user.getActive()) {
            throw new BadCredentialsException("Usuario inactivo. Contacte al administrador.");
        }

        // La empresa debe estar activa (pendiente de verificar, suspendida o cancelada no entran)
        if (user.getOrganizationId() != null) {
            Organization org = organizationRepository.findById(user.getOrganizationId()).orElse(null);
            if (org == null) {
                throw new BadCredentialsException("La cuenta de la empresa no está activa. Contacte a soporte.");
            }
            if (org.getStatus() == Organization.Status.PENDING) {
                throw new BadCredentialsException(
                    "Falta verificar tu correo electrónico. Revisa el enlace que te enviamos para activar la cuenta.");
            }
            if (org.getStatus() != Organization.Status.ACTIVE) {
                throw new BadCredentialsException("La cuenta de la empresa no está activa. Contacte a soporte.");
            }
        }

        // Equipo de plataforma: la contraseña no basta, falta el segundo factor. Aún no hay sesión.
        if (user.isPlatformUser()) {
            boolean enrolled = platformSecurity.mfaEnrolled(user);
            return LoginResponse.builder()
                .mfaRequired(enrolled)
                .enrollmentRequired(!enrolled)
                .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()))
                .challengeToken(platformSecurity.challengeFor(user))
                .fullName(user.getFullName())
                .build();
        }

        return session(user);
    }

    /** Sesión completa (token de acceso) tras superar todos los pasos. */
    public LoginResponse session(User user) {
        return LoginResponse.builder()
            .token(jwtConfig.generateToken(user))
            .userId(user.getId())
            .username(user.getUsername())
            .email(user.getEmail())
            .organizationId(user.getOrganizationId())
            .role(user.getRole().name())
            .fullName(user.getFullName())
            .build();
    }

    /** Segundo paso del inicio de sesión del equipo de plataforma. */
    public LoginResponse verifyMfa(String challengeToken, String code) {
        User user = platformSecurity.userFromChallenge(challengeToken, PlatformSecurityService.TYPE_MFA);
        platformSecurity.verifySecondFactor(user, code);
        return session(user);
    }

    public PlatformSecurityService.Enrollment startEnrollment(String challengeToken) {
        return platformSecurity.startEnrollment(
            platformSecurity.userFromChallenge(challengeToken, PlatformSecurityService.TYPE_ENROLL));
    }

    public LoginResponse finishEnrollment(String challengeToken, String code, String pin, String newPassword) {
        User user = platformSecurity.userFromChallenge(challengeToken, PlatformSecurityService.TYPE_ENROLL);
        java.util.List<String> backup = platformSecurity.finishEnrollment(user, code, pin, newPassword);
        LoginResponse r = session(user);
        r.setBackupCodes(backup);
        return r;
    }
}
