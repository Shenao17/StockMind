package com.stockmind.bootstrap;

import com.stockmind.dto.UserDTO;
import com.stockmind.model.User;
import com.stockmind.repository.UserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Locale;

/**
 * PlatformAdminBootstrap — Crea el PRIMER dueño de la plataforma (rol PLATFORM_OWNER).
 *
 * Se configura con PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD (en el .env). Si no están
 * definidas no hace nada. Solo actúa cuando NO existe ya un PLATFORM_OWNER, así que cambiar
 * después la variable no crea otro ni pisa el existente. La contraseña debe cumplir la política.
 * Nunca se escribe en el log.
 */
@Slf4j
@Component
public class PlatformAdminBootstrap implements ApplicationRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;
    private final String fullName;

    public PlatformAdminBootstrap(UserRepository userRepository,
                                  PasswordEncoder passwordEncoder,
                                  @Value("${stockmind.platform-admin.email:}") String email,
                                  @Value("${stockmind.platform-admin.password:}") String password,
                                  @Value("${stockmind.platform-admin.name:}") String fullName) {
        this.fullName = fullName == null ? "" : fullName.trim();
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.email = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        this.password = password == null ? "" : password;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (email.isBlank() && password.isBlank()) {
            return;
        }
        if (email.isBlank() || password.isBlank()) {
            throw new IllegalStateException(
                "Define PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD juntas (o ninguna)");
        }
        if (userRepository.existsByRole(User.Role.PLATFORM_OWNER)) {
            return; // ya existe: la configuración no crea otro ni modifica el actual
        }
        if (!password.matches(UserDTO.PASSWORD_REGEX)) {
            throw new IllegalStateException("PLATFORM_ADMIN_PASSWORD no cumple la política: " + UserDTO.PASSWORD_MSG);
        }
        if (userRepository.existsByEmail(email)) {
            throw new IllegalStateException(
                "PLATFORM_ADMIN_EMAIL ya pertenece a un usuario de una empresa; usa otro correo");
        }

        userRepository.save(User.builder()
            .organizationId(null)
            .username("platform-owner")
            .fullName(fullName.isBlank() ? null : fullName)
            .email(email)
            .passwordHash(passwordEncoder.encode(password))
            .role(User.Role.PLATFORM_OWNER)
            .active(true)
            .emailVerifiedAt(LocalDateTime.now())
            .build());
        log.warn("Se creó el administrador de la plataforma ({})", email);
    }
}
