package com.stockmind.exception;

/** PIN de confirmación incorrecto o bloqueado → 403 con code PIN_INVALID (no 401: la sesión sigue vigente). */
public class PinException extends RuntimeException {
    public PinException(String message) {
        super(message);
    }
}
