package com.stockmind;

import com.stockmind.model.User;
import com.stockmind.support.IntegrationTestBase;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Verifica que el backend aplica los roles por sí mismo (no solo el gateway). */
class SecurityRolesIntegrationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Value("${jwt.secret}") String secret;

    private MockHttpServletRequestBuilder req(MockHttpServletRequestBuilder b, String auth) {
        if (auth != null) b = b.header("Authorization", auth);
        return b.contentType(MediaType.APPLICATION_JSON).content("{}");
    }

    @Test
    @DisplayName("ADMIN accede a endpoints de administración")
    void adminAllowed() throws Exception {
        String auth = bearer(createUser("admin1", User.Role.ADMIN));
        mvc.perform(req(get("/users"), auth)).andExpect(status().isOk());
        mvc.perform(req(get("/reports/top-products"), auth)).andExpect(status().isOk());
        mvc.perform(req(get("/products"), auth)).andExpect(status().isOk());
        mvc.perform(req(get("/auth/me"), auth)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("SELLER solo puede lo permitido: no administra usuarios, reportes ni escribe productos/inventario")
    void sellerRestricted() throws Exception {
        String auth = bearer(createUser("vendedor1", User.Role.SELLER));
        mvc.perform(req(get("/users"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(post("/users"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(put("/users/1"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(delete("/users/1"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(get("/reports/sales"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(get("/reports/top-products"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(post("/products"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(put("/products/1"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(delete("/products/1"), auth)).andExpect(status().isForbidden());
        mvc.perform(req(post("/inventory/movements"), auth)).andExpect(status().isForbidden());

        // Lo que sí puede hacer
        mvc.perform(req(get("/products"), auth)).andExpect(status().isOk());
        mvc.perform(req(get("/sales"), auth)).andExpect(status().isOk());
        mvc.perform(req(get("/inventory/movements"), auth)).andExpect(status().isOk());
        mvc.perform(req(get("/auth/me"), auth)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Sin token se rechaza todo salvo el login")
    void noToken() throws Exception {
        mvc.perform(req(get("/products"), null)).andExpect(status().isForbidden());
        mvc.perform(req(get("/sales"), null)).andExpect(status().isForbidden());
        mvc.perform(req(get("/users"), null)).andExpect(status().isForbidden());
        // /auth/login es pública: con cuerpo vacío responde 400 de validación, no 403
        mvc.perform(req(post("/auth/login"), null)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Un token firmado con otro secreto se rechaza")
    void forgedToken() throws Exception {
        String forged = Jwts.builder()
            .setSubject("admin1").claim("role", "ADMIN")
            .setExpiration(new Date(System.currentTimeMillis() + 60_000))
            .signWith(Keys.hmacShaKeyFor(
                "otro-secreto-completamente-distinto-1234567890".getBytes(StandardCharsets.UTF_8)),
                SignatureAlgorithm.HS256)
            .compact();
        mvc.perform(req(get("/users"), "Bearer " + forged)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Un token válido pero sin rol no concede ningún acceso")
    void tokenWithoutRole() throws Exception {
        String noRole = Jwts.builder()
            .setSubject("admin1")
            .setExpiration(new Date(System.currentTimeMillis() + 60_000))
            .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)), SignatureAlgorithm.HS256)
            .compact();
        mvc.perform(req(get("/products"), "Bearer " + noRole)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Un token expirado se rechaza")
    void expiredToken() throws Exception {
        String expired = Jwts.builder()
            .setSubject("admin1").claim("role", "ADMIN")
            .setExpiration(new Date(System.currentTimeMillis() - 60_000))
            .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)), SignatureAlgorithm.HS256)
            .compact();
        mvc.perform(req(get("/users"), "Bearer " + expired)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Un rol desconocido en el token no concede acceso")
    void unknownRole() throws Exception {
        String weird = Jwts.builder()
            .setSubject("admin1").claim("role", "SUPERUSER")
            .setExpiration(new Date(System.currentTimeMillis() + 60_000))
            .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)), SignatureAlgorithm.HS256)
            .compact();
        mvc.perform(req(get("/users"), "Bearer " + weird)).andExpect(status().isForbidden());
        mvc.perform(req(get("/products"), "Bearer " + weird)).andExpect(status().isForbidden());
    }
}
