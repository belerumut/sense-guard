/**
 * Sidebar Bileşeni — Ana navigasyon
 */
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  HiOutlineViewGrid,
  HiOutlineMap,
  HiOutlineBell,
  HiOutlineUsers,
  HiOutlineLogout,
  HiOutlineShieldCheck,
} from 'react-icons/hi';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', label: 'Genel Bakış', icon: HiOutlineViewGrid },
    { path: '/map', label: 'Canlı Harita', icon: HiOutlineMap },
    { path: '/alerts', label: 'Alarmlar', icon: HiOutlineBell },
    ...(user?.role === 'admin' || user?.role === 'monitor'
      ? [{ path: '/patients', label: 'Hastalar', icon: HiOutlineUsers }]
      : []),
    ...(user?.role === 'admin'
      ? [{ path: '/users', label: 'Kullanıcılar', icon: HiOutlineUsers }]
      : []),
  ];

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  const appName = import.meta.env.VITE_APP_NAME || 'SafeGuard';
  const appSubtext = import.meta.env.VITE_APP_SUBTEXT || 'Güvenlik Platformu';
  const appLogo = import.meta.env.VITE_APP_LOGO || '🛡️';

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          {appLogo.endsWith('.svg') || appLogo.startsWith('/') ? (
            <img src={appLogo} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          ) : (
            appLogo
          )}
        </div>
        <div className="sidebar-brand-text">
          <h2>{appName}</h2>
          <span>{appSubtext}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Ana Menü</span>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
            end={item.path === '/'}
          >
            <span className="sidebar-link-icon">
              <item.icon />
            </span>
            {item.label}
          </NavLink>
        ))}

        <span className="sidebar-section-label" style={{ marginTop: 'auto' }}>Hesap</span>
        <button
          className="sidebar-link"
          onClick={logout}
          style={{ width: '100%', textAlign: 'left', background: 'none' }}
        >
          <span className="sidebar-link-icon">
            <HiOutlineLogout />
          </span>
          Çıkış Yap
        </button>
      </nav>

      <div className="sidebar-user" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
        <div className="sidebar-avatar">{getInitials()}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">
            {user?.firstName} {user?.lastName}
          </div>
          <div className="sidebar-user-role">{user?.role}</div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
