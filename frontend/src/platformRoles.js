// Roles del equipo de plataforma (sin empresa). Los permisos reales los decide el backend;
// aquí solo se usan para mostrar u ocultar controles.
export const isPlatformRole = (role) => typeof role === 'string' && role.startsWith('PLATFORM_');

export const PLATFORM_ROLE_LABELS = {
  PLATFORM_OWNER: 'Dueño',
  PLATFORM_BILLING: 'Cobranza',
  PLATFORM_SUPPORT: 'Soporte',
  PLATFORM_VIEWER: 'Consulta',
};

export const TEAM_ASSIGNABLE_ROLES = ['PLATFORM_BILLING', 'PLATFORM_SUPPORT', 'PLATFORM_VIEWER'];

// Acciones de la auditoría, en lenguaje de persona (línea de tiempo de la ficha de empresa)
export const AUDIT_LABELS = {
  ORGANIZATION_CREATED: 'Empresa creada desde el panel',
  ORGANIZATION_SUSPENDED: 'Empresa suspendida',
  ORGANIZATION_REACTIVATED: 'Empresa reactivada',
  ORGANIZATION_CANCELLED: 'Empresa cancelada',
  TRIAL_EXTENDED: 'Prueba extendida',
  PLAN_CHANGED: 'Plan cambiado',
  PAYMENT_LINK_CREATED: 'Enlace de pago generado',
  MANUAL_PAYMENT_RECORDED: 'Pago manual registrado',
  ORGANIZATION_CONTACT_UPDATED: 'Datos de contacto corregidos',
  ORGANIZATION_TAX_ID_UPDATED: 'NIT corregido',
  ORG_MFA_POLICY_CHANGED: 'Política de 2FA de la empresa cambiada',
  MFA_ENABLED: 'Un usuario activó el 2FA',
  MFA_DISABLED: 'Un usuario desactivó el 2FA',
  MFA_RESET_BY_ADMIN: '2FA reiniciado por el administrador',
  COMPANY_USER_MFA_RESET: '2FA reiniciado por la plataforma',
  REQUEST_CREATED: 'Solicitud creada',
  REQUEST_APPROVED: 'Solicitud aprobada',
  REQUEST_REJECTED: 'Solicitud rechazada',
  REQUEST_CANCELLED: 'Solicitud cancelada',
  PLAN_UPDATED: 'Plan editado',
  TEAM_MEMBER_CREATED: 'Miembro del equipo agregado',
  TEAM_MEMBER_UPDATED: 'Miembro del equipo modificado',
  TEAM_ACCESS_RESET: 'Acceso de un miembro reiniciado',
};

// Acciones que Soporte y Cobranza no hacen solos: las piden y el dueño las aprueba
export const REQUEST_TYPES = {
  SUSPEND: 'Suspender',
  CANCEL: 'Cancelar',
  CHANGE_PLAN: 'Cambiar plan',
  MANUAL_PAYMENT: 'Registrar pago manual',
  EXTEND_TRIAL: 'Extender prueba (más de 7 días)',
  CHANGE_TAX_ID: 'Corregir NIT',
};

export const REQUEST_STATUS = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', EXPIRED: 'Vencida' };

/** Resumen en una línea de lo que pide una solicitud. */
export function describeParams(type, p = {}) {
  const cycle = p.billingCycle === 'YEARLY' ? 'anual' : 'mensual';
  switch (type) {
    case 'CHANGE_PLAN': return `Plan ${p.planCode} (${cycle})${p.complimentary ? ', cortesía' : ''}`;
    case 'MANUAL_PAYMENT': return `Pago de ${p.planCode} (${cycle})`;
    case 'EXTEND_TRIAL': return `${p.days} días más`;
    case 'CHANGE_TAX_ID': return `Nuevo NIT ${p.taxId}`;
    default: return '—';
  }
}
