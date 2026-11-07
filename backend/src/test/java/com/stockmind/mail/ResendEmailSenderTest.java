package com.stockmind.mail;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.mail.EmailSender.BillingNotice;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;

/** ResendEmailSender contra un servidor falso: nada sale a internet ni usa una llave real. */
class ResendEmailSenderTest {

    record Call(String path, String auth, String contentType, JsonNode body) {}

    static final String KEY = "re_llave_falsa_de_pruebas_123";
    static final String FROM = "StockMind <no-responder@stockmind.test>";

    final ObjectMapper mapper = new ObjectMapper();
    final List<Call> calls = new CopyOnWriteArrayList<>();
    HttpServer server;
    volatile int status = 200;
    volatile String reply = "{\"id\":\"msg_123\"}";
    volatile long delayMs = 0;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String raw = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            calls.add(new Call(ex.getRequestURI().getPath(), ex.getRequestHeaders().getFirst("Authorization"),
                ex.getRequestHeaders().getFirst("Content-Type"), mapper.readTree(raw)));
            try { Thread.sleep(delayMs); } catch (InterruptedException ignored) { }
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            try {
                ex.sendResponseHeaders(status, out.length);
                ex.getResponseBody().write(out);
            } catch (java.io.IOException ignored) {
                // el cliente ya cortó (prueba de tiempo agotado)
            } finally {
                ex.close();
            }
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    String logo = "";

    private ResendEmailSender sender(String key, String from, String replyTo, int timeoutSeconds) {
        return new ResendEmailSender(key, from, replyTo, "http://127.0.0.1:" + server.getAddress().getPort() + "/", timeoutSeconds, 24, logo, mapper);
    }

    private ResendEmailSender sender() {
        return sender(KEY, FROM, "", 5);
    }

    // ───────────────────────── Envío ─────────────────────────

    @Test
    @DisplayName("Envía a /emails con la llave en el encabezado y remitente, destinatario, asunto, HTML y texto")
    void sendsExpectedRequest() {
        sender().sendVerificationEmail("ana@cliente.com", "Ana", "https://app.test/verify-email?token=abc123");

        assertEquals(1, calls.size());
        Call c = calls.get(0);
        assertEquals("/emails", c.path());
        assertEquals("Bearer " + KEY, c.auth());
        assertEquals("application/json", c.contentType());
        assertEquals(FROM, c.body().get("from").asText());
        assertEquals("ana@cliente.com", c.body().get("to").get(0).asText());
        assertEquals("Confirma tu correo en StockMind", c.body().get("subject").asText());
        assertTrue(c.body().get("html").asText().contains("https://app.test/verify-email?token=abc123"));
        assertTrue(c.body().get("text").asText().contains("https://app.test/verify-email?token=abc123"));
        assertTrue(c.body().get("text").asText().contains("24 horas"));
        assertFalse(c.body().has("reply_to"));
    }

    @Test
    @DisplayName("Con EMAIL_REPLY_TO configurado, lo envía como reply_to")
    void replyTo() {
        sender(KEY, FROM, "soporte@stockmind.test", 5).sendTestEmail("dueno@x.com");
        assertEquals("soporte@stockmind.test", calls.get(0).body().get("reply_to").asText());
        assertEquals("Correo de prueba de StockMind", calls.get(0).body().get("subject").asText());
    }

    @Test
    @DisplayName("Cada aviso de cobro lleva su asunto, los días que faltan y el enlace")
    void billingNotices() {
        ResendEmailSender s = sender();
        s.sendBillingNotice("a@x.com", "Ferretería", BillingNotice.TRIAL_ENDING, 5, "https://app.test/billing");
        s.sendBillingNotice("a@x.com", "Ferretería", BillingNotice.TRIAL_ENDING, 1, "https://app.test/billing");
        s.sendBillingNotice("a@x.com", "Ferretería", BillingNotice.RENEWAL_REMINDER, 3, "https://app.test/billing");
        s.sendBillingNotice("a@x.com", "Ferretería", BillingNotice.GRACE_STARTED, 7, "https://app.test/billing");
        s.sendBillingNotice("a@x.com", "Ferretería", BillingNotice.SUSPENDED, 0, "https://app.test/billing");

        List<String> subjects = new ArrayList<>();
        calls.forEach(c -> subjects.add(c.body().get("subject").asText()));
        assertEquals(List.of(
            "Tu prueba gratis de StockMind termina en 5 días",
            "Tu prueba gratis de StockMind termina mañana",
            "Tu plan de StockMind vence en 3 días",
            "Tu plan de StockMind venció: acceso solo de lectura",
            "Tu cuenta de StockMind fue suspendida"), subjects);
        assertTrue(calls.get(3).body().get("text").asText().contains("7 días"));
        calls.forEach(c -> assertTrue(c.body().get("html").asText().contains("https://app.test/billing")));
    }

    @Test
    @DisplayName("Un nombre con HTML no se inyecta en el correo (se escapa)")
    void escapesHtml() {
        sender().sendVerificationEmail("a@x.com", "<script>alert(1)</script>", "https://app.test/v?token=a&b=<x>");
        String html = calls.get(0).body().get("html").asText();
        assertFalse(html.contains("<script>"), "no debe quedar la etiqueta");
        assertTrue(html.contains("&lt;script&gt;"));
        assertFalse(html.contains("b=<x>"));
        assertTrue(html.contains("token=a&amp;b=&lt;x&gt;"));
    }

    @Test
    @DisplayName("Con EMAIL_LOGO_URL el encabezado lleva el logo (con texto alternativo); sin ella queda el nombre en texto")
    void logoInHeader() {
        sender().sendTestEmail("a@x.com");
        String sinLogo = calls.get(0).body().get("html").asText();
        assertFalse(sinLogo.contains("<img"));
        assertTrue(sinLogo.contains(">StockMind</span>"));

        logo = "https://app.stockmind.test/brand/logo-color.png";
        sender().sendVerificationEmail("a@x.com", "Ana", "https://app.test/v?token=a");
        String html = calls.get(1).body().get("html").asText();
        assertTrue(html.contains("<img src=\"https://app.stockmind.test/brand/logo-color.png\" alt=\"StockMind\""));
        assertTrue(html.contains("linear-gradient(90deg,#3978F6,#42D9E8,#8065F5)"));
    }

    @Test
    @DisplayName("Una dirección de logo que no sea http(s) (o con comillas o etiquetas) se ignora: no se inyecta nada")
    void unsafeLogoIgnored() {
        for (String bad : new String[]{"javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://x.com/l.png",
                "https://x.com/a\" onerror=\"alert(1)", "https://x.com/<script>", "no es una url"}) {
            logo = bad;
            calls.clear();
            sender().sendTestEmail("a@x.com");
            String html = calls.get(0).body().get("html").asText();
            assertFalse(html.contains("<img"), "no debe usar " + bad);
            assertFalse(html.contains("onerror"));
        }
        assertEquals("https://x.com/l.png", EmailTemplates.safeLogoUrl("  https://x.com/l.png "));
        assertNull(EmailTemplates.safeLogoUrl(null));
    }

    // ───────────────────────── Errores ─────────────────────────

    @Test
    @DisplayName("Si Resend rechaza (p. ej. dominio sin verificar) lanza un error con el motivo, sin la llave")
    void providerRejects() {
        status = 403;
        reply = "{\"statusCode\":403,\"name\":\"validation_error\",\"message\":\"The stockmind.test domain is not verified\"}";
        EmailDeliveryException e = assertThrows(EmailDeliveryException.class, () -> sender().sendTestEmail("a@x.com"));
        assertTrue(e.getMessage().contains("403"));
        assertTrue(e.getMessage().contains("domain is not verified"));
        assertFalse(e.getMessage().contains(KEY), "la llave nunca debe aparecer");
    }

    @Test
    @DisplayName("Una respuesta de error que no es JSON no rompe el manejo del error")
    void garbageError() {
        status = 502;
        reply = "<html>Bad gateway</html>";
        EmailDeliveryException e = assertThrows(EmailDeliveryException.class, () -> sender().sendTestEmail("a@x.com"));
        assertTrue(e.getMessage().contains("502"));
        assertFalse(e.getMessage().contains("<html>"), "no se vuelca el cuerpo ajeno");
    }

    @Test
    @DisplayName("Si Resend no responde a tiempo, falla con tiempo agotado en vez de colgar el sistema")
    void timeout() {
        delayMs = 3000;
        long t0 = System.currentTimeMillis();
        assertThrows(EmailDeliveryException.class, () -> sender(KEY, FROM, "", 1).sendTestEmail("a@x.com"));
        assertTrue(System.currentTimeMillis() - t0 < 2800, "debe cortar cerca de 1 s, no esperar los 3 s");
    }

    @Test
    @DisplayName("Servidor inalcanzable: error controlado")
    void unreachable() {
        int port = server.getAddress().getPort();
        server.stop(0);
        EmailDeliveryException e = assertThrows(EmailDeliveryException.class,
            () -> new ResendEmailSender(KEY, FROM, "", "http://127.0.0.1:" + port, 2, 24, "", mapper).sendTestEmail("a@x.com"));
        assertFalse(e.getMessage().contains(KEY));
    }

    // ───────────────────────── Configuración ─────────────────────────

    @Test
    @DisplayName("Sin llave o con un remitente mal escrito el backend NO arranca (falla ruidosa)")
    void validatesConfiguration() {
        assertThrows(IllegalStateException.class, () -> sender("", FROM, "", 5));
        assertThrows(IllegalStateException.class, () -> sender("   ", FROM, "", 5));
        assertThrows(IllegalStateException.class, () -> sender(KEY, "", "", 5));
        assertThrows(IllegalStateException.class, () -> sender(KEY, "sin-arroba", "", 5));
        assertThrows(IllegalStateException.class, () -> sender(KEY, "StockMind <roto>", "", 5));
        // formatos válidos
        assertDoesNotThrow(() -> sender(KEY, "onboarding@resend.dev", "", 5));
        assertDoesNotThrow(() -> sender(KEY, "StockMind <no-responder@dominio.co>", "", 5));
        assertEquals("resend", sender().provider());
    }
}
