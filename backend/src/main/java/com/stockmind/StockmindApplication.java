package com.stockmind;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * StockMind — Aplicación principal de Spring Boot
 *
 * Punto de entrada del backend principal. Gestiona:
 * - Autenticación y autorización (JWT + Spring Security)
 * - CRUD de productos, usuarios, inventario y ventas
 * - Reportes de ventas
 * - Persistencia en MySQL vía Spring Data JPA
 *
 * Puerto: 8080 (configurable en application.properties)
 */
@SpringBootApplication
public class StockmindApplication {

    public static void main(String[] args) {
        SpringApplication.run(StockmindApplication.class, args);
    }
}
