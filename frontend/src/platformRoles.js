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
  TEAM_MEMBER_CREATED: 'Miembro del equipo agregado',
  TEAM_MEMBER_UPDATED: 'Miembro del equipo modificado',
  TEAM_ACCESS_RESET: 'Acceso de un miembro reiniciado',
};
