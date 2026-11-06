package com.stockmind.controller;

import com.stockmind.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * DashboardController — Resumen del panel principal (ADMIN y SELLER)
 *
 * GET /dashboard/summary → contadores, totales de hoy/mes, stock crítico y ventas recientes
 */
@RestController
@RequestMapping("/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> summary() {
        return ResponseEntity.ok(dashboardService.summary());
    }
}
