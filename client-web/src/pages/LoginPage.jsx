/**
 * Login Sayfası
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(
        err.response?.data?.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.'
      );
    } finally {
      setLoading(false);
    }
  };

  const appName = import.meta.env.VITE_APP_NAME || 'SafeGuard';
  const appSubtext = import.meta.env.VITE_APP_SUBTEXT || 'Güvenlik Platformu';
  const appLogo = import.meta.env.VITE_APP_LOGO || '🛡️';

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" style={{ background: 'none', width: 'auto', height: 'auto', marginBottom: '30px', borderRadius: 0 }}>
          {appLogo.endsWith('.svg') || appLogo.startsWith('/') ? (
            <img src={appLogo} alt="Logo" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
          ) : (
            appLogo
          )}
        </div>
        <h1>{appName}</h1>
        <p className="subtitle">{appSubtext}</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">E-posta</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="ornek@test.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Şifre</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="register-footer">
          Hesabınız yok mu?{' '}
          <Link to="/register" className="register-link">Kayıt Ol</Link>
        </p>

        {/*
        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Demo: admin@test.com / 123456
        </p>
          */}
      </div>
    </div>
  );
};

export default LoginPage;
