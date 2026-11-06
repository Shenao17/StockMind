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

        Organization org = assertAccountUsable(user);

        // Segundo factor: siempre en el equipo de plataforma; en las empresas, si el usuario lo activó
        // o si la empresa lo exige (en ese caso lo configura ahora, antes de entrar).
        boolean enrolled = platformSecurity.mfaEnrolled(user);
        boolean forced = !enrolled && org != null && Boolean.TRUE.equals(org.getRequireMfa());
        if (user.isPlatformUser() || enrolled || forced) {
            return LoginResponse.builder()
                .mfaRequired(enrolled)
                .enrollmentRequired(!enrolled)
                .mustChangePassword(Boolean.TRUE.equals(user.getMustChangePassword()))
                .pinRequired(user.isPlatformUser())
                .challengeToken(platformSecurity.challengeFor(user))
                .fullName(user.getFullName())
                .build();
        }

        return session(user);
    }

    /**
     * Usuario activo y, si es de una empresa, con la empresa activa (no pendiente, suspendida ni cancelada).
     * Se vuelve a comprobar al terminar el segundo factor. Devuelve la empresa (null en plataforma).
     */
    public Organization assertAccountUsable(User user) {
        if (!user.getActive()) {
            throw new BadCredentialsException("Usuario inactivo. Contacte al administrador.");
        }
        if (user.getOrganizationId() == null) {
            return null;
        }
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
        return org;
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
        assertAccountUsable(user);
        platformSecurity.verifySecondFactor(user, code);
        return session(user);
    }

    public PlatformSecurityService.Enrollment startEnrollment(String challengeToken) {
        User user = platformSecurity.userFromChallenge(challengeToken, PlatformSecurityService.TYPE_ENROLL);
        assertAccountUsable(user);
        return platformSecurity.startEnrollment(user);
    }

    public LoginResponse finishEnrollment(String challengeToken, String code, String pin, String newPassword) {
        User user = platformSecurity.userFromChallenge(challengeToken, PlatformSecurityService.TYPE_ENROLL);
        assertAccountUsable(user);
        java.util.List<String> backup = platformSecurity.finishEnrollment(user, code, pin, newPassword);
        LoginResponse r = session(user);
        r.setBackupCodes(backup);
        return r;
    }
}
