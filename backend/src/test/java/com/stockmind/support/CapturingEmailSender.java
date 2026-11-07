package com.stockmind.support;

import com.stockmind.mail.EmailSender;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** EmailSender de pruebas: guarda los correos en memoria para inspeccionarlos. */
public class CapturingEmailSender implements EmailSender {

    public record Sent(String to, String name, String url) {
        /** Token real extraído del enlace (lo que el usuario recibiría por correo). */
        public String token() {
            return url.substring(url.indexOf("token=") + "token=".length());
        }
    }

    public record Notice(String to, BillingNotice kind, int daysLeft) {}

    private final List<Sent> sent = new CopyOnWriteArrayList<>();
    private final List<Notice> notices = new CopyOnWriteArrayList<>();

    /** Si es true, los envíos fallan (simula una caída del proveedor de correo). */
    private volatile boolean failing;
    private volatile String providerName = "test";
    private final List<String> tests = new CopyOnWriteArrayList<>();

    public void failing(boolean value) {
        this.failing = value;
    }

    public void provider(String name) {
        this.providerName = name;
    }

    public List<String> tests() {
        return tests;
    }

    @Override
    public void sendTestEmail(String toEmail) {
        if (failing) throw new com.stockmind.mail.EmailDeliveryException("Resend rechazó el correo (prueba) con HTTP 403: dominio sin verificar");
        tests.add(toEmail);
    }

    @Override
    public String provider() {
        return providerName;
    }

    @Override
    public void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl) {
        if (failing) throw new com.stockmind.mail.EmailDeliveryException("proveedor caído");
        notices.add(new Notice(toEmail, kind, daysLeft));
    }

    public List<Notice> notices() {
        return notices;
    }

    @Override
    public void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl) {
        if (failing) throw new com.stockmind.mail.EmailDeliveryException("proveedor caído");
        sent.add(new Sent(toEmail, recipientName, verifyUrl));
    }

    public List<Sent> all() {
        return sent;
    }

    public Sent last() {
        return sent.get(sent.size() - 1);
    }

    public void clear() {
        sent.clear();
        notices.clear();
        tests.clear();
        failing = false;
        providerName = "test";
    }
}
