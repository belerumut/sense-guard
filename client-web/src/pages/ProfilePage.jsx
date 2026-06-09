/**
 * Profil Sayfası (Profile Page)
 * 
 * Kullanıcının kendi bilgilerini görüntülemesini ve güncellemesini sağlar.
 * PUT /api/users/:id endpoint'ini kullanır.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';

const ProfilePage = () => {
  const { user, updateUserState } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    age: '',
    email: '',
    role: '',
    medicalNotes: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        age: user.age || '',
        email: user.email || '',
        role: user.role || '',
        medicalNotes: user.medicalNotes || '',
        emergencyContactName: user.emergencyContact?.name || '',
        emergencyContactPhone: user.emergencyContact?.phone || '',
        emergencyContactRelationship: user.emergencyContact?.relationship || '',
      });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        ...(user?.role === 'admin' && {
          email: formData.email,
          role: formData.role,
        }),
        ...(user?.role === 'patient' && {
          medicalNotes: formData.medicalNotes,
          emergencyContact: {
            name: formData.emergencyContactName,
            phone: formData.emergencyContactPhone,
            relationship: formData.emergencyContactRelationship,
          }
        })
      };

      const res = await userAPI.updateUser(user.id || user._id, payload);
      const updatedUser = res.data.data.user;

      // Global state güncelle
      updateUserState(updatedUser);
      setSuccess('Profiliniz başarıyla güncellendi.');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Profil güncellenirken bir hata oluştu.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        {error && <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textAlign: 'center' }}>{error}</div>}
        {success && <div className="badge safe" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textAlign: 'center' }}>{success}</div>}

        <div className="page-header">
          <h1>Profil Bilgileri</h1>
          <p>Kişisel bilgilerinizi görüntüleyin ve güncelleyin</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="profile-firstName">Ad</label>
              <input
                id="profile-firstName"
                name="firstName"
                type="text"
                className="form-input"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" htmlFor="profile-lastName">Soyad</label>
              <input
                id="profile-lastName"
                name="lastName"
                type="text"
                className="form-input"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="profile-email">
              E-posta Adresi {user?.role !== 'admin' && '(Değiştirilemez)'}
            </label>
            <input
              id="profile-email"
              name="email"
              type="email"
              className="form-input"
              value={formData.email}
              onChange={handleChange}
              disabled={user?.role !== 'admin'}
              style={user?.role !== 'admin' ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="profile-role">
              Kullanıcı Rolü {user?.role !== 'admin' && '(Değiştirilemez)'}
            </label>
            {user?.role === 'admin' ? (
              <select
                id="profile-role"
                name="role"
                className="form-input"
                value={formData.role}
                onChange={handleChange}
                required
              >
                <option value="admin">Yönetici (Admin)</option>
                <option value="monitor">Gözlemci (Monitor)</option>
                <option value="patient">Hasta (Patient)</option>
              </select>
            ) : (
              <input
                id="profile-role"
                type="text"
                className="form-input"
                value={user?.role || ''}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed', textTransform: 'capitalize' }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label className="form-label" htmlFor="profile-phone">Telefon</label>
              <input
                id="profile-phone"
                name="phone"
                type="tel"
                className="form-input"
                placeholder="05..."
                value={formData.phone}
                onChange={handleChange}
              />
            </div>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label className="form-label" htmlFor="profile-age">Yaş</label>
              <input
                id="profile-age"
                name="age"
                type="number"
                className="form-input"
                value={formData.age}
                onChange={handleChange}
                min={1}
                max={150}
              />
            </div>
          </div>

          {user?.role === 'patient' && (
            <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--bg-glass-border)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--accent-blue)', fontWeight: 600 }}>Hasta Tıbbi ve İletişim Bilgileri</h3>
              
              <div className="form-group">
                <label className="form-label" htmlFor="profile-medicalNotes">Tıbbi Notlar</label>
                <textarea
                  id="profile-medicalNotes"
                  name="medicalNotes"
                  className="form-input"
                  rows="3"
                  value={formData.medicalNotes}
                  onChange={handleChange}
                  placeholder="Kronik hastalıklar, kullandığı ilaçlar vb."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <h4 style={{ fontSize: '1rem', marginTop: '1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Acil Durum İletişim Kişisi</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="profile-ecName">Yakın Adı Soyadı</label>
                  <input
                    id="profile-ecName"
                    name="emergencyContactName"
                    type="text"
                    className="form-input"
                    value={formData.emergencyContactName}
                    onChange={handleChange}
                    placeholder="Hasta yakınının adı"
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label" htmlFor="profile-ecPhone">Yakın Telefonu</label>
                    <input
                      id="profile-ecPhone"
                      name="emergencyContactPhone"
                      type="tel"
                      className="form-input"
                      value={formData.emergencyContactPhone}
                      onChange={handleChange}
                      placeholder="05..."
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="form-label" htmlFor="profile-ecRel">Yakınlık Derecesi</label>
                    <input
                      id="profile-ecRel"
                      name="emergencyContactRelationship"
                      type="text"
                      className="form-input"
                      value={formData.emergencyContactRelationship}
                      onChange={handleChange}
                      placeholder="Oğlu, Kızı vb."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ marginTop: '0.5rem', width: '100%', padding: '0.75rem', fontWeight: '600', justifyContent: 'center' }}
          >
            {loading ? 'Güncelleniyor...' : 'Güncelle'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfilePage;
