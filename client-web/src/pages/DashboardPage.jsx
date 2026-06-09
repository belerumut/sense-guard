/**
 * Dashboard Sayfası — Genel Bakış (Overview)
 * Teknik Doküman → Bölüm 7.1
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertAPI, userAPI, healthAPI, systemAPI } from '../services/api';
import { onNewAlert, removeAlertListeners } from '../services/socketClient';
import { useAuth } from '../context/AuthContext';
import {
  HiOutlineUsers,
  HiOutlineBell,
  HiOutlineShieldCheck,
  HiOutlineExclamation,
  HiOutlineClock,
  HiOutlineStatusOnline,
} from 'react-icons/hi';

const DashboardPage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [patients, setPatients] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [settings, setSettings] = useState({
    INACTIVITY_CHECK_HOURS: 2,
    GPS_CHECK_HOURS: 3,
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');

  // Fetch settings on mount if admin
  useEffect(() => {
    if (user?.role === 'admin') {
      fetchSettings();
    }
  }, [user]);

  const fetchSettings = async () => {
    try {
      const res = await systemAPI.getSettings();
      if (res.data?.data?.settings) {
        setSettings(res.data.data.settings);
      }
    } catch (err) {
      console.error('Sistem ayarlarını getirme hatası:', err);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    setSettingsSuccess('');
    setSettingsError('');
    try {
      await systemAPI.updateSettings({
        INACTIVITY_CHECK_HOURS: parseFloat(settings.INACTIVITY_CHECK_HOURS),
        GPS_CHECK_HOURS: parseFloat(settings.GPS_CHECK_HOURS),
      });
      setSettingsSuccess('Sistem ayarları başarıyla güncellendi.');
      setTimeout(() => setSettingsSuccess(''), 4000);
    } catch (err) {
      setSettingsError(err.response?.data?.message || 'Ayarlar kaydedilirken hata oluştu.');
      setTimeout(() => setSettingsError(''), 4000);
    } finally {
      setSaveLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Gerçek zamanlı alarm dinle
    onNewAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 10));
      fetchData(); // Stats'ı güncelle
    });

    return () => removeAlertListeners();
  }, []);

  const fetchData = async () => {
    try {
      const [alertRes, statsRes, patientRes, healthRes] = await Promise.allSettled([
        alertAPI.getActive(10),
        alertAPI.getStats(7),
        userAPI.getPatients(),
        healthAPI.check(),
      ]);

      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.data.data.alerts || []);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data);
      if (patientRes.status === 'fulfilled') setPatients(patientRes.value.data.data.patients || []);
      if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data.data);
    } catch (err) {
      console.error('Dashboard veri hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadge = (severity) => {
    const map = {
      critical: { class: 'critical', label: 'Kritik' },
      high: { class: 'danger', label: 'Yüksek' },
      medium: { class: 'warning', label: 'Orta' },
      low: { class: 'info', label: 'Düşük' },
    };
    const s = map[severity] || map.medium;
    return <span className={`badge ${s.class}`}>{s.label}</span>;
  };

  const getAlertTypeLabel = (type) => {
    const map = {
      FALL_DETECTED: '🚨 Düşme',
      fall: '🚨 Düşme',
      INACTIVITY_LONG: '⏱️ Hareketsizlik',
      inactivity: '⏱️ Hareketsizlik',
      NIGHT_ACTIVITY: '🌙 Gece Aktivitesi',
      GPS_STAGNANT: '📍 Konum Sabit',
    };
    return map[type] || type;
  };

  const formatTime = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'Az önce';
    if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
    return d.toLocaleDateString('tr-TR');
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Genel Bakış</h1>
        <p>Sistem durumu ve aktif alarmlar</p>
      </div>

      {/* ─── İstatistik Kartları ─── */}
      <div className="stats-grid">
        <div className="stat-card info">
          <div className="stat-icon info"><HiOutlineUsers /></div>
          <div className="stat-content">
            <h3>{patients.length}</h3>
            <p>Aktif Hasta</p>
          </div>
        </div>

        <div className="stat-card danger">
          <div className="stat-icon danger"><HiOutlineBell /></div>
          <div className="stat-content">
            <h3>{stats?.overview?.active || 0}</h3>
            <p>Aktif Alarm</p>
          </div>
        </div>

        <div className="stat-card warning">
          <div className="stat-icon warning"><HiOutlineClock /></div>
          <div className="stat-content">
            <h3>{stats?.overview?.acknowledged || 0}</h3>
            <p>İnceleniyor</p>
          </div>
        </div>

        <div className="stat-card safe">
          <div className="stat-icon safe"><HiOutlineShieldCheck /></div>
          <div className="stat-content">
            <h3>{stats?.overview?.recentlyResolved || 0}</h3>
            <p>Çözümlenen (7 gün)</p>
          </div>
        </div>
      </div>

      {/* ─── Ana İçerik Grid ─── */}
      <div className="grid-2">
        {/* Son Alarmlar */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🚨 Son Alarmlar</h3>
            <button className="btn btn-outline btn-sm" onClick={() => navigate('/alerts')}>
              Tümünü Gör
            </button>
          </div>
          
          {alerts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <p>Aktif alarm bulunmuyor</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Tür</th>
                    <th>Hasta</th>
                    <th>Seviye</th>
                    <th>Zaman</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice(0, 5).map((alert, i) => (
                    <tr key={alert._id || i} style={{ cursor: 'pointer' }}>
                      <td>{getAlertTypeLabel(alert.alertType)}</td>
                      <td>
                        {alert.patientId?.firstName
                          ? `${alert.patientId.firstName} ${alert.patientId.lastName}`
                          : alert.patient?.name || '—'}
                      </td>
                      <td>{getSeverityBadge(alert.severity)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {formatTime(alert.createdAt || alert.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sistem Durumu */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">⚙️ Sistem Durumu</h3>
            <span className={`badge ${health?.database === 'Bağlı' ? 'safe' : 'danger'}`}>
              <HiOutlineStatusOnline /> {health?.database === 'Bağlı' ? 'Çevrimiçi' : 'Çevrimdışı'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--bg-glass-border)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Veritabanı</span>
              <span className={`badge ${health?.database === 'Bağlı' ? 'safe' : 'danger'}`}>
                {health?.database || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--bg-glass-border)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Ortam</span>
              <span style={{ fontSize: '0.875rem' }}>{health?.environment || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--bg-glass-border)' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Çalışma Süresi</span>
              <span style={{ fontSize: '0.875rem' }}>{health?.uptime || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Toplam Alarm (7 gün)</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{stats?.totalAlerts || 0}</span>
            </div>
          </div>

          {/* Hasta Listesi Kısa */}
          {(user?.role === 'admin' || user?.role === 'monitor') && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
                Kayıtlı Hastalar
              </h4>
              {patients.slice(0, 4).map((p) => (
                <div
                  key={p._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/patients/${p._id}`)}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--gradient-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 600, flexShrink: 0,
                  }}>
                    {p.firstName?.[0]}{p.lastName?.[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{p.firstName} {p.lastName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.email}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {p.age ? `${p.age} yaş` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sistem Ayarları (Sadece Admin) */}
      {user?.role === 'admin' && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <h3 className="card-title">⚙️ Sistem Alarm Parametreleri</h3>
          </div>
          {settingsError && <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textAlign: 'center' }}>{settingsError}</div>}
          {settingsSuccess && <div className="badge safe" style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', display: 'block', textAlign: 'center' }}>{settingsSuccess}</div>}
          <form onSubmit={handleSaveSettings}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Hareketsizlik Süresi (Saat)</label>
                <input
                  type="number"
                  step="0.0001"
                  name="INACTIVITY_CHECK_HOURS"
                  className="form-input"
                  value={settings.INACTIVITY_CHECK_HOURS}
                  onChange={handleSettingsChange}
                  min="0.0001"
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  Hastanın hareketsiz kalabileceği maksimum süre (Örn: 2 saat). Geliştirme için 0.0125 (45 sn) gibi küçük ondalıklı değerler girilebilir.
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">GPS Sabitlik Süresi (Saat)</label>
                <input
                  type="number"
                  step="0.0001"
                  name="GPS_CHECK_HOURS"
                  className="form-input"
                  value={settings.GPS_CHECK_HOURS}
                  onChange={handleSettingsChange}
                  min="0.0001"
                  required
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  Hastanın konumunun değişmeden kalabileceği maksimum süre (Örn: 3 saat).
                </small>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saveLoading}>
                {saveLoading ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
