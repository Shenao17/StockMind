package com.stockmind.controller;

import com.stockmind.billing.AuditService;
import com.stockmind.billing.EntitlementService;
import com.stockmind.dto.PlanAdminDTO;
import com.stockmind.exception.ResourceNotFoundException;
import com.stockmind.model.Plan;
import com.stockmind.model.User;
import com.stockmind.platform.PlatformSecurityService;
import com.stockmind.repository.PlanRepository;
import com.stockmind.repository.SubscriptionRepository;
import com.stockmind.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * PlatformPlansController — Editor de planes, precios y límites (solo el Dueño, con su PIN).
 *
 * GET /platform/plans         → todos los planes (también los inactivos) con cuántas empresas los usan
 * PUT /platform/plans/{code}  → edita nombre, precios, límites, funciones y si está activo
 *
 * Un cambio de límites o funciones aplica a las empresas que ya lo usan de inmediato (se vacía la caché
 * de permisos); un cambio de precio aplica a los cobros NUEVOS (los ya generados conservan su monto).
 * Reducir un límite por debajo del uso actual no borra nada: solo impide agregar más. Los planes no
 * se crean ni se borran desde aquí (el código de un plan identifica sus suscripciones y cobros).
 */
@RestController
@RequestMapping("/platform/plans")
@RequiredArgsConstructor
public class PlatformPlansController {

    private final PlanRepository planRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;
    private final PlatformSecurityService security;
    private final EntitlementService entitlements;
    private final AuditService auditService;

    @Value("${stockmind.billing.default-plan:PRO}")
    private String defaultPlan;

    @GetMapping
    public ResponseEntity<List<PlanAdminDTO.Row>> list() {
        return ResponseEntity.ok(planRepository.findAll().stream()
            .sorted(Comparator.comparing(Plan::getSortOrder))
            .map(p -> PlanAdminDTO.Row.of(p, subscriptionRepository.countByPlanId(p.getId()))).toList());
    }

    @PutMapping("/{code}")
    @Transactional
    public ResponseEntity<PlanAdminDTO.Row> update(@PathVariable String code, @Valid @RequestBody PlanAdminDTO.Update body,
                                                   Authentication auth) {
        User actor = userRepository.findByEmail(auth.getName()).orElseThrow(() -> new BadCredentialsException("Sesión no válida"));
        Plan plan = planRepository.findByCode(code).orElseThrow(() -> new ResourceNotFoundException("Plan no encontrado"));
        security.verifyPin(actor, body.getPin());

        if (body.getPriceYearly() > body.getPriceMonthly() * 12) {
            throw new IllegalArgumentException("El precio anual no puede superar 12 meses del precio mensual");
        }
        if (!PlanAdminDTO.FEATURES.containsAll(body.getFeatures())) {
            throw new IllegalArgumentException("Hay funciones desconocidas; las válidas son " + PlanAdminDTO.FEATURES);
        }
        if (!body.getActive() && plan.getCode().equals(defaultPlan)) {
            throw new IllegalStateException("El plan " + defaultPlan + " es el plan por defecto del registro: no se puede desactivar");
        }

        List<String> changes = new ArrayList<>();
        diff(changes, "nombre", plan.getName(), body.getName().trim());
        diff(changes, "mensual", plan.getPriceMonthly(), body.getPriceMonthly());
        diff(changes, "anual", plan.getPriceYearly(), body.getPriceYearly());
        diff(changes, "usuarios", plan.getMaxUsers(), body.getMaxUsers());
        diff(changes, "productos", plan.getMaxProducts(), body.getMaxProducts());
        diff(changes, "usuario extra", plan.getExtraUserPrice(), body.getExtraUserPrice());
        diff(changes, "activo", plan.getActive(), body.getActive());
        Set<String> newFeatures = new HashSet<>(body.getFeatures());
        if (!newFeatures.equals(plan.getFeatures())) {
            changes.add("funciones " + plan.getFeatures().stream().sorted().toList() + " → " + newFeatures.stream().sorted().toList());
        }
        if (changes.isEmpty()) {
            throw new IllegalArgumentException("No hay cambios que guardar");
        }

        plan.setName(body.getName().trim());
        plan.setPriceMonthly(body.getPriceMonthly());
        plan.setPriceYearly(body.getPriceYearly());
        plan.setMaxUsers(body.getMaxUsers());
        plan.setMaxProducts(body.getMaxProducts());
        plan.setExtraUserPrice(body.getExtraUserPrice());
        plan.setActive(body.getActive());
        plan.getFeatures().clear();
        plan.getFeatures().addAll(newFeatures);
        planRepository.save(plan);

        entitlements.evictAll();
        auditService.record(auth.getName(), "PLAN_UPDATED", null, plan.getCode() + ": " + String.join("; ", changes));
        return ResponseEntity.ok(PlanAdminDTO.Row.of(plan, subscriptionRepository.countByPlanId(plan.getId())));
    }

    private static void diff(List<String> changes, String label, Object before, Object after) {
        if (!java.util.Objects.equals(before, after)) changes.add(label + " " + before + " → " + after);
    }
}
