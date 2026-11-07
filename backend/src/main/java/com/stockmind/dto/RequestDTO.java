package com.stockmind.dto;

import com.stockmind.model.PlatformRequest;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

/** Solicitudes de acciones sensibles del equipo de plataforma, a la espera del dueño. */
public class RequestDTO {

    @Data
    public static class Create {
        @NotNull(message = "El tipo de solicitud es obligatorio")
        private PlatformRequest.Type type;

        @NotNull(message = "La empresa es obligatoria")
        private Long organizationId;

        @NotBlank(message = "Explica el motivo de la solicitud")
        @Size(min = 10, max = 500, message = "El motivo debe tener entre 10 y 500 caracteres")
        private String reason;

        /** Plan, ciclo, días o NIT según el tipo; se valida y se limpia en el servidor. */
        private Map<String, Object> params;
    }

    /** Aprobar: exige el PIN del dueño; la nota es opcional. */
    @Data
    public static class Approve {
        @NotBlank(message = "Confirma con tu PIN")
        @Size(max = 20)
        private String pin;

        @Size(max = 500, message = "La nota no puede superar 500 caracteres")
        private String note;
    }

    /** Rechazar: la nota (motivo del rechazo) es obligatoria para que quien pidió sepa por qué. */
    @Data
    public static class Reject {
        @NotBlank(message = "Explica por qué se rechaza")
        @Size(min = 5, max = 500, message = "El motivo del rechazo debe tener entre 5 y 500 caracteres")
        private String note;
    }

    /** status puede ser EXPIRED (derivado): una solicitud pendiente de más de 7 días ya no se aprueba. */
    public record Row(Long id, String type, Long organizationId, String organizationName, Map<String, Object> params,
                      String reason, String status, String requestedBy, LocalDateTime createdAt,
                      String decidedBy, LocalDateTime decidedAt, String decisionNote) {}
}
