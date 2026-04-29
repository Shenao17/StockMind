import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, fmtDate } from '../api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';

const emptyForm = { username: '', email: '', password: '', role: 'SELLER' };

export default function Users({ showToast }) {
  const { user: currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isAdmin()) { navigate('/dashboard', { replace: true }); return; }
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const data = await API.users.list() || [];
      setUsers(data);
    } catch (e) {
      showToast?.('Error cargando usuarios: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function openModal(user = null) {
    if (user) {
      setEditId(user.id);
      setForm({ username: user.username, email: user.email, password: '', role: user.role });
    } else {
      setEditId(null);
      setForm(emptyForm);
    }
    setModalOpen(true);
  }

  async function saveUser() {
    const data = { email: form.email, role: form.role };
    if (!editId) {
      data.username = form.username;
      data.password = form.password;
      if (!data.username || !data.password) { showToast?.('Usuario y contraseña son obligatorios', 'warning'); return; }
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
      loadUsers();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  async function toggleUser(id, currentActive) {
    if (!confirm(`¿Confirma ${currentActive ? 'desactivar' : 'activar'} este usuario?`)) return;
    try {
      await API.users.update(id, { active: !currentActive });
      showToast?.(`Usuario ${currentActive ? 'desactivado' : 'activado'}`);
      loadUsers();
    } catch (e) {
      showToast?.('Error: ' + e.message, 'error');
    }
  }

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  if (loading) return <div className="loading-state"><div className="spinner" /> Cargando...</div>;

  return (
    <>
      <div className="table-container">
        <div className="table-header"><h2>Usuarios del Sistema</h2></div>
        {users.length === 0 ? (
          <div className="loading-state">Sin usuarios registrados</div>
        ) : (
          <table>
            <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username}</strong>
                    {u.id === currentUser?.id && <span className="badge badge-accent" style={{ fontSize: '.65rem', marginLeft: 6 }}>Tú</span>}
                  </td>
                  <td className="mono">{u.email}</td>
                  <td><span className={`badge ${u.role === 'ADMIN' ? 'badge-accent' : 'badge-muted'}`}>{u.role}</span></td>
                  <td><span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="mono">{new Date(u.createdAt).toLocaleDateString('es-CO')}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openModal(u)}>Editar</button>
                    {u.id !== currentUser?.id && (
                      <button className="btn btn-danger btn-sm" onClick={() => toggleUser(u.id, u.active)}>
                        {u.active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar Usuario' : 'Nuevo Usuario'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveUser}>Guardar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Nombre de usuario *</label>
          <input type="text" value={form.username} onChange={f('username')} placeholder="sin espacios" disabled={!!editId} />
        </div>
        <div className="form-group">
          <label>Correo electrónico *</label>
          <input type="email" value={form.email} onChange={f('email')} placeholder="usuario@empresa.com" />
        </div>
        <div className="form-group">
          <label>Contraseña <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>{editId ? '(dejar vacío para no cambiar)' : '(requerida)'}</span></label>
          <input type="password" value={form.password} onChange={f('password')} placeholder="Mínimo 6 caracteres" />
        </div>
        <div className="form-group">
          <label>Rol</label>
          <select value={form.role} onChange={f('role')}>
            <option value="SELLER">Vendedor</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
      </Modal>
    </>
  );
}
