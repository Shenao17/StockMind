package com.stockmind.exception;

/**
 * Excepción lanzada cuando un recurso solicitado no existe en la base de datos.
 * Resulta en una respuesta HTTP 404.
 */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
