/**
 * StockMind Frontend — Módulo de autenticación UI
 * Inicializa la interfaz de usuario con datos de la sesión activa.
 * Incluido en todas las páginas que requieren autenticación.
 */

function initUserUI() {
    const user = Auth.getUser();
    if (!user) return;

    const avatarEl   = document.getElementById('user-avatar');
    const nameEl     = document.getElementById('user-name');
    const roleEl     = document.getElementById('user-role');
    const navUsersEl = document.getElementById('nav-users');

    if (avatarEl) avatarEl.textContent = user.username.charAt(0).toUpperCase();
    if (nameEl)   nameEl.textContent   = user.username;
    if (roleEl)   roleEl.textContent   = user.role === 'ADMIN' ? 'Administrador' : 'Vendedor';

    // Ocultar sección de usuarios si no es admin
    if (navUsersEl && user.role !== 'ADMIN') {
        navUsersEl.style.display = 'none';
    }
}

function logout() {
    Auth.clearSession();
    window.location.href = 'index.html';
}
