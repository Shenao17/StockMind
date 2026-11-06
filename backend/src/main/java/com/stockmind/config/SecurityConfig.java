package com.stockmind.config;

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
import java.util.List;

/**
 * SecurityConfig — Configuración de seguridad de Spring Boot
 *
 * - Sin estado (stateless) con JWT
 * - Solo /auth/login es pública; el resto requiere token válido
 * - El rol se lee del claim "role" del JWT y se aplica aquí también
 *   (el gateway sigue validando; esto evita depender solo de él)
 */
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

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
                .requestMatchers("/auth/login").permitAll()
                // Registro y verificación de correo: sin sesión (el gateway pone CAPTCHA y límites)
                .requestMatchers("/public/**").permitAll()
                // Operaciones del dueño de la plataforma
                .requestMatchers("/platform/**").hasRole("PLATFORM_ADMIN")
                // Solo ADMIN (misma política que el gateway: defensa en profundidad)
                .requestMatchers("/users/**").hasRole("ADMIN")
                .requestMatchers("/reports/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.PUT, "/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/products/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.POST, "/inventory/**").hasRole("ADMIN")
                // Cualquier otro endpoint: ADMIN o SELLER (un token sin rol válido no pasa)
                .anyRequest().hasAnyRole("ADMIN", "SELLER")
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

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

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String token = authHeader.substring(7);
        final Long previousTenant = TenantContext.get();

        if (jwtConfig.isTokenValid(token) &&
                SecurityContextHolder.getContext().getAuthentication() == null) {

            String email = jwtConfig.extractUsername(token);
            String role = jwtConfig.extractRole(token);
            Long organizationId = jwtConfig.extractOrganizationId(token);

            // ADMIN y SELLER SIEMPRE pertenecen a una empresa: un token suyo sin "org" no
            // concede nada (p. ej. tokens emitidos antes de la multiempresa). PLATFORM_ADMIN
            // no tiene empresa.
            boolean tenantUser = "ADMIN".equals(role) || "SELLER".equals(role);
            boolean valid = (tenantUser && organizationId != null) || "PLATFORM_ADMIN".equals(role);

            List<SimpleGrantedAuthority> authorities =
                valid ? List.of(new SimpleGrantedAuthority("ROLE_" + role)) : List.of();

            UsernamePasswordAuthenticationToken authToken =
                new UsernamePasswordAuthenticationToken(email, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authToken);

            if (valid && organizationId != null) {
                TenantContext.set(organizationId);
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            // El ThreadLocal nunca debe filtrarse a otra petición: se restaura lo que había antes
            // (en producción siempre es null; en pruebas con MockMvc es la empresa del test)
            if (previousTenant == null) TenantContext.clear(); else TenantContext.set(previousTenant);
        }
    }
}
