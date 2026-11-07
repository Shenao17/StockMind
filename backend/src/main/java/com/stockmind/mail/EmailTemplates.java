package com.stockmind.mail;

import com.stockmind.mail.EmailSender.BillingNotice;
import org.springframework.web.util.HtmlUtils;

/**
 * Plantillas de los correos (asunto, HTML y texto plano). Todo dato que venga de una persona (nombre de
 * usuario o de empresa) se escapa: nadie puede inyectar HTML en un correo que enviamos nosotros.
 * El HTML usa estilos en línea y una sola columna: se ve igual en cualquier cliente de correo.
 */
public final class EmailTemplates {

    public record Message(String subject, String html, String text) {}

    private static final String ACCENT = "#5656d9";

    private EmailTemplates() {}

    public static Message verification(String name, String url, int hours) {
        String who = greeting(name);
        return new Message(
            "Confirma tu correo en StockMind",
            layout("Confirma tu correo",
                p(who + "Gracias por registrarte en StockMind. Para activar tu cuenta y empezar tu prueba gratis, confirma tu correo:")
                    + button("Confirmar mi correo", url)
                    + small("Este enlace vence en " + hours + " horas y solo sirve una vez. Si no creaste una cuenta en StockMind, ignora este mensaje."),
                url),
            plain(who + "Gracias por registrarte en StockMind. Confirma tu correo para activar tu cuenta:\n\n" + url
                + "\n\nEl enlace vence en " + hours + " horas y solo sirve una vez. Si no creaste una cuenta, ignora este mensaje."));
    }

    public static Message billing(BillingNotice kind, String name, int daysLeft, String url) {
        String who = greeting(name);
        String days = daysLeft <= 0 ? "hoy" : daysLeft == 1 ? "mañana" : "en " + daysLeft + " días";
        String subject;
        String title;
        String body;
        String cta;
        switch (kind) {
            case TRIAL_ENDING -> {
                subject = "Tu prueba gratis de StockMind termina " + days;
                title = "Tu prueba gratis está por terminar";
                body = "Tu prueba gratis termina " + days + ". Elige un plan para seguir usando StockMind sin interrupciones; tus datos se conservan.";
                cta = "Elegir mi plan";
            }
            case RENEWAL_REMINDER -> {
                subject = "Tu plan de StockMind vence " + days;
                title = "Tu plan está por vencer";
                body = "Tu plan vence " + days + ". Renuévalo a tiempo para no perder el acceso completo.";
                cta = "Renovar mi plan";
            }
            case GRACE_STARTED -> {
                subject = "Tu plan de StockMind venció: acceso solo de lectura";
                title = "Tu plan venció";
                body = "Tu plan venció. Durante los próximos " + Math.max(daysLeft, 0) + " días puedes consultar tu información, pero no registrar cambios. Renueva para recuperar el acceso completo.";
                cta = "Renovar ahora";
            }
            case SUSPENDED -> {
                subject = "Tu cuenta de StockMind fue suspendida";
                title = "Tu cuenta está suspendida";
                body = "Suspendimos el acceso porque el plan no se renovó. Tus datos se conservan: al pagar, todo vuelve a la normalidad.";
                cta = "Reactivar mi cuenta";
            }
            default -> throw new IllegalArgumentException("Aviso desconocido: " + kind);
        }
        return new Message(subject,
            layout(title, p(who + body) + button(cta, url) + small("Si ya pagaste, ignora este mensaje: tu pago puede tardar unos minutos en reflejarse."), url),
            plain(who + body + "\n\n" + cta + ": " + url + "\n\nSi ya pagaste, ignora este mensaje."));
    }

    public static Message test() {
        return new Message("Correo de prueba de StockMind",
            layout("Todo en orden", p("Este es un correo de prueba. Si lo estás leyendo, StockMind puede enviar correos correctamente."), null),
            plain("Este es un correo de prueba. Si lo estás leyendo, StockMind puede enviar correos correctamente."));
    }

    // ───────────────────────────── Piezas ─────────────────────────────

    private static String greeting(String name) {
        return name == null || name.isBlank() ? "Hola. " : "Hola " + name.trim() + ". ";
    }

    private static String p(String text) {
        return "<p style=\"margin:0 0 20px;font-size:15px;line-height:1.6;color:#2b2d3a\">" + HtmlUtils.htmlEscape(text) + "</p>";
    }

    private static String small(String text) {
        return "<p style=\"margin:24px 0 0;font-size:12px;line-height:1.5;color:#7a7d90\">" + HtmlUtils.htmlEscape(text) + "</p>";
    }

    private static String button(String label, String url) {
        return "<p style=\"margin:0\"><a href=\"" + HtmlUtils.htmlEscape(url) + "\" style=\"display:inline-block;padding:12px 24px;"
            + "background:" + ACCENT + ";color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px\">"
            + HtmlUtils.htmlEscape(label) + "</a></p>";
    }

    /** Texto plano: lo que escribió una persona nunca se interpreta como HTML (aquí no hace falta escapar). */
    private static String plain(String text) {
        return text + "\n\n— StockMind";
    }

    private static String layout(String title, String content, String fallbackUrl) {
        String fallback = fallbackUrl == null ? ""
            : "<p style=\"margin:20px 0 0;font-size:12px;line-height:1.5;color:#7a7d90\">¿El botón no funciona? Copia este enlace en tu navegador:<br>"
              + "<span style=\"word-break:break-all\">" + HtmlUtils.htmlEscape(fallbackUrl) + "</span></p>";
        return "<!doctype html><html lang=\"es\"><body style=\"margin:0;padding:0;background:#f3f4f8;font-family:Arial,Helvetica,sans-serif\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f3f4f8;padding:32px 12px\"><tr><td align=\"center\">"
            + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden\">"
            + "<tr><td style=\"background:#14151c;padding:22px 32px\"><span style=\"font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.02em\">StockMind</span></td></tr>"
            + "<tr><td style=\"padding:32px\"><h1 style=\"margin:0 0 16px;font-size:20px;color:#14151c\">" + HtmlUtils.htmlEscape(title) + "</h1>"
            + content + fallback + "</td></tr>"
            + "<tr><td style=\"padding:16px 32px;background:#fafafc;font-size:11px;color:#9a9db0\">Mensaje automático de StockMind. Por favor no respondas a este correo.</td></tr>"
            + "</table></td></tr></table></body></html>";
    }
}
