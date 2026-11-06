package com.stockmind.billing;

import com.stockmind.model.Payment;

/**
 * PaymentProvider — Pasarela de pagos.
 *
 * Hoy solo existe SimulatedPaymentProvider (propiedad stockmind.payments.provider=simulated).
 * Para cobrar de verdad se agrega una implementación (p. ej. Wompi): crea el cobro en la pasarela,
 * devuelve la URL de pago y confirma el pago con un webhook firmado que llama a
 * PaymentService.markPaid(reference). El resto del sistema no cambia.
 */
public interface PaymentProvider {

    /** Nombre guardado en payments.provider. */
    String name();

    /** URL a la que se envía al cliente para pagar. */
    String checkoutUrl(Payment payment);

    /** true solo en el simulador: permite confirmar el pago sin pasarela (NUNCA en producción). */
    boolean allowsSimulation();
}
