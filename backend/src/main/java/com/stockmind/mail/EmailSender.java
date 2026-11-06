package com.stockmind.mail;

/**
 * EmailSender — Envío de correos transaccionales.
 *
 * Hoy hay dos implementaciones sin proveedor real: DevEmailSender (perfil dev, escribe el
 * enlace en el log) y NoopEmailSender (el resto, avisa que no hay proveedor). Al contratar
 * un servicio de correo (SMTP, SES, Resend...) se agrega una implementación nueva sin
 * tocar el resto del código.
 */
public interface EmailSender {

    /** Correo con el enlace para confirmar la dirección y activar la cuenta. */
    void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl);

    /** Avisos del ciclo de la suscripción. `daysLeft` aplica a TRIAL_ENDING y RENEWAL_REMINDER. */
    void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl);

    enum BillingNotice {
        TRIAL_ENDING,      // la prueba gratis termina pronto
        RENEWAL_REMINDER,  // el periodo pagado termina pronto
        GRACE_STARTED,     // venció: solo lectura hasta la fecha de gracia
        SUSPENDED          // sin acceso; los datos se conservan
    }
}
