package com.stockmind;

import com.stockmind.bootstrap.PlatformAdminBootstrap;
import com.stockmind.model.User;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

/** Creación del primer dueño de la plataforma a partir de variables de entorno. */
class PlatformAdminBootstrapTest extends IntegrationTestBase {

    @Autowired PasswordEncoder encoder;

    private PlatformAdminBootstrap bootstrap(String email, String password) {
        return new PlatformAdminBootstrap(userRepository, encoder, email, password, "");
    }

    private long platformAdmins() {
        return userRepository.findAll().stream().filter(u -> u.getRole() == User.Role.PLATFORM_OWNER).count();
    }

    @Test
    @DisplayName("Sin configuración no hace nada")
    void nothingWhenNotConfigured() {
        bootstrap("", "").run(null);
        assertEquals(0, platformAdmins());
    }

    @Test
    @DisplayName("Crea el PLATFORM_OWNER sin empresa, verificado, con la contraseña cifrada")
    void createsPlatformAdmin() {
        bootstrap("Dueno@StockMind.com", "Clave1234").run(null);

        User u = userRepository.findByEmail("dueno@stockmind.com").orElseThrow();
        assertEquals(User.Role.PLATFORM_OWNER, u.getRole());
        assertNull(u.getOrganizationId());
        assertNotNull(u.getEmailVerifiedAt());
        assertTrue(u.getPasswordHash().startsWith("$2"));
        assertTrue(encoder.matches("Clave1234", u.getPasswordHash()));
    }

    @Test
    @DisplayName("Es idempotente: si ya hay un PLATFORM_OWNER, cambiar la variable no crea otro ni pisa el existente")
    void idempotent() {
        bootstrap("dueno@stockmind.com", "Clave1234").run(null);
        bootstrap("otro@stockmind.com", "OtraClave99").run(null);

        assertEquals(1, platformAdmins());
        assertTrue(userRepository.findByEmail("otro@stockmind.com").isEmpty());
        assertTrue(encoder.matches("Clave1234", userRepository.findByEmail("dueno@stockmind.com").orElseThrow().getPasswordHash()));
    }

    @Test
    @DisplayName("Falla de forma ruidosa con configuración incompleta, contraseña débil o correo ya usado")
    void failsLoudly() {
        assertThrows(IllegalStateException.class, () -> bootstrap("dueno@stockmind.com", "").run(null));
        assertThrows(IllegalStateException.class, () -> bootstrap("", "Clave1234").run(null));
        assertThrows(IllegalStateException.class, () -> bootstrap("dueno@stockmind.com", "debil").run(null));

        createUser("existente", User.Role.ADMIN);
        assertThrows(IllegalStateException.class, () -> bootstrap("existente@test.com", "Clave1234").run(null));
        assertEquals(0, platformAdmins());
    }
}
