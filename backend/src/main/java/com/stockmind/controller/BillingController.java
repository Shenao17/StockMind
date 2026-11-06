package com.stockmind.controller;

import com.stockmind.billing.BillingQueryService;
import com.stockmind.billing.PaymentService;
import com.stockmind.dto.BillingDTO;
import com.stockmind.model.Payment;
import com.stockmind.tenant.TenantContext;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * BillingController — Plan y pagos de la empresa del usuario.
 *
 * GET  /billing/subscription → plan, estado, días de prueba, funciones, límites y uso
 * GET  /billing/plans        → planes disponibles con IVA
 * GET  /billing/payments     → historial de cobros (ADMIN)
 * POST /billing/checkout     → crea un cobro y devuelve el enlace de pago (ADMIN)
 *
 * Estas rutas siguen disponibles aunque la suscripción esté vencida o suspendida: es la vía para pagar.
 */
@RestController
@RequestMapping("/billing")
@RequiredArgsConstructor
public class BillingController {

    private final BillingQueryService queryService;
    private final PaymentService paymentService;

    @GetMapping("/subscription")
    public ResponseEntity<BillingDTO.SubscriptionView> subscription() {
        return ResponseEntity.ok(queryService.subscriptionOf(TenantContext.require()));
    }

    @GetMapping("/plans")
    public ResponseEntity<List<BillingDTO.PlanView>> plans() {
        return ResponseEntity.ok(queryService.plans());
    }

    @GetMapping("/payments")
    public ResponseEntity<List<BillingDTO.PaymentView>> payments() {
        return ResponseEntity.ok(paymentService.history(TenantContext.require()).stream()
            .map(p -> BillingDTO.PaymentView.of(p, null, false, null)).toList());
    }

    @PostMapping("/checkout")
    public ResponseEntity<BillingDTO.PaymentView> checkout(@Valid @RequestBody BillingDTO.CheckoutRequest body) {
        Payment payment = paymentService.createCheckout(TenantContext.require(), body.getPlanCode(),
            body.getBillingCycle(), false);
        return ResponseEntity.status(HttpStatus.CREATED).body(BillingDTO.PaymentView.of(
            payment, paymentService.checkoutUrl(payment), paymentService.simulationAllowed(), null));
    }
}
