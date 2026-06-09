/**
 * Kayıt Sayfası (Register Page)
 * 
 * Yeni kullanıcı kaydı için form sayfası.
 * POST /api/auth/register endpoint'ini kullanır.
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    age: '',
    role: 'patient',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Doğrulama
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.password ||
      !formData.emergencyContactName ||
      !formData.emergencyContactPhone ||
      !formData.emergencyContactRelationship
    ) {
      setError('Ad, soyad, e-posta, şifre ve hasta yakını (acil durum kişisi) alanları zorunludur.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: 'patient',
        ...(formData.phone && { phone: formData.phone }),
        ...(formData.age && { age: parseInt(formData.age, 10) }),
        emergencyContact: {
          name: formData.emergencyContactName,
          phone: formData.emergencyContactPhone,
          relationship: formData.emergencyContactRelationship,
        },
      };

      await register(payload);
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Kayıt başarısız. Lütfen bilgilerinizi kontrol edin.'
      );
    } finally {
      setLoading(false);
    }
  };

  const appName = import.meta.env.VITE_APP_NAME || 'SafeGuard';
  const appLogo = import.meta.env.VITE_APP_LOGO || '🛡️';

  return (
    <div className="login-page">
      <div className="login-card register-card">
        <div className="login-logo" style={{ background: 'none', width: 'auto', height: 'auto', marginBottom: '30px', borderRadius: 0 }}>
          {appLogo.endsWith('.svg') || appLogo.startsWith('/') ? (
            <img src={appLogo} alt="Logo" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
          ) : (
            appLogo
          )}
        </div>
        <h1>Hesap Oluştur</h1>
        <p className="subtitle">{appName} Platformuna Kayıt Ol</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Ad ve Soyad — Yan yana */}
          <div className="register-row">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-firstName">Ad *</label>
              <input
                id="reg-firstName"
                name="firstName"
                type="text"
                className="form-input"
                placeholder="Adınız"
                value={formData.firstName}
                onChange={handleChange}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-lastName">Soyad *</label>
              <input
                id="reg-lastName"
                name="lastName"
                type="text"
                className="form-input"
                placeholder="Soyadınız"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-email">E-posta *</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              className="form-input"
              placeholder="ornek@email.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          {/* Şifre ve Şifre Tekrar — Yan yana */}
          <div className="register-row">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-password">Şifre *</label>
              <input
                id="reg-password"
                name="password"
                type="password"
                className="form-input"
                placeholder="En az 6 karakter"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-confirmPassword">Şifre Tekrar *</label>
              <input
                id="reg-confirmPassword"
                name="confirmPassword"
                type="password"
                className="form-input"
                placeholder="Tekrar girin"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={6}
              />
            </div>
          </div>

          {/* Telefon ve Yaş — Yan yana */}
          <div className="register-row">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-phone">Telefon</label>
              <input
                id="reg-phone"
                name="phone"
                type="tel"
                className="form-input"
                placeholder="0 555 123 4567"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-age">Yaş</label>
              <input
                id="reg-age"
                name="age"
                type="number"
                className="form-input"
                placeholder="65"
                min={1}
                max={150}
                value={formData.age}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="section-title-register" style={{ margin: '15px 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '5px', fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>
            Acil Durum İletişim Kişisi (Hasta Yakını)
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="reg-emergencyContactName">Yakın Adı Soyadı *</label>
            <input
              id="reg-emergencyContactName"
              name="emergencyContactName"
              type="text"
              className="form-input"
              placeholder="Yakınınızın Adı Soyadı"
              value={formData.emergencyContactName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="register-row">
            <div className="form-group">
              <label className="form-label" htmlFor="reg-emergencyContactPhone">Yakın Telefonu *</label>
              <input
                id="reg-emergencyContactPhone"
                name="emergencyContactPhone"
                type="tel"
                className="form-input"
                placeholder="0 555 123 4567"
                value={formData.emergencyContactPhone}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="reg-emergencyContactRelationship">Yakınlık Derecesi *</label>
              <input
                id="reg-emergencyContactRelationship"
                name="emergencyContactRelationship"
                type="text"
                className="form-input"
                placeholder="Örn: Oğlu, Kızı, Eşi"
                value={formData.emergencyContactRelationship}
                onChange={handleChange}
                required
              />
            </div>
          </div>


          <button
            type="submit"
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
          </button>
        </form>

        <p className="register-footer">
          Zaten hesabınız var mı?{' '}
          <Link to="/login" className="register-link">Giriş Yap</Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
