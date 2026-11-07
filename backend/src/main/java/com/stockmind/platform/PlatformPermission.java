package com.stockmind.platform;

import com.stockmind.model.User;

import java.util.EnumSet;
import java.util.Set;

/**
 * Permisos del equipo de plataforma. Cada rol PLATFORM_* concede un conjunto fijo; los endpoints
 * /platform/** exigen el permiso (authority "PERM_x"), no el rol.
 *
 * SENSITIVE: suspender, cancelar, cambiar de plan, registrar pagos manuales y extender pruebas más
 * de {@link #MAX_TRIAL_EXTENSION_DAYS} días. Solo el dueño las hace directamente; el resto del
 * equipo las pedirá con aprobación (fase siguiente).
 */
public enum PlatformPermission {
    ORG_VIEW,        // ver empresas
    ORG_CREATE,      // crear empresa
    ORG_EDIT_CONTACT, // corregir nombre, teléfono y correo de contacto de una empresa
    PAYMENT_VIEW,    // ver los cobros (de una empresa y la pantalla de cobros) y los ingresos
    AUDIT_VIEW,      // ver la auditoría
    ORG_REACTIVATE,  // reactivar una empresa suspendida
    TRIAL_EXTEND,    // extender la prueba (hasta MAX_TRIAL_EXTENSION_DAYS salvo SENSITIVE)
    PAYMENT_LINK,    // generar enlaces de pago
    SENSITIVE,       // operaciones que requieren al dueño
    REQUEST_CREATE,  // pedir acciones sensibles al dueño (con motivo)
    REQUEST_REVIEW,  // aprobar o rechazar solicitudes (solo el dueño)
    PLANS_MANAGE,    // editar planes, precios y límites (solo el dueño)
    TEAM_MANAGE;     // gestionar el equipo de plataforma

    public static final int MAX_TRIAL_EXTENSION_DAYS = 7;
    public static final String PREFIX = "PERM_";

    public String authority() {
        return PREFIX + name();
    }

    public static Set<PlatformPermission> of(User.Role role) {
        return switch (role) {
            case PLATFORM_OWNER -> EnumSet.allOf(PlatformPermission.class);
            case PLATFORM_BILLING -> EnumSet.of(ORG_VIEW, ORG_CREATE, ORG_REACTIVATE, TRIAL_EXTEND, PAYMENT_LINK, PAYMENT_VIEW, AUDIT_VIEW, REQUEST_CREATE);
            case PLATFORM_SUPPORT -> EnumSet.of(ORG_VIEW, ORG_EDIT_CONTACT, ORG_REACTIVATE, TRIAL_EXTEND, AUDIT_VIEW, REQUEST_CREATE);
            case PLATFORM_VIEWER -> EnumSet.of(ORG_VIEW, PAYMENT_VIEW, AUDIT_VIEW);
            default -> EnumSet.noneOf(PlatformPermission.class);
        };
    }

    public static Set<PlatformPermission> of(String roleName) {
        try {
            return of(User.Role.valueOf(roleName));
        } catch (IllegalArgumentException | NullPointerException e) {
            return EnumSet.noneOf(PlatformPermission.class);
        }
    }
}
