package com.stockmind.billing;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Ejecuta el ciclo de vida una vez al día (por defecto 06:00). Pensado para UNA instancia del
 * backend: con varias réplicas hay que añadir un bloqueo (p. ej. ShedLock) para que no corra duplicado.
 * Es idempotente, así que una doble ejecución no daña datos, pero podría duplicar avisos.
 */
@Component
@EnableScheduling
@RequiredArgsConstructor
public class SubscriptionLifecycleJob {

    private final SubscriptionLifecycleService lifecycle;

    @Value("${stockmind.billing.scheduler-enabled:true}")
    private boolean enabled;

    @Scheduled(cron = "${stockmind.billing.cron:0 0 6 * * *}")
    public void daily() {
        if (enabled) {
            lifecycle.run(LocalDateTime.now());
        }
    }
}
