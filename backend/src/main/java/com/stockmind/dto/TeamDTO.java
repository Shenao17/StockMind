package com.stockmind.dto;

import com.stockmind.model.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;

/** DTOs de la gestión del equipo de plataforma. Toda mutación exige el PIN del dueño. */
public class TeamDTO {

    @Data
    public static class Create {
        @NotBlank(message = "El nombre es obligatorio")
        @Size(max = 100, message = "El nombre no puede superar 100 caracteres")
        private String fullName;

        @NotBlank(message = "El correo electrónico es obligatorio")
        @Email(message = "El correo electrónico no es válido")
        @Size(max = 100, message = "El correo no puede superar 100 caracteres")
        private String email;

        @NotNull(message = "El rol es obligatorio")
        private User.Role role;

        @NotBlank(message = "Confirma con tu PIN")
        @Size(max = 20)
        private String pin;
    }

    @Data
    public static class Update {
        private User.Role role;
        private Boolean active;
        @Size(max = 100, message = "El nombre no puede superar 100 caracteres")
        private String fullName;

        @NotBlank(message = "Confirma con tu PIN")
        @Size(max = 20)
        private String pin;
    }

    @Data
    public static class Confirm {
        @NotBlank(message = "Confirma con tu PIN")
        @Size(max = 20)
        private String pin;
    }

    public record Member(Long id, String fullName, String email, String role, boolean active,
                         boolean mfaEnabled, boolean mustChangePassword, LocalDateTime createdAt) {
        public static Member of(User u) {
            return new Member(u.getId(), u.getFullName(), u.getEmail(), u.getRole().name(),
                Boolean.TRUE.equals(u.getActive()), u.getMfaEnabledAt() != null,
                Boolean.TRUE.equals(u.getMustChangePassword()), u.getCreatedAt());
        }
    }

    /** La contraseña temporal solo se devuelve en esta respuesta y no vuelve a poder consultarse. */
    public record Created(Member member, String temporaryPassword) {}
}
