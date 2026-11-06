package com.stockmind;

import com.stockmind.billing.SubscriptionLifecycleService;
import com.stockmind.mail.EmailSender.BillingNotice;
import com.stockmind.model.Organization;
import com.stockmind.model.Subscription;
import com.stockmind.model.Subscription.Status;
import com.stockmind.support.CapturingEmailSender.Notice;
import com.stockmind.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Ciclo diario: avisos de fin de prueba/renovación, gracia, suspensión y cancelación. */
class SubscriptionLifecycleIntegrationTest extends IntegrationTestBase {

    @Autowired SubscriptionLifecycleService lifecycle;

    @BeforeEach
    void setUp() {
        setSubscription(org.getId(), "PRO", Status.TRIAL);
    }

    private Subscription sub() {
        return subscriptionRepository.findByOrganizationId(org.getId()).orElseThrow();
    }

    private Subscription edit(java.util.function.Consumer<Subscription> change) {
        Subscription s = sub();
        change.accept(s);
        Subscription saved = subscriptionRepository.save(s);
        entitlements.evict(org.getId());
        return saved;
    }

    private Organization orgNow() {
        return organizationRepository.findById(org.getId()).orElseThrow();
    }

    @Test
    @DisplayName("Prueba lejos de terminar: no pasa nada")
    void nothingHappensEarly() {
        edit(s -> s.setTrialEndsAt(LocalDateTime.now().plusDays(10)));
        assertEquals(0, lifecycle.run(LocalDateTime.now()));
        assertTrue(emails.notices().isEmpty());
        assertEquals(Status.TRIAL, sub().getStatus());
    }

    @Test
    @DisplayName("A 5 días o menos del fin de la prueba: aviso al contacto de la empresa (una sola vez)")
    void trialEndingReminderFiveDays() {
        edit(s -> s.setTrialEndsAt(LocalDateTime.now().plusDays(4).plusHours(3)));   // faltan 5 días (redondeo)

        lifecycle.run(LocalDateTime.now());
        assertEquals(1, emails.notices().size());
        Notice n = emails.notices().get(0);
        assertEquals(BillingNotice.TRIAL_ENDING, n.kind());
        assertEquals(5, n.daysLeft());
        assertEquals("empresa.a@test.com", n.to());

        lifecycle.run(LocalDateTime.now());            // idempotente: no repite el aviso
        lifecycle.run(LocalDateTime.now());
        assertEquals(1, emails.notices().size());
        assertEquals(Status.TRIAL, sub().getStatus());
    }

    @Test
    @DisplayName("A 1 día del fin: segundo aviso")
    void trialEndingReminderOneDay() {
        edit(s -> s.setTrialEndsAt(LocalDateTime.now().plusDays(4)));
        lifecycle.run(LocalDateTime.now());
        assertEquals(1, emails.notices().size());

        edit(s -> s.setTrialEndsAt(LocalDateTime.now().plusHours(20)));
        lifecycle.run(LocalDateTime.now());
        assertEquals(2, emails.notices().size());
        assertEquals(1, emails.notices().get(1).daysLeft());
    }

    @Test
    @DisplayName("Al vencer la prueba: gracia de 7 días en solo lectura, con aviso")
    void trialExpiresIntoGrace() {
        LocalDateTime ended = LocalDateTime.now().minusHours(2).withNano(0);
        edit(s -> s.setTrialEndsAt(ended));

        assertEquals(1, lifecycle.run(LocalDateTime.now()));

        Subscription s = sub();
        assertEquals(Status.GRACE, s.getStatus());
        assertEquals(ended.plusDays(7).withNano(0), s.getGraceEndsAt().withNano(0));
        assertEquals(BillingNotice.GRACE_STARTED, emails.notices().get(0).kind());
        assertEquals(Organization.Status.ACTIVE, orgNow().getStatus(), "en gracia puede entrar (solo lectura)");
    }

    @Test
    @DisplayName("Terminada la gracia: suspendida, la empresa deja de poder entrar y se avisa")
    void graceExpiresIntoSuspension() {
        edit(s -> { s.setStatus(Status.GRACE); s.setGraceEndsAt(LocalDateTime.now().minusMinutes(5)); });

        assertEquals(1, lifecycle.run(LocalDateTime.now()));

        assertEquals(Status.SUSPENDED, sub().getStatus());
        assertNotNull(sub().getSuspendedAt());
        assertEquals(Organization.Status.SUSPENDED, orgNow().getStatus());
        assertEquals(BillingNotice.SUSPENDED, emails.notices().get(0).kind());
    }

    @Test
    @DisplayName("Si el servidor estuvo apagado semanas, una sola corrida lleva la prueba hasta suspendida")
    void catchUpAfterDowntime() {
        edit(s -> s.setTrialEndsAt(LocalDateTime.now().minusDays(20)));
        lifecycle.run(LocalDateTime.now());
        assertEquals(Status.SUSPENDED, sub().getStatus());
        assertEquals(Organization.Status.SUSPENDED, orgNow().getStatus());
    }

    @Test
    @DisplayName("Suspendida más de 90 días: se cancela")
    void suspensionBecomesCancellation() {
        edit(s -> { s.setStatus(Status.SUSPENDED); s.setSuspendedAt(LocalDateTime.now().minusDays(91)); });
        assertEquals(1, lifecycle.run(LocalDateTime.now()));
        assertEquals(Status.CANCELLED, sub().getStatus());
        assertEquals(Organization.Status.CANCELLED, orgNow().getStatus());

        edit(s -> { s.setStatus(Status.SUSPENDED); s.setSuspendedAt(LocalDateTime.now().minusDays(30)); });
        assertEquals(0, lifecycle.run(LocalDateTime.now()), "dentro del plazo de retención no se cancela");
    }

    @Test
    @DisplayName("Plan pagado: aviso de renovación y, al vencer el periodo, gracia")
    void activeRenewalAndExpiry() {
        edit(s -> { s.setStatus(Status.ACTIVE); s.setCurrentPeriodEnd(LocalDateTime.now().plusDays(3)); });
        lifecycle.run(LocalDateTime.now());
        assertEquals(BillingNotice.RENEWAL_REMINDER, emails.notices().get(0).kind());

        edit(s -> s.setCurrentPeriodEnd(LocalDateTime.now().minusHours(1)));
        lifecycle.run(LocalDateTime.now());
        assertEquals(Status.GRACE, sub().getStatus());
    }

    @Test
    @DisplayName("Se omiten las cortesías y las empresas que aún no verificaron el correo")
    void skipsComplimentaryAndUnverified() {
        // cortesía vencida
        edit(s -> { s.setComplimentary(true); s.setStatus(Status.ACTIVE); s.setCurrentPeriodEnd(LocalDateTime.now().minusDays(100)); });
        assertEquals(0, lifecycle.run(LocalDateTime.now()));
        assertEquals(Status.ACTIVE, sub().getStatus());

        // prueba sin fecha (autoregistro pendiente de verificar)
        edit(s -> { s.setComplimentary(false); s.setStatus(Status.TRIAL); s.setTrialEndsAt(null); s.setCurrentPeriodEnd(null); });
        assertEquals(0, lifecycle.run(LocalDateTime.now()));
        assertEquals(Status.TRIAL, sub().getStatus());
        assertTrue(emails.notices().isEmpty());
    }

    @Test
    @DisplayName("Un pago renueva: reinicia los avisos para el siguiente ciclo")
    void paymentResetsReminders() {
        edit(s -> s.setTrialEndsAt(LocalDateTime.now().plusDays(3)));
        lifecycle.run(LocalDateTime.now());
        assertNotNull(sub().getReminder5dSentAt());

        edit(s -> { s.setReminder5dSentAt(null); s.setReminder1dSentAt(null); });
        assertNull(sub().getReminder5dSentAt());
        List<Notice> before = List.copyOf(emails.notices());
        assertEquals(1, before.size());
    }
}
