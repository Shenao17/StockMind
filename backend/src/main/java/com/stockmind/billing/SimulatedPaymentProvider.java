package com.stockmind.billing;

import com.stockmind.model.Payment;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Pasarela simulada: el "checkout" es una página propia (/pay/{referencia}) con un botón para
 * confirmar el pago. Solo se activa con stockmind.payments.provider=simulated (desarrollo y demos).
 * Sin esa propiedad no hay proveedor y los cobros responden 503: un enlace de pago nunca puede
 * "pagarse" solo en producción.
 */
@Component
@ConditionalOnProperty(name = "stockmind.payments.provider", havingValue = "simulated")
public class SimulatedPaymentProvider implements PaymentProvider {

    @Value("${app.public-url:http://localhost:5173}")
    private String publicUrl;

    @Override
    public String name() {
        return "SIMULATED";
    }

    @Override
    public String checkoutUrl(Payment payment) {
        return publicUrl.replaceAll("/+$", "") + "/pay/" + payment.getReference();
    }

    @Override
    public boolean allowsSimulation() {
        return true;
    }
}
