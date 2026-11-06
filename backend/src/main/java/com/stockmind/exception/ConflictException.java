package com.stockmind.exception;

/** Conflicto con datos existentes (p. ej. NIT o correo ya registrados) → HTTP 409. */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }
}
