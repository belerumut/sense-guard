/**
 * Alarm Yönetim Sayfası
 * Teknik Doküman → Bölüm 7.4
 */
import { useState, useEffect } from 'react';
import { alertAPI } from '../services/api';
import { onNewAlert, removeAlertListeners } from '../services/socketClient';
import { useAuth } from '../context/AuthContext';
import {
  HiOutlineCheck,
  HiOutlineEye,
  HiOutlineRefresh,
  HiOutlineTrash,
} from 'react-icons/hi';

const AlertsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, active, acknowledged, resolved
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [actionLoading, setActionLoading] = useState(null);

  const [selectedAlerts, setSelectedAlerts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchAlerts();
  }, [filter, page]);

  useEffect(() => {
    onNewAlert((alert) => {
      // Sadece 1. sayfadaysak ve filtre 'all' veya 'active' ise listeye ekle
      if (page === 1 && (filter === 'all' || filter === 'active')) {
        setAlerts((prev) => [alert, ...prev].slice(0, 20));
      }
    });

    return () => removeAlertListeners();
  }, [filter, page]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await alertAPI.getActive(20, filter, page);
      setAlerts(res.data.data.alerts || []);
      const pagination = res.data.data.pagination;
      if (pagination) {
        setTotalPages(pagination.pages || 1);
        setTotalItems(pagination.total || 0);
      }
      setSelectedAlerts([]); // Seçimleri sıfırla
    } catch (err) {
      console.error('Alarm getirme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handleAcknowledge = async (id) => {
    setActionLoading(id);
    try {
      await alertAPI.acknowledge(id);
      setAlerts((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: 'acknowledged' } : a))
      );
    } catch (err) {
      console.error('Onaylama hatası:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (id) => {
    const note = prompt('Çözüm notu (opsiyonel):');
    setActionLoading(id);
    try {
      await alertAPI.resolve(id, note || '');
      setAlerts((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: 'resolved' } : a))
      );
    } catch (err) {
      console.error('Çözümleme hatası:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAlert = async (id) => {
    if (!window.confirm('Bu alarm kaydını kalıcı olarak silmek istediğinize emin misiniz?')) {
      return;
    }
    setActionLoading(id);
    setError('');
    setSuccess('');
    try {
      await alertAPI.deleteAlert(id);
      setSuccess('Alarm kaydı başarıyla silindi.');
      fetchAlerts();
    } catch (err) {
      console.error('Alarm silme hatası:', err);
      setError(err.response?.data?.message || 'Alarm silinirken bir hata oluştu.');
      setActionLoading(null);
    }
  };

  const handleBulkDeleteAlerts = async () => {
    if (!window.confirm(`Seçilen ${selectedAlerts.length} alarm kaydını kalıcı olarak silmek istediğinize emin misiniz?`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await alertAPI.bulkDeleteAlerts(selectedAlerts);
      setSuccess('Seçilen alarm kayıtları başarıyla silindi.');
      fetchAlerts();
    } catch (err) {
      console.error('Çoklu alarm silme hatası:', err);
      setError(err.response?.data?.message || 'Seçilen alarm kayıtları silinirken bir hata oluştu.');
    }
  };

  const handleSelectAlert = (id) => {
    setSelectedAlerts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedAlerts.length === alerts.length) {
      setSelectedAlerts([]);
    } else {
      setSelectedAlerts(alerts.map((a) => a._id));
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

  const getStatusBadge = (status) => {
    const map = {
      active: { class: 'danger', label: '● Aktif' },
      acknowledged: { class: 'warning', label: '◉ İnceleniyor' },
      resolved: { class: 'safe', label: '✓ Çözüldü' },
    };
    const s = map[status] || map.active;
    return <span className={`badge ${s.class}`}>{s.label}</span>;
  };

  const getAlertTypeLabel = (type) => {
    const map = {
      FALL_DETECTED: '🚨 Düşme Tespiti',
      fall: '🚨 Düşme Tespiti',
      INACTIVITY_LONG: '⏱️ Uzun Hareketsizlik',
      inactivity: '⏱️ Hareketsizlik',
      NIGHT_ACTIVITY: '🌙 Gece Aktivitesi',
      GPS_STAGNANT: '📍 Konum Sabit',
    };
    return map[type] || type;
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Alarm Yönetimi</h1>
          <p>Tetiklenen alarmları inceleyin ve yönetin</p>
        </div>
        <button className="btn btn-outline" onClick={fetchAlerts}>
          <HiOutlineRefresh /> Yenile
        </button>
      </div>

      {error && <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', display: 'block', textAlign: 'center' }}>{error}</div>}
      {success && <div className="badge safe" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', display: 'block', textAlign: 'center' }}>{success}</div>}

      {/* Filtreler */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[
          { key: 'all', label: 'Tümü' },
          { key: 'active', label: '● Aktif' },
          { key: 'acknowledged', label: '◉ İnceleniyor' },
          { key: 'resolved', label: '✓ Çözüldü' },
        ].map((f) => (
          <button
            key={f.key}
            className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleFilterChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Toplu İşlemler Barı */}
      {isAdmin && selectedAlerts.length > 0 && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.4)', borderWidth: '1px', borderStyle: 'solid' }}>
          <span style={{ fontWeight: 500, color: 'var(--status-danger)' }}>
            ⚠️ {selectedAlerts.length} alarm seçildi. Silme işlemi kalıcıdır!
          </span>
          <button
            className="btn btn-sm"
            onClick={handleBulkDeleteAlerts}
            style={{ backgroundColor: 'var(--status-danger)', color: 'white', borderColor: 'var(--status-danger-border)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', width: 'auto' }}
          >
            <HiOutlineTrash /> Seçilenleri Sil
          </button>
        </div>
      )}

      {/* Alarm Tablosu */}
      <div className="card" style={{ padding: 0 }}>
        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔔</div>
            <p>Gösterilecek alarm bulunamadı</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {isAdmin && (
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        className="custom-checkbox"
                        checked={alerts.length > 0 && selectedAlerts.length === alerts.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                  )}
                  <th>Tür</th>
                  <th>Hasta</th>
                  <th>Seviye</th>
                  <th>Durum</th>
                  <th>Mesaj</th>
                  <th>Tarih</th>
                  {user?.role !== 'patient' && <th>İşlem</th>}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr
                    key={alert._id}
                    style={{
                      background: alert.status === 'active' && alert.severity === 'critical'
                        ? 'var(--status-critical-bg)'
                        : undefined,
                    }}
                  >
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={selectedAlerts.includes(alert._id)}
                          onChange={() => handleSelectAlert(alert._id)}
                        />
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {getAlertTypeLabel(alert.alertType)}
                    </td>
                    <td>
                      {alert.patientId?.firstName
                        ? `${alert.patientId.firstName} ${alert.patientId.lastName}`
                        : '—'}
                    </td>
                    <td>{getSeverityBadge(alert.severity)}</td>
                    <td>{getStatusBadge(alert.status)}</td>
                    <td style={{
                      maxWidth: 300, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontSize: '0.8rem', color: 'var(--text-secondary)',
                    }}>
                      {alert.message}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {formatDate(alert.createdAt)}
                    </td>
                    {user?.role !== 'patient' && (
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {alert.status === 'active' && (
                            <button
                              className="btn-icon"
                              title="Onayla"
                              onClick={() => handleAcknowledge(alert._id)}
                              disabled={actionLoading === alert._id}
                            >
                              <HiOutlineEye />
                            </button>
                          )}
                          {alert.status !== 'resolved' && (
                            <button
                              className="btn-icon"
                              title="Çöz"
                              onClick={() => handleResolve(alert._id)}
                              disabled={actionLoading === alert._id}
                              style={{ color: 'var(--status-safe)' }}
                            >
                              <HiOutlineCheck />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className="btn-icon"
                              title="Kalıcı Olarak Sil"
                              onClick={() => handleDeleteAlert(alert._id)}
                              disabled={actionLoading === alert._id}
                              style={{ color: 'var(--status-danger)' }}
                            >
                              <HiOutlineTrash />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sayfalama Kontrolleri (Pagination) */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            className="btn btn-sm btn-outline"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
          >
            Önceki
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Sayfa {page} / {totalPages} (Toplam {totalItems} kayıt)
          </span>
          <button
            className="btn btn-sm btn-outline"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
          >
            Sonraki
          </button>
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
