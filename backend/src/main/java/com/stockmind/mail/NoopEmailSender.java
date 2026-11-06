package com.stockmind.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Sin proveedor de correo configurado. NO registra el enlace (es un secreto de un solo uso):
 * solo avisa, para que la falta de proveedor no pase desapercibida en producción.
 */
@Slf4j
@Component
@Profile("!dev")
public class NoopEmailSender implements EmailSender {

    @Override
    public void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl) {
        log.error("No hay proveedor de correo configurado: NO se envió el correo de verificación a {}", toEmail);
    }

    @Override
    public void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl) {
        log.error("No hay proveedor de correo configurado: NO se envió el aviso {} a {}", kind, toEmail);
    }
}
