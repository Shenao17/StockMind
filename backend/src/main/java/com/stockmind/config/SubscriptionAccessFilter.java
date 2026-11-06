package com.stockmind.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stockmind.billing.EntitlementService;
import com.stockmind.billing.EntitlementService.Access;
import com.stockmind.billing.EntitlementService.Snapshot;
import com.stockmind.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Set;

/**
 * SubscriptionAccessFilter — Aplica el plan de la empresa a cada petición (después de la autenticación).
 *
 *  - Suscripción vencida (GRACE): solo lectura; cualquier cambio responde 402 SUBSCRIPTION_READ_ONLY.
 *  - Suspendida o cancelada: todo responde 402 SUBSCRIPTION_BLOCKED (un token aún vigente no sirve).
 *  - Funciones premium fuera del plan (p. ej. /reports): 402 FEATURE_NOT_IN_PLAN.
 *
 * /billing y /auth quedan siempre disponibles: son la vía para pagar y consultar el estado.
 */
@Component
@RequiredArgsConstructor
class SubscriptionAccessFilter extends OncePerRequestFilter {

    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    /** Prefijo de ruta → función premium que exige. */
    private static final Map<String, String> FEATURE_BY_PATH = Map.of("/reports", "REPORTS");

    private final EntitlementService entitlements;
    private final ObjectMapper mapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        Long orgId = TenantContext.get();
        String path = request.getRequestURI();

        if (orgId == null || path.startsWith("/billing") || path.startsWith("/auth")) {
            chain.doFilter(request, response);
            return;
        }

        Snapshot s = entitlements.snapshot(orgId);
        if (s.access() == Access.BLOCKED) {
            deny(response, "SUBSCRIPTION_BLOCKED",
                "Tu cuenta está suspendida. Renueva tu plan para volver a usar StockMind.");
            return;
        }
        if (s.access() == Access.READ_ONLY && !SAFE_METHODS.contains(request.getMethod())) {
            deny(response, "SUBSCRIPTION_READ_ONLY",
                "Tu plan venció: StockMind está en modo solo lectura. Renueva tu plan para hacer cambios.");
            return;
        }
        for (var entry : FEATURE_BY_PATH.entrySet()) {
            if (path.startsWith(entry.getKey()) && !s.hasFeature(entry.getValue())) {
                deny(response, "FEATURE_NOT_IN_PLAN",
                    "Esta función no está incluida en tu plan " + s.planName() + ". Mejora tu plan para usarla.");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private void deny(HttpServletResponse response, String code, String message) throws IOException {
        response.setStatus(HttpStatus.PAYMENT_REQUIRED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        mapper.writeValue(response.getWriter(), Map.of(
            "error", message, "code", code, "timestamp", LocalDateTime.now().toString()));
    }

    /** El filtro vive solo dentro de la cadena de seguridad (después de JwtAuthFilter), no como filtro suelto. */
    @Bean
    static FilterRegistrationBean<SubscriptionAccessFilter> disableContainerRegistration(SubscriptionAccessFilter f) {
        FilterRegistrationBean<SubscriptionAccessFilter> reg = new FilterRegistrationBean<>(f);
        reg.setEnabled(false);
        return reg;
    }
}
