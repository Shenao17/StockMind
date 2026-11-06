package com.stockmind.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DTO: LoginResponse
 * Respuesta del endpoint /auth/login con token JWT y datos básicos del usuario.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private String token;
    private Long userId;
    private String username;
    private String email;
    private Long organizationId;
    private String role;
    private String fullName;

    // Equipo de plataforma: el inicio de sesión se completa en un segundo paso
    private Boolean mfaRequired;          // ya tiene app autenticadora: pedir el código
    private Boolean enrollmentRequired;   // primer acceso: configurar app, PIN (y contraseña si es temporal)
    private Boolean mustChangePassword;
    private String challengeToken;
    private java.util.List<String> backupCodes;   // solo al terminar la configuración, una vez
}
