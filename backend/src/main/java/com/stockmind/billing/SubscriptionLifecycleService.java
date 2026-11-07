package com.stockmind.billing;

import com.stockmind.mail.EmailSender;
import com.stockmind.mail.EmailSender.BillingNotice;
import com.stockmind.model.Organization;
import com.stockmind.model.Subscription;
import com.stockmind.model.Subscription.Status;
import com.stockmind.repository.OrganizationRepository;
import com.stockmind.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * SubscriptionLifecycleService — Reglas diarias del ciclo de vida (idempotentes).
 *
 *   TRIAL   → avisos a ≤5 y ≤1 días del fin → vence → GRACE (solo lectura)
 *   ACTIVE  → avisos de renovación a ≤5 y ≤1 días → vence → GRACE
 *   GRACE   → vence la gracia → SUSPENDED (sin acceso; la empresa pasa a SUSPENDED)
 *   SUSPENDED → tras la retención → CANCELLED
 *
 * Las suscripciones de cortesía y las pendientes de verificar el correo (sin fecha de prueba) se omiten.
 * Se puede ejecutar cuantas veces se quiera: cada paso solo actúa si corresponde.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionLifecycleService {

    private final SubscriptionRepository subscriptionRepository;
    private final OrganizationRepository organizationRepository;
    private final SubscriptionService subscriptionService;
    private final EntitlementService entitlementService;
    private final EmailSender emailSender;

    @Value("${stockmind.billing.grace-days:7}")
    private int graceDays;

    @Value("${stockmind.billing.retention-days:90}")
    private int retentionDays;

    @Value("${app.public-url:http://localhost:5173}")
    private String publicUrl;

    /** Devuelve cuántas suscripciones cambiaron de estado (los avisos no cuentan). */
    @Transactional
    public int run(LocalDateTime now) {
        int changed = 0;
        for (Subscription s : subscriptionRepository.findAll()) {
            if (Boolean.TRUE.equals(s.getComplimentary())) continue;
            switch (s.getStatus()) {
                case TRIAL -> changed += handleTrial(s, now);
                case ACTIVE -> changed += handleActive(s, now);
                case GRACE -> changed += handleGrace(s, now);
                case SUSPENDED -> changed += handleSuspended(s, now);
                default -> { }
            }
        }
        if (changed > 0) log.info("Ciclo de suscripciones: {} cambios de estado", changed);
        return changed;
    }

    private int handleTrial(Subscription s, LocalDateTime now) {
        if (s.getTrialEndsAt() == null) return 0;   // aún sin verificar el correo
        if (!s.getTrialEndsAt().isAfter(now)) {
            return startGrace(s, s.getTrialEndsAt(), now);
        }
        reminders(s, s.getTrialEndsAt(), now, BillingNotice.TRIAL_ENDING);
        return 0;
    }

    private int handleActive(Subscription s, LocalDateTime now) {
        if (s.getCurrentPeriodEnd() == null) return 0;
        if (!s.getCurrentPeriodEnd().isAfter(now)) {
            return startGrace(s, s.getCurrentPeriodEnd(), now);
        }
        reminders(s, s.getCurrentPeriodEnd(), now, BillingNotice.RENEWAL_REMINDER);
        return 0;
    }

    private int handleGrace(Subscription s, LocalDateTime now) {
        if (s.getGraceEndsAt() == null || s.getGraceEndsAt().isAfter(now)) return 0;
        s.setStatus(Status.SUSPENDED);
        s.setSuspendedAt(now);
        subscriptionService.setOrganizationStatus(s.getOrganizationId(), Organization.Status.SUSPENDED);
        subscriptionService.save(s);
        notify(s, BillingNotice.SUSPENDED, 0);
        return 1;
    }

    private int handleSuspended(Subscription s, LocalDateTime now) {
        if (s.getSuspendedAt() == null || s.getSuspendedAt().plusDays(retentionDays).isAfter(now)) return 0;
        s.setStatus(Status.CANCELLED);
        subscriptionService.setOrganizationStatus(s.getOrganizationId(), Organization.Status.CANCELLED);
        subscriptionService.save(s);
        return 1;
    }

    private int startGrace(Subscription s, LocalDateTime expiredAt, LocalDateTime now) {
        s.setStatus(Status.GRACE);
        s.setGraceEndsAt(expiredAt.plusDays(graceDays));
        subscriptionService.save(s);
        notify(s, BillingNotice.GRACE_STARTED, graceDays);
        // Si el servidor estuvo apagado y la gracia ya pasó, se resuelve en la misma corrida
        return 1 + handleGrace(s, now);
    }

    private void reminders(Subscription s, LocalDateTime endsAt, LocalDateTime now, BillingNotice kind) {
        int daysLeft = (int) Math.max(0, Math.ceil(Duration.between(now, endsAt).toMinutes() / (60.0 * 24)));
        boolean changed = false;
        // El aviso se marca como enviado SOLO si salió: si el proveedor falla, la próxima corrida lo reintenta
        if (daysLeft <= 5 && s.getReminder5dSentAt() == null && notify(s, kind, daysLeft)) {
            s.setReminder5dSentAt(now);
            changed = true;
        }
        if (daysLeft <= 1 && s.getReminder1dSentAt() == null && notify(s, kind, daysLeft)) {
            s.setReminder1dSentAt(now);
            changed = true;
        }
        if (changed) subscriptionRepository.save(s);
    }

    /** Intenta enviar el aviso; devuelve false si falló (se registra el error y no se rompe el ciclo). */
    private boolean notify(Subscription s, BillingNotice kind, int daysLeft) {
        return organizationRepository.findById(s.getOrganizationId()).map(org -> {
            try {
                emailSender.sendBillingNotice(org.getContactEmail(), org.getName(), kind, daysLeft,
                    publicUrl.replaceAll("/+$", "") + "/billing");
                return true;
            } catch (Exception e) {
                log.error("No se pudo enviar el aviso {} a la empresa {}: {}", kind, org.getId(), e.getMessage());
                return false;
            }
        }).orElse(false);
    }
}
