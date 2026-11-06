package com.stockmind.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** SOLO desarrollo: no envía nada, muestra el enlace de verificación en el log del backend. */
@Slf4j
@Component
@Profile("dev")
public class DevEmailSender implements EmailSender {

    @Override
    public void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl) {
        log.warn("[DEV] Enlace de verificación para {}: {}", toEmail, verifyUrl);
    }

    @Override
    public void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl) {
        log.warn("[DEV] Aviso {} ({} días) para {}: {}", kind, daysLeft, toEmail, billingUrl);
    }
}
