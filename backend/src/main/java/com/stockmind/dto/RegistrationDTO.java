package com.stockmind.dto;

import jakarta.validation.constraints.*;
import lombok.Data;
import lombok.EqualsAndHashCode;

// =============================================================================
// RegistrationDTO — Alta de empresas (autoregistro y panel de plataforma)
// =============================================================================
public class RegistrationDTO {

    /** Datos comunes de la empresa y de su primer administrador. */
    @Data
    public static class Company {

        @NotBlank(message = "El nombre de la empresa es obligatorio")
        @Size(min = 2, max = 150, message = "El nombre de la empresa debe tener entre 2 y 150 caracteres")
        private String companyName;

        @Size(max = 200, message = "La razón social no puede superar 200 caracteres")
        private String legalName;

        @NotBlank(message = "El NIT o identificación fiscal es obligatorio")
        @Pattern(regexp = "^[A-Za-z0-9.\\-]{5,20}$",
                 message = "El NIT debe tener entre 5 y 20 caracteres (letras, números, punto o guion)")
        private String taxId;

        @Pattern(regexp = "^[0-9+()\\-\\s]{7,20}$", message = "El teléfono no es válido")
        private String phone;

        @Pattern(regexp = "^[A-Za-z]{2}$", message = "El país debe ser un código de 2 letras (ej. CO)")
        private String country;

        @NotBlank(message = "El correo del administrador es obligatorio")
        @Email(message = "El correo del administrador no es válido")
        @Size(max = 100, message = "El correo no puede superar 100 caracteres")
        private String adminEmail;

        @NotBlank(message = "La contraseña es obligatoria")
        @Pattern(regexp = UserDTO.PASSWORD_REGEX, message = UserDTO.PASSWORD_MSG)
        private String password;
    }

    /** Autoregistro desde la landing: exige aceptar los términos. */
    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class SelfSignup extends Company {
        @AssertTrue(message = "Debes aceptar los términos y condiciones")
        private boolean acceptTerms;
    }

    /** Alta hecha por el dueño de la plataforma (p. ej. tras hablar con el cliente por teléfono). */
    @Data
    @EqualsAndHashCode(callSuper = true)
    public static class ByPlatform extends Company {
        @Email(message = "El correo de contacto no es válido")
        @Size(max = 100, message = "El correo de contacto no puede superar 100 caracteres")
        private String contactEmail;
    }

    @Data
    public static class VerifyEmail {
        @NotBlank(message = "El token es obligatorio")
        @Size(max = 200, message = "El token no es válido")
        private String token;
    }

    @Data
    public static class Resend {
        @NotBlank(message = "El correo es obligatorio")
        @Email(message = "El correo no es válido")
        @Size(max = 100)
        private String email;
    }
}
