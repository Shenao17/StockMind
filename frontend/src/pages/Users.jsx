import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, fmtDate } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { useDebounce } from '../hooks/useDebounce';

const PAGE_SIZE = 10;

const emptyForm = {
  username: '',
  email: '',
  password: '',
  role: 'SELLER'
};

export default function Users({ showToast }) {
  const { user: currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState({ content: [], page: 0, totalElements: 0, totalPages: 0 });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedSearch = useDebounce(search, 300);
  const users = data.content;
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/dashboard', { replace: true });
    }
    // eslint-disable-next-line
  }, []);

  // El servidor filtra y pagina los usuarios
  useEffect(() => {
    if (!isAdmin()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await API.users.list({ page, size: PAGE_SIZE, search: debouncedSearch.trim() });
        if (cancelled) return;
        if (res.content.length === 0 && page > 0) { setPage(page - 1); return; }
        setData(res);
      } catch (e) {
        if (!cancelled) showToast?.('Error cargando usuarios: ' + e.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [page, debouncedSearch, reloadKey]);

  const reload = () => setReloadKey(k => k + 1);

  function openModal(user = null) {
    if (user) {
      setEditId(user.id);
      setForm({
        username: user.username,
        email: user.email,
        password: '',
        role: user.role
      });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }

    setModalOpen(true);
  }

  async function saveUser() {
    const data = {
      email: form.email,
      role: form.role
    };

    if (!editId) {
      data.username = form.username;
      data.password = form.password;

      if (!data.username || !data.email || !data.password) {
        showToast?.(
          'Correo, nombre de usuario y contraseña son obligatorios',
          'warning'
        );
        return;
      }
    } else if (form.password) {
      data.password = form.password;
    }

    try {
      if (editId) {
        await API.users.update(editId, data);
        showToast?.('Usuario actualizado');
      } else {
        await API.users.create(data);
        showToast?.('Usuario creado correctamente');
      }

      setModalOpen(false);
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  async function toggleUser(id, currentActive) {
    if (
      !confirm(
        `¿Confirma ${
          currentActive ? 'desactivar' : 'activar'
        } este usuario?`
      )
    ) {
      return;
    }

    try {
      await API.users.update(id, {
        active: !currentActive
      });

      showToast?.(
        `Usuario ${
          currentActive ? 'desactivado' : 'activado'
        }`
      );

      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  async function resetMfa(u) {
    if (!confirm(`¿Reiniciar la verificación en dos pasos de ${u.username}? Podrá entrar solo con su contraseña y deberá configurarla de nuevo.`)) {
      return;
    }
    try {
      await API.users.resetMfa(u.id);
      showToast?.('Verificación en dos pasos reiniciada');
      reload();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  const f = (k) => (e) =>
    setForm((prev) => ({
      ...prev,
      [k]: e.target.value
    }));

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Cargando...
      </div>
    );
  }

  return (
    <>
      <div className="table-container">

        {/* Encabezado */}
        <div className="table-header">
          <h2>Usuarios del Sistema</h2>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Buscar por usuario o correo..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              style={{ width: 240 }}
            />

            <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {data.totalElements} usuarios
            </span>

            <button
              className="btn btn-primary"
              onClick={() => openModal()}
            >
              + Nuevo usuario
            </button>
          </div>
        </div>

        {/* Tabla */}
        {users.length === 0 ? (
          <div className="loading-state">
            {debouncedSearch ? `Sin resultados para "${debouncedSearch}"` : 'Sin usuarios registrados'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>2FA</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username}</strong>

                    {u.id === currentUser?.id && (
                      <span
                        className="badge badge-accent"
                        style={{
                          fontSize: '.65rem',
                          marginLeft: 6
                        }}
                      >
                        Tú
                      </span>
                    )}
                  </td>

                  <td className="mono">
                    {u.email}
                  </td>

                  <td>
                    <span
                      className={`badge ${
                        u.role === 'ADMIN'
                          ? 'badge-accent'
                          : 'badge-muted'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`badge ${
                        u.active
                          ? 'badge-success'
                          : 'badge-danger'
                      }`}
                    >
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  <td>
                    <span className={`badge ${u.mfaEnabledAt ? 'badge-success' : 'badge-muted'}`}>
                      {u.mfaEnabledAt ? 'Activa' : 'No'}
                    </span>
                  </td>

                  <td className="mono">
                    {new Date(
                      u.createdAt
                    ).toLocaleDateString('es-CO')}
                  </td>

                  <td
                    style={{
                      display: 'flex',
                      gap: 6
                    }}
                  >
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => openModal(u)}
                    >
                      Editar
                    </button>

                    {u.id !== currentUser?.id && u.mfaEnabledAt && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => resetMfa(u)}
                      >
                        Reiniciar 2FA
                      </button>
                    )}

                    {u.id !== currentUser?.id && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() =>
                          toggleUser(
                            u.id,
                            u.active
                          )
                        }
                      >
                        {u.active
                          ? 'Desactivar'
                          : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editId
            ? 'Editar Usuario'
            : 'Nuevo Usuario'
        }
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </button>

            <button
              className="btn btn-primary"
              onClick={saveUser}
            >
              Guardar
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Correo electrónico * <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>(con él inicia sesión)</span></label>

          <input
            type="email"
            value={form.email}
            onChange={f('email')}
            placeholder="usuario@empresa.com"
          />
        </div>

        <div className="form-group">
          <label>Nombre de usuario *</label>

          <input
            type="text"
            value={form.username}
            onChange={f('username')}
            placeholder="sin espacios"
            disabled={!!editId}
          />
        </div>

        <div className="form-group">
          <label>
            Contraseña{' '}
            <span
              style={{
                color: 'var(--text-muted)',
                fontSize: '.75rem'
              }}
            >
              {editId
                ? '(dejar vacío para no cambiar)'
                : '(requerida)'}
            </span>
          </label>

          <input
            type="password"
            value={form.password}
            onChange={f('password')}
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <div className="form-group">
          <label>Rol</label>

          <select
            value={form.role}
            onChange={f('role')}
          >
            <option value="SELLER">
              Vendedor
            </option>

            <option value="ADMIN">
              Administrador
            </option>
          </select>
        </div>
      </Modal>
    </>
  );
}