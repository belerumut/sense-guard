/**
 * Kullanıcı Yönetim Sayfası (Users Page)
 * 
 * Admin rolündeki kullanıcının tüm kullanıcıları listelemesini,
 * rollerini değiştirmesini ve kullanıcıları aktif/pasif etmesini sağlar.
 */
import { useState, useEffect } from 'react';
import { userAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HiOutlineSearch, HiOutlineTrash, HiOutlineCheck, HiOutlinePlus, HiOutlineX, HiOutlinePencil } from 'react-icons/hi';

const initialFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'patient',
  phone: '',
  age: '',
  medicalNotes: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelation: '',
};

const UsersPage = () => {
  const { user: currentUser, updateUserState } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Kullanıcı Ekleme Modalı Durumları
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState(initialFormState);
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Kullanıcı Düzenleme Modalı Durumları
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState(initialFormState);
  const [editUserId, setEditUserId] = useState(null);
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        phone: formData.phone || undefined,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
      };

      if (formData.role === 'patient') {
        payload.medicalNotes = formData.medicalNotes || undefined;
        if (formData.emergencyContactName || formData.emergencyContactPhone || formData.emergencyContactRelation) {
          payload.emergencyContact = {
            name: formData.emergencyContactName,
            phone: formData.emergencyContactPhone,
            relationship: formData.emergencyContactRelation,
          };
        }
      }

      await authAPI.register(payload);

      setSuccess('Yeni kullanıcı başarıyla oluşturuldu.');
      setShowCreateModal(false);
      setFormData(initialFormState);
      fetchUsers(search);
    } catch (err) {
      console.error('Kullanıcı oluşturma hatası:', err);
      setCreateError(err.response?.data?.message || 'Kullanıcı oluşturulamadı.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEditModal = (user) => {
    setEditUserId(user._id);
    setEditFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      password: '', // Şifre değiştirilmek istenmezse boş bırakılır
      role: user.role || 'patient',
      phone: user.phone || '',
      age: user.age || '',
      medicalNotes: user.medicalNotes || '',
      emergencyContactName: user.emergencyContact?.name || '',
      emergencyContactPhone: user.emergencyContact?.phone || '',
      emergencyContactRelation: user.emergencyContact?.relationship || '',
    });
    setShowEditModal(true);
    setEditError('');
  };

  const handleEditFormChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditLoading(true);
    try {
      const payload = {
        firstName: editFormData.firstName,
        lastName: editFormData.lastName,
        email: editFormData.email,
        role: editFormData.role,
        phone: editFormData.phone || undefined,
        age: editFormData.age ? parseInt(editFormData.age, 10) : undefined,
      };

      if (editFormData.role === 'patient') {
        payload.medicalNotes = editFormData.medicalNotes || undefined;
        if (editFormData.emergencyContactName || editFormData.emergencyContactPhone || editFormData.emergencyContactRelation) {
          payload.emergencyContact = {
            name: editFormData.emergencyContactName,
            phone: editFormData.emergencyContactPhone,
            relationship: editFormData.emergencyContactRelation,
          };
        }
      }

      await userAPI.updateUser(editUserId, payload);
      setSuccess('Kullanıcı başarıyla güncellendi.');
      setShowEditModal(false);
      fetchUsers(search);
    } catch (err) {
      console.error('Kullanıcı güncelleme hatası:', err);
      setEditError(err.response?.data?.message || 'Kullanıcı güncellenemedi.');
    } finally {
      setEditLoading(false);
    }
  };



  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async (searchVal = '') => {
    setLoading(true);
    try {
      const res = await userAPI.getUsers({ search: searchVal });
      setUsers(res.data.data.users || []);
    } catch (err) {
      console.error('Kullanıcı listesi getirme hatası:', err);
      setError('Kullanıcı listesi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    fetchUsers(val);
  };

  const handleRoleChange = async (userId, newRole) => {
    setError('');
    setSuccess('');
    try {
      const res = await userAPI.updateUserRole(userId, newRole);

      // State güncelle
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, role: newRole } : u))
      );

      setSuccess('Kullanıcı rolü başarıyla güncellendi.');

      // Eğer kendi rolünü güncellediyse local context'i de güncelle
      if (userId === currentUser?._id || userId === currentUser?.id) {
        updateUserState(res.data.data.user);
        alert('Kendi rolünüzü güncellediniz. Değişikliklerin tam uygulanması için sayfayı yenileyebilir veya yeniden giriş yapabilirsiniz.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Rol güncellenirken hata oluştu.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Bu kullanıcıyı devre dışı bırakmak istediğinize emin misiniz?')) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await userAPI.deleteUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, isActive: false } : u))
      );
      setSuccess('Kullanıcı başarıyla devre dışı bırakıldı.');
    } catch (err) {
      setError(err.response?.data?.message || 'Kullanıcı silinirken hata oluştu.');
    }
  };

  const handleActivateUser = async (userId) => {
    setError('');
    setSuccess('');
    try {
      await userAPI.updateUser(userId, { isActive: true });
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, isActive: true } : u))
      );
      setSuccess('Kullanıcı başarıyla aktifleştirildi.');
    } catch (err) {
      setError(err.response?.data?.message || 'Kullanıcı aktifleştirilirken hata oluştu.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Kullanıcı Yönetimi</h1>
          <p>Sistemdeki tüm kullanıcıları listeleyin ve rollerini yönetin</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowCreateModal(true); setCreateError(''); }}
          style={{ gap: '0.5rem', display: 'inline-flex', alignItems: 'center' }}
        >
          <HiOutlinePlus style={{ fontSize: '1.2rem' }} /> Kullanıcı Ekle
        </button>
      </div>

      {error && <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', display: 'block', textAlign: 'center' }}>{error}</div>}
      {success && <div className="badge safe" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', display: 'block', textAlign: 'center' }}>{success}</div>}

      {/* Arama Barı */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <HiOutlineSearch style={{ fontSize: '1.25rem', color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="İsim veya e-posta ile ara..."
          className="form-input"
          value={search}
          onChange={handleSearchChange}
          style={{ border: 'none', background: 'transparent', padding: '0.25rem', width: '100%' }}
        />
      </div>

      {/* Kullanıcı Tablosu */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading-container"><div className="spinner"></div></div>
        ) : users.length === 0 ? (
          <div className="empty-state"><p>Kullanıcı bulunamadı</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Ad Soyad</th>
                  <th>E-posta</th>
                  <th>Rol</th>
                  <th>Durum</th>
                  <th>Telefon</th>
                  <th>Kayıt Tarihi</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} style={{ opacity: u.isActive ? 1 : 0.6 }}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</span>
                      {u._id === currentUser?._id && <span className="badge info" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>Siz</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u._id, e.target.value)}
                        className="form-input"
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.85rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--bg-glass-border)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="patient">Hasta (Patient)</option>
                        <option value="monitor">Gözlemci (Monitor)</option>
                        <option value="admin">Yönetici (Admin)</option>
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${u.isActive ? 'safe' : 'danger'}`}>
                        {u.isActive ? 'Aktif' : 'Devre Dışı'}
                      </span>
                    </td>
                    <td>{u.phone || '—'}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString('tr-TR')}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--accent-blue)', borderColor: 'rgba(56, 189, 248, 0.4)', width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.5rem' }}
                        onClick={() => handleOpenEditModal(u)}
                      >
                        <HiOutlinePencil /> Düzenle
                      </button>
                      {u._id !== currentUser?._id && (
                        u.isActive ? (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--status-danger)', borderColor: 'var(--status-danger-border)', width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            onClick={() => handleDeleteUser(u._id)}
                          >
                            <HiOutlineTrash /> Devre Dışı Bırak
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--status-safe)', borderColor: 'var(--status-safe-border)', width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            onClick={() => handleActivateUser(u._id)}
                          >
                            <HiOutlineCheck /> Aktifleştir
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Kullanıcı Ekleme Modalı */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2>Yeni Kullanıcı Ekle</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              >
                <HiOutlineX />
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                {createError && (
                  <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textAlign: 'center' }}>
                    {createError}
                  </div>
                )}

                <div className="grid-2" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Ad *</label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      className="form-input"
                      value={formData.firstName}
                      onChange={handleFormChange}
                      placeholder="Adı"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Soyad *</label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      className="form-input"
                      value={formData.lastName}
                      onChange={handleFormChange}
                      placeholder="Soyadı"
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">E-posta *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="form-input"
                      value={formData.email}
                      onChange={handleFormChange}
                      placeholder="eposta@adres.com"
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Şifre *</label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="form-input"
                      value={formData.password}
                      onChange={handleFormChange}
                      placeholder="••••••"
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Rol *</label>
                    <select
                      name="role"
                      className="form-input"
                      value={formData.role}
                      onChange={handleFormChange}
                    >
                      <option value="patient">Hasta (Patient)</option>
                      <option value="monitor">Gözlemci (Monitor)</option>
                      <option value="admin">Yönetici (Admin)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Telefon (İsteğe Bağlı)</label>
                    <input
                      type="text"
                      name="phone"
                      className="form-input"
                      value={formData.phone}
                      onChange={handleFormChange}
                      placeholder="05XXXXXXXXX"
                    />
                  </div>
                </div>

                {/* Hasta rolüne özel ek alanlar */}
                {formData.role === 'patient' && (
                  <div style={{ borderTop: '1px solid var(--bg-glass-border)', paddingTop: '1rem', marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--accent-blue)', fontWeight: 600 }}>Hasta Sağlık ve İletişim Bilgileri</h3>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Yaş</label>
                      <input
                        type="number"
                        name="age"
                        className="form-input"
                        value={formData.age}
                        onChange={handleFormChange}
                        placeholder="Yaş"
                        min="0"
                        max="150"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Tıbbi Notlar</label>
                      <textarea
                        name="medicalNotes"
                        className="form-input"
                        rows="3"
                        value={formData.medicalNotes}
                        onChange={handleFormChange}
                        placeholder="Kronik hastalıklar, ilaçlar vb."
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Acil Durum İletişim Kişisi</h4>
                    <div className="grid-3">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Ad Soyad</label>
                        <input
                          type="text"
                          name="emergencyContactName"
                          className="form-input"
                          value={formData.emergencyContactName}
                          onChange={handleFormChange}
                          placeholder="Yakınının Adı"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Telefon</label>
                        <input
                          type="text"
                          name="emergencyContactPhone"
                          className="form-input"
                          value={formData.emergencyContactPhone}
                          onChange={handleFormChange}
                          placeholder="05XXXXXXXXX"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Yakınlık Derecesi</label>
                        <input
                          type="text"
                          name="emergencyContactRelation"
                          className="form-input"
                          value={formData.emergencyContactRelation}
                          onChange={handleFormChange}
                          placeholder="Eşi, Oğlu vb."
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  İptal
                </button>
                <button type="submit" className="btn btn-primary" disabled={createLoading}>
                  {createLoading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Kullanıcı Düzenleme Modalı */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2>Kullanıcıyı Düzenle</h2>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              >
                <HiOutlineX />
              </button>
            </div>
            <form onSubmit={handleEditUser}>
              <div className="modal-body">
                {editError && (
                  <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textAlign: 'center' }}>
                    {editError}
                  </div>
                )}

                <div className="grid-2" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Ad *</label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      className="form-input"
                      value={editFormData.firstName}
                      onChange={handleEditFormChange}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Soyad *</label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      className="form-input"
                      value={editFormData.lastName}
                      onChange={handleEditFormChange}
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">E-posta *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="form-input"
                      value={editFormData.email}
                      onChange={handleEditFormChange}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Rol *</label>
                    <select
                      name="role"
                      className="form-input"
                      value={editFormData.role}
                      onChange={handleEditFormChange}
                    >
                      <option value="patient">Hasta (Patient)</option>
                      <option value="monitor">Gözlemci (Monitor)</option>
                      <option value="admin">Yönetici (Admin)</option>
                    </select>
                  </div>
                </div>

                <div className="grid-2" style={{ marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Telefon (İsteğe Bağlı)</label>
                    <input
                      type="text"
                      name="phone"
                      className="form-input"
                      value={editFormData.phone}
                      onChange={handleEditFormChange}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Yaş</label>
                    <input
                      type="number"
                      name="age"
                      className="form-input"
                      value={editFormData.age}
                      onChange={handleEditFormChange}
                    />
                  </div>
                </div>

                {editFormData.role === 'patient' && (
                  <div style={{ borderTop: '1px solid var(--bg-glass-border)', paddingTop: '1rem', marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', color: 'var(--accent-blue)', fontWeight: 600 }}>Hasta Sağlık ve İletişim Bilgileri</h3>

                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label className="form-label">Tıbbi Notlar</label>
                      <textarea
                        name="medicalNotes"
                        className="form-input"
                        rows="3"
                        value={editFormData.medicalNotes}
                        onChange={handleEditFormChange}
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <h4 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Acil Durum İletişim Kişisi</h4>
                    <div className="grid-3">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Ad Soyad</label>
                        <input
                          type="text"
                          name="emergencyContactName"
                          className="form-input"
                          value={editFormData.emergencyContactName}
                          onChange={handleEditFormChange}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Telefon</label>
                        <input
                          type="text"
                          name="emergencyContactPhone"
                          className="form-input"
                          value={editFormData.emergencyContactPhone}
                          onChange={handleEditFormChange}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>Yakınlık Derecesi</label>
                        <input
                          type="text"
                          name="emergencyContactRelation"
                          className="form-input"
                          value={editFormData.emergencyContactRelation}
                          onChange={handleEditFormChange}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>
                  İptal
                </button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Kaydediliyor...' : 'Güncelle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
