package com.stockmind.exception;

import org.springframework.http.HttpStatus;

/** Error de facturación/plan con código estable para el frontend (PLAN_LIMIT_REACHED, PAYMENTS_UNAVAILABLE...). */
public class BillingException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public BillingException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
