package com.stockmind.mail;

/** El proveedor de correo rechazó el envío o no respondió. Nunca incluye la llave del proveedor. */
public class EmailDeliveryException extends RuntimeException {
    public EmailDeliveryException(String message) {
        super(message);
    }

    public EmailDeliveryException(String message, Throwable cause) {
        super(message, cause);
    }
}
