package com.stockmind.dto;

import com.stockmind.model.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

// =============================================================================
// UserDTO — Para crear y actualizar usuarios
// =============================================================================
public class UserDTO {

    // Mínimo 8 caracteres con al menos una letra y un número.
    // Máximo 72: BCrypt ignora (o rechaza) lo que exceda 72 bytes.
    public static final String PASSWORD_REGEX = "^(?=.*[A-Za-z])(?=.*\\d).{8,72}$";
    public static final String PASSWORD_MSG =
        "La contraseña debe tener entre 8 y 72 caracteres, con al menos una letra y un número";

    @Data
    public static class CreateRequest {

        @NotBlank(message = "El nombre de usuario es obligatorio")
        @Size(min = 3, max = 50, message = "El nombre de usuario debe tener entre 3 y 50 caracteres")
        @Pattern(regexp = "^[A-Za-z0-9._-]+$",
                 message = "El nombre de usuario solo puede tener letras, números, punto, guion y guion bajo")
        private String username;

        @NotBlank(message = "El correo electrónico es obligatorio")
        @Email(message = "El correo electrónico no es válido")
        @Size(max = 100, message = "El correo no puede superar 100 caracteres")
        private String email;

        @NotBlank(message = "La contraseña es obligatoria")
        @Pattern(regexp = PASSWORD_REGEX, message = PASSWORD_MSG)
        private String password;

        // Un valor fuera de ADMIN/SELLER lo rechaza Jackson (400).
        private User.Role role = User.Role.SELLER;
    }

    /** Todos los campos son opcionales: solo se actualiza lo que llegue. */
    @Data
    public static class UpdateRequest {

        @Email(message = "El correo electrónico no es válido")
        @Size(max = 100, message = "El correo no puede superar 100 caracteres")
        private String email;

        private User.Role role;

        private Boolean active;

        @Pattern(regexp = PASSWORD_REGEX, message = PASSWORD_MSG)
        private String password;
    }
}
