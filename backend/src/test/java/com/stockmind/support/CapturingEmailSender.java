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

    @Override
    public void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl) {
        notices.add(new Notice(toEmail, kind, daysLeft));
    }

    public List<Notice> notices() {
        return notices;
    }

    @Override
    public void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl) {
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
    }
}
