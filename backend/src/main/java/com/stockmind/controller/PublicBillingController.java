package com.stockmind.controller;

import com.stockmind.billing.BillingQueryService;
import com.stockmind.billing.PaymentService;
import com.stockmind.dto.BillingDTO;
import com.stockmind.model.Payment;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * PublicBillingController — Planes y enlaces de pago SIN sesión.
 *
 * GET  /public/plans                          → planes y precios (para la landing)
 * GET  /public/payments/{reference}           → resumen del cobro (la referencia es impredecible)
 * POST /public/payments/{reference}/simulate  → confirma el pago SOLO con la pasarela simulada
 */
@RestController
@RequestMapping("/public")
@RequiredArgsConstructor
public class PublicBillingController {

    private final BillingQueryService queryService;
    private final PaymentService paymentService;

    @GetMapping("/plans")
    public ResponseEntity<List<BillingDTO.PlanView>> plans() {
        return ResponseEntity.ok(queryService.plans());
    }

    @GetMapping("/payments/{reference}")
    public ResponseEntity<BillingDTO.PaymentView> payment(@PathVariable String reference) {
        return ResponseEntity.ok(view(paymentService.byReference(reference)));
    }

    @PostMapping("/payments/{reference}/simulate")
    public ResponseEntity<BillingDTO.PaymentView> simulate(@PathVariable String reference) {
        return ResponseEntity.ok(view(paymentService.simulatePaid(reference)));
    }

    private BillingDTO.PaymentView view(Payment p) {
        return BillingDTO.PaymentView.of(p, null,
            paymentService.simulationAllowed() && p.getStatus() == Payment.Status.PENDING,
            paymentService.companyName(p.getOrganizationId()));
    }
}
