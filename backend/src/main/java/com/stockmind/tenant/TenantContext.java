package com.stockmind.tenant;

import java.util.function.Supplier;

/**
 * TenantContext — Empresa (organización) de la petición en curso.
 *
 * Lo establece el filtro JWT a partir del claim "org" y lo limpia al terminar.
 * Hibernate lo lee (ver TenantIdentifierResolver) para filtrar automáticamente TODAS las
 * consultas de las entidades con @TenantId y para asignar la empresa al insertar.
 *
 * Es un ThreadLocal: los hilos nuevos (ejecutores, @Async) NO lo heredan; deben
 * establecerlo explícitamente con runAs().
 */
public final class TenantContext {

    /** Valor que usa Hibernate cuando no hay empresa: no coincide con ninguna fila (falla cerrado). */
    public static final long NO_TENANT = -1L;

    private static final ThreadLocal<Long> CURRENT = new ThreadLocal<>();

    private TenantContext() {}

    public static Long get() {
        return CURRENT.get();
    }

    public static void set(Long organizationId) {
        CURRENT.set(organizationId);
    }

    public static void clear() {
        CURRENT.remove();
    }

    /** Empresa actual; lanza si no hay (para código que nunca debe correr sin empresa). */
    public static Long require() {
        Long id = CURRENT.get();
        if (id == null) {
            throw new IllegalStateException("No hay una empresa asociada a esta operación");
        }
        return id;
    }

    /** Ejecuta código como una empresa concreta y restaura el contexto anterior. */
    public static <T> T runAs(Long organizationId, Supplier<T> action) {
        Long previous = CURRENT.get();
        CURRENT.set(organizationId);
        try {
            return action.get();
        } finally {
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
        }
    }

    public static void runAs(Long organizationId, Runnable action) {
        runAs(organizationId, () -> { action.run(); return null; });
    }
}
