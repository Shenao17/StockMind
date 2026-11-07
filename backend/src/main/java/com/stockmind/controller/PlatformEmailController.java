package com.stockmind.controller;

import com.stockmind.billing.AuditService;
import com.stockmind.exception.ConflictException;
import com.stockmind.mail.EmailSender;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * PlatformEmailController — Comprobar que el correo funciona (solo el dueño).
 *
 * POST /platform/email-test  { to } → envía un correo de prueba con el proveedor configurado.
 *   - Sin proveedor: 409.
 *   - Modo desarrollo (sin proveedor real): responde sent=false, no envía.
 *   - Proveedor que falla: 502 con el motivo que da el proveedor (dominio sin verificar, llave inválida...).
 */
@RestController
@RequestMapping("/platform/email-test")
@RequiredArgsConstructor
public class PlatformEmailController {

    @Data
    public static class Body {
        @NotBlank(message = "Escribe el correo de destino")
        @Email(message = "El correo de destino no es válido")
        @Size(max = 100, message = "El correo no puede superar 100 caracteres")
        private String to;
    }

    private final EmailSender emailSender;
    private final AuditService auditService;

    @PostMapping
    public ResponseEntity<Map<String, Object>> test(@Valid @RequestBody Body body, Authentication auth) {
        String provider = emailSender.provider();
        if ("none".equals(provider)) {
            throw new ConflictException("No hay proveedor de correo configurado (STOCKMIND_EMAIL_PROVIDER, RESEND_API_KEY y EMAIL_FROM)");
        }
        String to = body.getTo().trim().toLowerCase();
        emailSender.sendTestEmail(to);
        boolean real = !"dev".equals(provider);
        if (real) auditService.record(auth.getName(), "EMAIL_TEST_SENT", null, "a " + to);
        return ResponseEntity.ok(Map.of("provider", provider, "sent", real, "to", to));
    }
}
