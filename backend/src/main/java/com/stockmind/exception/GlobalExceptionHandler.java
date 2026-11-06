package com.stockmind.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * GlobalExceptionHandler — Manejo centralizado de excepciones
 *
 * Respuestas JSON consistentes: { error, timestamp, [details] }.
 *
 * Regla de seguridad: el cliente NUNCA recibe mensajes internos de excepciones
 * inesperadas (SQL, clases, rutas). Esos casos se registran en el log del
 * servidor y se devuelve un mensaje genérico. Solo se muestran los mensajes de
 * excepciones de negocio escritas a propósito (ResourceNotFound, IllegalState,
 * IllegalArgument, BadCredentials).
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** Recurso no encontrado → 404 */
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(ResourceNotFoundException ex) {
        return buildResponse(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    /** Límite de plan, función no incluida o pagos no disponibles → 402/503 con código estable */
    @ExceptionHandler(BillingException.class)
    public ResponseEntity<Map<String, Object>> handleBilling(BillingException ex) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", ex.getMessage());
        body.put("code", ex.getCode());
        body.put("timestamp", LocalDateTime.now().toString());
        return ResponseEntity.status(ex.getStatus()).body(body);
    }

    /** PIN de confirmación incorrecto o bloqueado → 403 con código estable (la sesión sigue vigente) */
    @ExceptionHandler(PinException.class)
    public ResponseEntity<Map<String, Object>> handlePin(PinException ex) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", ex.getMessage());
        body.put("code", "PIN_INVALID");
        body.put("timestamp", LocalDateTime.now().toString());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    /** Datos ya registrados (NIT, correo) → 409 */
    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(ConflictException ex) {
        return buildResponse(HttpStatus.CONFLICT, ex.getMessage());
    }

    /** Error de negocio (stock insuficiente, reglas) → 400 */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleBusinessError(IllegalStateException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /** Argumento ilegal (SKU duplicado, número mal formado) → 400 */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        if (ex instanceof NumberFormatException) {
            return buildResponse(HttpStatus.BAD_REQUEST, "Valor numérico inválido");
        }
        return buildResponse(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /** Credenciales incorrectas → 401 */
    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex) {
        return buildResponse(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    /** Sin permisos → 403 */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return buildResponse(HttpStatus.FORBIDDEN, "No tienes permisos para esta acción");
    }

    /** Errores de Bean Validation (@Valid) → 400 con detalle por campo */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex) {

        Map<String, String> fieldErrors = new TreeMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fe.getField(), fe.getDefaultMessage());
        }

        // El frontend muestra "error": incluye los mensajes para que sean visibles
        String summary = fieldErrors.isEmpty()
            ? "Error de validación"
            : String.join(". ", fieldErrors.values());

        Map<String, Object> body = new HashMap<>();
        body.put("error", summary);
        body.put("details", fieldErrors);
        body.put("timestamp", LocalDateTime.now().toString());

        return ResponseEntity.badRequest().body(body);
    }

    /** JSON mal formado o valor de enum inválido → 400 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "El cuerpo de la petición no es válido");
    }

    /** Parámetro faltante o de tipo incorrecto → 400 */
    @ExceptionHandler({MissingServletRequestParameterException.class,
                       MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> handleBadParam(Exception ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Parámetros de la petición inválidos");
    }

    /** Fecha con formato incorrecto → 400 */
    @ExceptionHandler(DateTimeParseException.class)
    public ResponseEntity<Map<String, Object>> handleBadDate(DateTimeParseException ex) {
        return buildResponse(HttpStatus.BAD_REQUEST, "Formato de fecha inválido (use yyyy-MM-dd)");
    }

    /** Violación de restricción en base de datos (duplicados, claves foráneas) → 409 */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleIntegrity(DataIntegrityViolationException ex) {
        log.warn("Violación de integridad de datos", ex);
        return buildResponse(HttpStatus.CONFLICT,
            "La operación no se pudo completar: el valor ya existe o está en uso");
    }

    /** Ruta inexistente → 404 */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNoResource(NoResourceFoundException ex) {
        return buildResponse(HttpStatus.NOT_FOUND, "Recurso no encontrado");
    }

    /** Método HTTP no permitido → 405 */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return buildResponse(HttpStatus.METHOD_NOT_ALLOWED, "Método no permitido");
    }

    /** Cualquier otra excepción: se registra internamente y NO se expone el detalle → 500 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneral(Exception ex) {
        log.error("Error interno no controlado", ex);
        return buildResponse(HttpStatus.INTERNAL_SERVER_ERROR,
            "Error interno del servidor. Inténtalo de nuevo más tarde.");
    }

    // ---------------------------------------------------------------------------
    private ResponseEntity<Map<String, Object>> buildResponse(HttpStatus status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", message);
        body.put("timestamp", LocalDateTime.now().toString());
        return ResponseEntity.status(status).body(body);
    }
}
