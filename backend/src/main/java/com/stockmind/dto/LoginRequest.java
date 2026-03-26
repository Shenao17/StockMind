package com.stockmind.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * DTO: LoginRequest
 * Cuerpo de la petición de inicio de sesión.
 */
@Data
public class LoginRequest {

    @NotBlank(message = "El nombre de usuario es obligatorio")
    private String username;

    @NotBlank(message = "La contraseña es obligatoria")
    private String password;
}
