package com.stockmind.controller;

import com.stockmind.dto.RegistrationDTO;
import com.stockmind.service.RegistrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * PublicRegistrationController — Endpoints SIN sesión (los llama la landing vía gateway).
 *
 * POST /public/registrations        → autoregistro de una empresa (queda pendiente de verificar el correo)
 * POST /public/verify-email         → confirma el correo con el token recibido
 * POST /public/resend-verification  → reenvía el enlace (respuesta idéntica exista o no el correo)
 *
 * El gateway antepone CAPTCHA, honeypot y límites de frecuencia; aquí solo está la lógica de negocio.
 */
@RestController
@RequestMapping("/public")
@RequiredArgsConstructor
public class PublicRegistrationController {

    private final RegistrationService registrationService;

    @PostMapping("/registrations")
    public ResponseEntity<Map<String, String>> register(@Valid @RequestBody RegistrationDTO.SelfSignup body) {
        registrationService.selfSignup(body);
        // Sin ids ni datos de la empresa: solo se confirma que el proceso continúa por correo
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
            "message", "Te enviamos un correo para confirmar tu dirección. Revisa tu bandeja de entrada."));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<Map<String, String>> verifyEmail(@Valid @RequestBody RegistrationDTO.VerifyEmail body) {
        registrationService.verifyEmail(body.getToken());
        return ResponseEntity.ok(Map.of("message", "Correo verificado. Ya puedes iniciar sesión."));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<Map<String, String>> resend(@Valid @RequestBody RegistrationDTO.Resend body) {
        registrationService.resendVerification(body.getEmail());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
            "message", "Si el correo corresponde a una cuenta pendiente, enviamos un nuevo enlace."));
    }
}
