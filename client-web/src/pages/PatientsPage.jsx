/**
 * Hastalar Listesi ve Detay Sayfası
 * Teknik Doküman → Bölüm 7.3
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { userAPI, sensorAPI, alertAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { HiOutlineArrowLeft, HiOutlineUser, HiOutlineTrash } from 'react-icons/hi';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
);

// ─── Hasta Detay Sayfası ───
const PatientDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [sensorData, setSensorData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('1h'); // 1h, 6h, 24h, 7d

  useEffect(() => {
    if (id) fetchPatientData();
  }, [id, timeRange]);

  const fetchPatientData = async () => {
    setLoading(true);
    try {
      const [userRes, alertRes] = await Promise.allSettled([
        userAPI.getUserById(id),
        alertAPI.getPatientAlerts(id),
      ]);

      if (userRes.status === 'fulfilled') {
        setPatient(userRes.value.data.data.user);
      }
      if (alertRes.status === 'fulfilled') {
        setAlerts(alertRes.value.data.data.alerts || []);
      }

      // Sensör verileri — zaman aralığına göre
      const now = new Date();
      const rangeMap = {
        '1h': 1, '6h': 6, '24h': 24, '7d': 168,
      };
      const hours = rangeMap[timeRange] || 1;
      const start = new Date(now.getTime() - hours * 60 * 60 * 1000);

      try {
        const sensorRes = await sensorAPI.getByRange(id, start.toISOString(), now.toISOString());
        setSensorData(sensorRes.data.data.readings || []);
      } catch {
        setSensorData([]);
      }
    } catch (err) {
      console.error('Hasta veri hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  // Chart.js veri hazırlama
  const getChartData = () => {
    const labels = sensorData.map((d) =>
      new Date(d.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    );

    // Her 5. veriyi al (çok fazla nokta görünüm bozabilir)
    const step = Math.max(1, Math.floor(sensorData.length / 200));
    const filtered = sensorData.filter((_, i) => i % step === 0);
    const filteredLabels = labels.filter((_, i) => i % step === 0);

    return {
      labels: filteredLabels,
      datasets: [
        {
          label: 'İvme Büyüklüğü (g)',
          data: filtered.map((d) => d.accelerometer?.magnitude || 0),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Jiroskop (rad/s)',
          data: filtered.map((d) => {
            const g = d.gyroscope || {};
            return Math.sqrt((g.x || 0) ** 2 + (g.y || 0) ** 2 + (g.z || 0) ** 2);
          }),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: '#9ca3af', font: { family: 'Inter' } },
      },
      tooltip: {
        backgroundColor: '#1f2937',
        titleColor: '#f9fafb',
        bodyColor: '#d1d5db',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: '#6b7280', maxTicksLimit: 12, font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        ticks: { color: '#6b7280', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
    },
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="empty-state">
        <p>Hasta bulunamadı</p>
        <button className="btn btn-outline" onClick={() => navigate('/patients')}>
          Geri Dön
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button className="btn-icon" onClick={() => navigate('/patients')}>
          <HiOutlineArrowLeft />
        </button>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {patient.firstName} {patient.lastName}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {patient.email} {patient.age ? `• ${patient.age} yaş` : ''}
          </p>
        </div>
      </div>

      {/* Bilgi Kartları */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card info">
          <div className="stat-icon info">📊</div>
          <div className="stat-content">
            <h3>{sensorData.length}</h3>
            <p>Sensör Verisi</p>
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon danger">🚨</div>
          <div className="stat-content">
            <h3>{alerts.filter((a) => a.status === 'active').length}</h3>
            <p>Aktif Alarm</p>
          </div>
        </div>
        <div className="stat-card safe">
          <div className="stat-icon safe">📋</div>
          <div className="stat-content">
            <h3>{alerts.length}</h3>
            <p>Toplam Alarm</p>
          </div>
        </div>
      </div>

      {/* Tıbbi Notlar */}
      {patient.medicalNotes && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.5rem' }}>🏥 Tıbbi Notlar</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{patient.medicalNotes}</p>
          {patient.emergencyContact && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Acil Durum İletişim:</span>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {patient.emergencyContact.name} ({patient.emergencyContact.relationship})
                — {patient.emergencyContact.phone}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sensör Grafikleri */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">📈 Sensör Verileri</h3>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {['1h', '6h', '24h', '7d'].map((range) => (
              <button
                key={range}
                className={`btn btn-sm ${timeRange === range ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTimeRange(range)}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {sensorData.length === 0 ? (
          <div className="empty-state">
            <p>Bu zaman aralığında veri bulunamadı</p>
          </div>
        ) : (
          <div style={{ height: 320 }}>
            <Line data={getChartData()} options={chartOptions} />
          </div>
        )}
      </div>

      {/* Alarm Geçmişi */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">🔔 Alarm Geçmişi</h3>
        </div>
        {alerts.length === 0 ? (
          <div className="empty-state"><p>Alarm kaydı bulunmuyor</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tür</th>
                  <th>Seviye</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 20).map((a) => (
                  <tr key={a._id}>
                    <td>{a.alertType}</td>
                    <td>
                      <span className={`badge ${a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'danger' : 'warning'}`}>
                        {a.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${a.status === 'active' ? 'danger' : a.status === 'resolved' ? 'safe' : 'warning'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(a.createdAt).toLocaleString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Hasta Listesi Sayfası ───
const PatientsListPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatients, setSelectedPatients] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const res = await userAPI.getPatients();
      setPatients(res.data.data.patients || []);
      setSelectedPatients([]); // Seçimleri sıfırla
    } catch (err) {
      console.error('Hasta listesi hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patientId) => {
    setSelectedPatients((prev) =>
      prev.includes(patientId)
        ? prev.filter((id) => id !== patientId)
        : [...prev, patientId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPatients.length === patients.length) {
      setSelectedPatients([]);
    } else {
      setSelectedPatients(patients.map((p) => p._id));
    }
  };

  const handleDeletePatient = async (patientId, patientName) => {
    if (!window.confirm(`"${patientName}" isimli hastayı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem hastanın tüm alarmlarını ve sensör geçmişini de kalıcı olarak silecektir!`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await userAPI.deleteUser(patientId);
      setSuccess('Hasta ve ilişkili tüm verileri başarıyla silindi.');
      fetchPatients();
    } catch (err) {
      console.error('Hasta silme hatası:', err);
      setError(err.response?.data?.message || 'Hasta silinirken bir hata oluştu.');
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Seçilen ${selectedPatients.length} hastayı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem seçilen tüm hastaların tüm alarmlarını ve sensör geçmişini de kalıcı olarak silecektir!`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await userAPI.bulkDeleteUsers(selectedPatients);
      setSuccess('Seçilen hastalar ve ilişkili tüm verileri başarıyla silindi.');
      fetchPatients();
    } catch (err) {
      console.error('Çoklu hasta silme hatası:', err);
      setError(err.response?.data?.message || 'Seçilen hastalar silinirken bir hata oluştu.');
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Hastalar</h1>
        <p>Kayıtlı hasta listesi ve detayları</p>
      </div>

      {error && <div className="badge danger" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', display: 'block', textAlign: 'center' }}>{error}</div>}
      {success && <div className="badge safe" style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', display: 'block', textAlign: 'center' }}>{success}</div>}

      {/* Toplu İşlemler Barı */}
      {isAdmin && selectedPatients.length > 0 && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.4)', borderWidth: '1px', borderStyle: 'solid' }}>
          <span style={{ fontWeight: 500, color: 'var(--status-danger)' }}>
            ⚠️ {selectedPatients.length} hasta seçildi. Silme işlemi kalıcıdır ve ilişkili tüm verileri temizler!
          </span>
          <button
            className="btn btn-sm"
            onClick={handleBulkDelete}
            style={{ backgroundColor: 'var(--status-danger)', color: 'white', borderColor: 'var(--status-danger-border)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', width: 'auto' }}
          >
            <HiOutlineTrash /> Seçilenleri Sil
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {patients.length === 0 ? (
          <div className="empty-state"><p>Kayıtlı hasta bulunmuyor</p></div>
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
                        checked={patients.length > 0 && selectedPatients.length === patients.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                  )}
                  <th>Hasta</th>
                  <th>E-posta</th>
                  <th>Telefon</th>
                  <th>Yaş</th>
                  <th>Son Veri</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${p._id}`)}>
                    {isAdmin && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={selectedPatients.includes(p._id)}
                          onChange={() => handleSelectPatient(p._id)}
                        />
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: 'var(--gradient-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: 600,
                        }}>
                          {p.firstName?.[0]}{p.lastName?.[0]}
                        </div>
                        <span style={{ fontWeight: 500 }}>{p.firstName} {p.lastName}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{p.email}</td>
                    <td>{p.phone || '—'}</td>
                    <td>{p.age || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.lastDataReceivedAt
                        ? new Date(p.lastDataReceivedAt).toLocaleString('tr-TR')
                        : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/patients/${p._id}`)}>
                          <HiOutlineUser /> Detay
                        </button>
                        {isAdmin && (
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ color: 'var(--status-danger)', borderColor: 'var(--status-danger-border)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            onClick={() => handleDeletePatient(p._id, `${p.firstName} ${p.lastName}`)}
                          >
                            <HiOutlineTrash /> Sil
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export { PatientsListPage, PatientDetailPage };
