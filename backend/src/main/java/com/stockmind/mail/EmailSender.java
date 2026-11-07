package com.stockmind.mail;

/**
 * EmailSender — Envío de correos transaccionales.
 *
 * Implementaciones:
 *  - ResendEmailSender: proveedor real (STOCKMIND_EMAIL_PROVIDER=resend).
 *  - DevEmailSender: perfil dev sin proveedor; escribe el enlace en el log.
 *  - NoopEmailSender: sin proveedor; avisa en el log de que NO se envió nada.
 * Otro proveedor (SES, SMTP...) se agrega con una implementación nueva, sin tocar el resto.
 *
 * Los métodos lanzan excepción si el envío falla: quien llama decide qué hacer (el registro permite
 * reenviar el enlace; el ciclo diario reintenta el aviso en la siguiente corrida).
 */
public interface EmailSender {

    /** Correo con el enlace para confirmar la dirección y activar la cuenta. */
    void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl);

    /** Avisos del ciclo de la suscripción. `daysLeft` aplica a TRIAL_ENDING y RENEWAL_REMINDER. */
    void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl);

    /** Correo de prueba para comprobar la configuración (lo envía el dueño desde el panel). */
    void sendTestEmail(String toEmail);

    /** Nombre del proveedor activo: "resend", "dev" o "none" (sin proveedor). */
    String provider();

    enum BillingNotice {
        TRIAL_ENDING,      // la prueba gratis termina pronto
        RENEWAL_REMINDER,  // el periodo pagado termina pronto
        GRACE_STARTED,     // venció: solo lectura hasta la fecha de gracia
        SUSPENDED          // sin acceso; los datos se conservan
    }
}
