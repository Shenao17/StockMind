package com.stockmind.config;

import com.stockmind.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/**
 * DevDataSeeder — Carga datos de ejemplo SOLO en desarrollo.
 *
 * Se activa únicamente con el perfil Spring "dev" (SPRING_PROFILES_ACTIVE=dev) y
 * solo si la tabla users está vacía, así que es idempotente. Corre después de las
 * migraciones de Flyway. En producción no hay perfil dev: nunca se ejecuta.
 */
@Slf4j
@Component
@Profile("dev")
@RequiredArgsConstructor
public class DevDataSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final DataSource dataSource;

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.count() > 0) {
            log.info("DevDataSeeder: la base ya tiene usuarios, no se cargan datos de ejemplo");
            return;
        }
        ResourceDatabasePopulator populator =
            new ResourceDatabasePopulator(new ClassPathResource("db/dev/seed.sql"));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);
        log.warn("DevDataSeeder: datos de ejemplo cargados (SOLO DESARROLLO)");
    }
}
