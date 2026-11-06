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
