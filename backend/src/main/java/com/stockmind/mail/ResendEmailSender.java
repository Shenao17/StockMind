package com.stockmind.mail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * ResendEmailSender — Correo transaccional con Resend (https://resend.com). Activo con STOCKMIND_EMAIL_PROVIDER=resend.
 *
 * Configuración (variables de entorno, nunca en Git):
 *  - RESEND_API_KEY  llave de la API (empieza por "re_").
 *  - EMAIL_FROM      remitente, p. ej. "StockMind <no-responder@tu-dominio.com>". El dominio debe estar verificado en
 *                    Resend (SPF/DKIM). Para pruebas sin dominio Resend permite "onboarding@resend.dev", pero solo
 *                    entrega a la dirección con la que te registraste en Resend.
 *  - EMAIL_REPLY_TO  opcional: a dónde llegan las respuestas.
 *  - EMAIL_LOGO_URL  opcional: dirección PÚBLICA (https) del logo para el encabezado, p. ej. https://app.tu-dominio.com/brand/logo-color.png.
 *                    Sin ella el encabezado lleva el nombre en texto. Usa el PNG (algunos clientes de correo no muestran SVG).
 *
 * Si el proveedor está activo y falta la llave o el remitente, el backend NO arranca (falla ruidosa, no en silencio).
 * Un error del proveedor lanza EmailDeliveryException con el código y el mensaje de Resend; la llave nunca se registra.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "stockmind.mail.provider", havingValue = "resend")
public class ResendEmailSender implements EmailSender {

    private static final Pattern FROM = Pattern.compile("^(?:[^<>\"]+<[^<>@\\s]+@[^<>@\\s]+\\.[^<>@\\s]+>|[^<>@\\s]+@[^<>@\\s]+\\.[^<>@\\s]+)$");

    private final String apiKey;
    private final String from;
    private final String replyTo;
    private final URI endpoint;
    private final Duration timeout;
    private final int verificationHours;
    private final String logoUrl;   // null = encabezado de solo texto
    private final ObjectMapper mapper;
    private final HttpClient http;

    public ResendEmailSender(@Value("${stockmind.mail.resend.api-key:}") String apiKey,
                             @Value("${stockmind.mail.from:}") String from,
                             @Value("${stockmind.mail.reply-to:}") String replyTo,
                             @Value("${stockmind.mail.resend.base-url:https://api.resend.com}") String baseUrl,
                             @Value("${stockmind.mail.timeout-seconds:10}") int timeoutSeconds,
                             @Value("${stockmind.verification-hours:24}") int verificationHours,
                             @Value("${stockmind.mail.logo-url:}") String logoUrl,
                             ObjectMapper mapper) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("STOCKMIND_EMAIL_PROVIDER=resend requiere RESEND_API_KEY");
        }
        if (from == null || !FROM.matcher(from.trim()).matches()) {
            throw new IllegalStateException("STOCKMIND_EMAIL_PROVIDER=resend requiere EMAIL_FROM con el formato "
                + "\"Nombre <correo@dominio.com>\" o \"correo@dominio.com\"");
        }
        this.apiKey = apiKey.trim();
        this.from = from.trim();
        this.replyTo = replyTo == null || replyTo.isBlank() ? null : replyTo.trim();
        this.endpoint = URI.create(baseUrl.replaceAll("/+$", "") + "/emails");
        this.timeout = Duration.ofSeconds(Math.max(1, timeoutSeconds));
        this.verificationHours = verificationHours;
        this.logoUrl = EmailTemplates.safeLogoUrl(logoUrl);
        if (logoUrl != null && !logoUrl.isBlank() && this.logoUrl == null) {
            log.warn("EMAIL_LOGO_URL no es una dirección http(s) válida: los correos llevarán el nombre en texto");
        }
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(this.timeout).build();
        log.info("Correo: Resend activo (remitente {})", this.from);
    }

    @Override
    public void sendVerificationEmail(String toEmail, String recipientName, String verifyUrl) {
        send(toEmail, EmailTemplates.verification(recipientName, verifyUrl, verificationHours, logoUrl), "verificación");
    }

    @Override
    public void sendBillingNotice(String toEmail, String recipientName, BillingNotice kind, int daysLeft, String billingUrl) {
        send(toEmail, EmailTemplates.billing(kind, recipientName, daysLeft, billingUrl, logoUrl), "aviso " + kind);
    }

    @Override
    public void sendTestEmail(String toEmail) {
        send(toEmail, EmailTemplates.test(logoUrl), "prueba");
    }

    @Override
    public String provider() {
        return "resend";
    }

    // ───────────────────────────── Envío ─────────────────────────────

    private void send(String to, EmailTemplates.Message msg, String what) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", from);
        body.put("to", List.of(to));
        body.put("subject", msg.subject());
        body.put("html", msg.html());
        body.put("text", msg.text());
        if (replyTo != null) body.put("reply_to", replyTo);

        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(timeout)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .header("User-Agent", "StockMind-backend")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
            HttpResponse<String> res = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                throw new EmailDeliveryException("Resend rechazó el correo (" + what + ") con HTTP " + res.statusCode() + ": " + reason(res.body()));
            }
            log.info("Correo de {} enviado a {} (id {})", what, to, id(res.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EmailDeliveryException("Se interrumpió el envío del correo (" + what + ")", e);
        } catch (IOException e) {
            throw new EmailDeliveryException("No se pudo contactar a Resend para enviar el correo (" + what + "): " + e.getClass().getSimpleName(), e);
        }
    }

    /** Mensaje de error de Resend, acotado: el cuerpo de una respuesta ajena no se vuelca completo a los logs. */
    private String reason(String body) {
        try {
            JsonNode n = mapper.readTree(body);
            String m = n.hasNonNull("message") ? n.get("message").asText() : "sin detalle";
            return m.length() > 200 ? m.substring(0, 200) : m;
        } catch (IOException e) {
            return "respuesta no válida";
        }
    }

    private String id(String body) {
        try {
            JsonNode n = mapper.readTree(body);
            return n.hasNonNull("id") ? n.get("id").asText() : "?";
        } catch (IOException e) {
            return "?";
        }
    }
}
