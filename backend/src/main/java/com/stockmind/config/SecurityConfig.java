package com.stockmind.config;

import com.stockmind.platform.PlatformPermission;
import com.stockmind.repository.UserRepository;
import com.stockmind.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * SecurityConfig — Configuración de seguridad de Spring Boot
 *
 * - Sin estado (stateless) con JWT
 * - Solo /auth/login y /auth/mfa/* son públicas; el resto requiere token válido
 * - El rol se lee del claim "role" del JWT y se aplica aquí también
 *   (el gateway sigue validando; esto evita depender solo de él)
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private static final String PERM_VIEW = PlatformPermission.ORG_VIEW.authority();

    private final JwtAuthFilter jwtAuthFilter;
    private final SubscriptionAccessFilter subscriptionAccessFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            // El backend es interno (solo lo llama el gateway, servidor a servidor):
            // sin CORS, ningún navegador de otro origen puede leer sus respuestas.
            .cors(cors -> cors.disable())
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/auth/mfa/self/**").hasAnyRole("ADMIN", "SELLER")   // desde el perfil, con sesión de empresa
                .requestMatchers("/auth/login", "/auth/mfa/**").permitAll()
                // Registro y verificación de correo: sin sesión (el gateway pone CAPTCHA y límites)
                .requestMatchers("/public/**").permitAll()
                // Perfil: cualquier sesión válida (empresa o equipo de plataforma); el desafío 2FA no cuenta
                .requestMatchers("/auth/me").hasAnyRole("ADMIN", "SELLER", "PLATFORM_OWNER", "PLATFORM_BILLING",
                    "PLATFORM_SUPPORT", "PLATFORM_VIEWER")
                // Equipo de plataforma: cada endpoint exige un PERMISO (no un rol concreto)
                .requestMatchers(HttpMethod.GET, "/platform/organizations/**", "/platform/summary").hasAuthority(PERM_VIEW)
                .requestMatchers(HttpMethod.GET, "/platform/payments").hasAuthority(PlatformPermission.PAYMENT_VIEW.authority())
                .requestMatchers(HttpMethod.GET, "/platform/audit").hasAuthority(PlatformPermission.AUDIT_VIEW.authority())
                .requestMatchers(HttpMethod.POST, "/platform/organizations").hasAuthority(PlatformPermission.ORG_CREATE.authority())
                .requestMatchers(HttpMethod.PATCH, "/platform/organizations/*/contact").hasAuthority(PlatformPermission.ORG_EDIT_CONTACT.authority())
                .requestMatchers(HttpMethod.PATCH, "/platform/organizations/*/tax-id").hasAuthority(PlatformPermission.SENSITIVE.authority())
                .requestMatchers(HttpMethod.POST, "/platform/organizations/*/reactivate").hasAuthority(PlatformPermission.ORG_REACTIVATE.authority())
                .requestMatchers(HttpMethod.POST, "/platform/organizations/*/extend-trial").hasAuthority(PlatformPermission.TRIAL_EXTEND.authority())
                .requestMatchers(HttpMethod.POST, "/platform/organizations/*/payment-links").hasAuthority(PlatformPermission.PAYMENT_LINK.authority())
                .requestMatchers(HttpMethod.POST, "/platform/organizations/*/users/*/reset-mfa").hasAuthority(PlatformPermission.SENSITIVE.authority())
                .requestMatchers(HttpMethod.POST, "/platform/organizations/*/*").hasAuthority(PlatformPermission.SENSITIVE.authority())
                .requestMatchers("/platform/team/**").hasAuthority(PlatformPermission.TEAM_MANAGE.authority())
                .requestMatchers("/platform/**").denyAll()
                // Solo ADMIN (misma política que el gateway: defensa en profundidad)
                .requestMatchers("/users/**").hasRole("ADMIN")
                .requestMatchers("/reports/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PUT, "/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/inventory/**").hasRole("ADMIN")
                .requestMatchers("/billing/payments").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/billing/**").hasRole("ADMIN")
                // Cualquier otro endpoint: ADMIN o SELLER (un token sin rol válido no pasa)
                .anyRequest().hasAnyRole("ADMIN", "SELLER")
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            // Después de autenticar (ya hay empresa en el contexto): aplica plan, solo lectura y bloqueo
            .addFilterAfter(subscriptionAccessFilter, JwtAuthFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config)
            throws Exception {
        return config.getAuthenticationManager();
    }
}

/**
 * JwtAuthFilter — Filtro que valida el JWT en cada petición
 * Se ejecuta una vez por request (OncePerRequestFilter).
 */
@Component
@RequiredArgsConstructor
class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtConfig jwtConfig;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        // Cada petición empieza SIN empresa (aunque el hilo trajera una): la empresa sale solo del
        // token de ESTA petición. Al terminar se restaura lo que había (en producción siempre null;
        // en pruebas con MockMvc es la empresa del test).
        final Long previousTenant = TenantContext.get();
        TenantContext.clear();
        try {
            authenticate(request);
            filterChain.doFilter(request, response);
        } finally {
            if (previousTenant == null) TenantContext.clear(); else TenantContext.set(previousTenant);
        }
    }

    private void authenticate(HttpServletRequest request) {
        final String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return;
        }
        final String token = authHeader.substring(7);

        if (jwtConfig.isTokenValid(token) &&
                SecurityContextHolder.getContext().getAuthentication() == null) {

            // Los tokens de desafío (verificación en dos pasos) NO son sesiones
            if (jwtConfig.extractType(token) != null) {
                return;
            }

            String email = jwtConfig.extractUsername(token);
            String role = jwtConfig.extractRole(token);
            Long organizationId = jwtConfig.extractOrganizationId(token);

            // ADMIN y SELLER SIEMPRE pertenecen a una empresa: un token suyo sin "org" no
            // concede nada (p. ej. tokens emitidos antes de la multiempresa). PLATFORM_*
            // no tiene empresa.
            boolean tenantUser = "ADMIN".equals(role) || "SELLER".equals(role);
            boolean platformUser = role != null && role.startsWith("PLATFORM_");
            boolean valid = (tenantUser && organizationId != null) || (platformUser && platformSessionActive(token, email, role));

            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if (valid) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
                if (platformUser) {
                    PlatformPermission.of(role).forEach(p -> authorities.add(new SimpleGrantedAuthority(p.authority())));
                }
            }

            UsernamePasswordAuthenticationToken authToken =
                new UsernamePasswordAuthenticationToken(email, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authToken);

            if (valid && organizationId != null) {
                TenantContext.set(organizationId);
            }
        }
    }

    /**
     * El equipo de plataforma se revalida contra la base en cada petición (es poco tráfico): una
     * cuenta desactivada, con otro rol o con acceso reiniciado pierde la sesión al instante.
     */
    private boolean platformSessionActive(String token, String email, String role) {
        return userRepository.findByEmail(email)
            .filter(u -> Boolean.TRUE.equals(u.getActive()) && u.isPlatformUser() && u.getRole().name().equals(role))
            .filter(u -> {
                if (u.getSessionsValidFrom() == null) return true;
                long validFromSec = u.getSessionsValidFrom().atZone(java.time.ZoneId.systemDefault()).toEpochSecond();
                return jwtConfig.extractIssuedAt(token).getTime() / 1000 >= validFromSec;
            })
            .isPresent();
    }
}
