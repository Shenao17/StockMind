package com.stockmind.config;

import com.stockmind.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * Componente utilitario para generación y validación de tokens JWT.
 *
 * El secreto configurado en jwt.secret DEBE coincidir exactamente
 * con el configurado en el gateway Node.js (JWT_SECRET en .env),
 * ya que el gateway también verifica los tokens para autorización.
 */
@Component
public class JwtConfig {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expirationMs;

    /**
     * Genera la clave de firma HMAC-SHA256 a partir del secreto configurado.
     */
    private Key getSigningKey() {
        byte[] keyBytes = secret.getBytes();
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * Genera un token JWT para el usuario autenticado.
     * El payload incluye: sub (correo, único en la plataforma), id, role y org (id de la empresa).
     */
    public String generateToken(User user) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("id", user.getId());
        claims.put("role", user.getRole().name());
        if (user.getOrganizationId() != null) {
            claims.put("org", user.getOrganizationId());
        }

        return Jwts.builder()
                .setClaims(claims)
                .setSubject(user.getEmail())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    /**
     * Extrae el correo (subject) del token.
     */
    public String extractUsername(String token) {
        return extractClaims(token).getSubject();
    }

    /**
     * Extrae el rol (ADMIN, SELLER) del claim "role"; null si el token no lo trae.
     */
    public String extractRole(String token) {
        return extractClaims(token).get("role", String.class);
    }

    /**
     * Extrae el id de la empresa del claim "org"; null si el token no lo trae (PLATFORM_ADMIN).
     */
    public Long extractOrganizationId(String token) {
        Object org = extractClaims(token).get("org");
        return org instanceof Number n ? n.longValue() : null;
    }

    /**
     * Verifica si el token es válido (firma correcta y no expirado).
     */
    public boolean isTokenValid(String token) {
        try {
            extractClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    private Claims extractClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}
