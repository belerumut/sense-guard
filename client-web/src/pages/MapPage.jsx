/**
 * Canlı Harita Sayfası — Leaflet.js Entegrasyonu
 * Teknik Doküman → Bölüm 7.2
 */
import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { userAPI, alertAPI } from '../services/api';
import { onNewAlert, onLocationUpdate, removeAlertListeners } from '../services/socketClient';
import 'leaflet/dist/leaflet.css';

// Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Özel ikonlar
const createIcon = (color) =>
  new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      ${color === '#ef4444' ? 'animation: pulse-red 2s infinite;' : ''}
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

const safeIcon = createIcon('#10b981');
const dangerIcon = createIcon('#ef4444');
const warningIcon = createIcon('#f59e0b');

const MapPage = () => {
  const [patients, setPatients] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMapData();

    onNewAlert(() => fetchMapData());

    onLocationUpdate((data) => {
      setPatients((prevPatients) =>
        prevPatients.map((p) => {
          if (p._id === data.userId) {
            return {
              ...p,
              lastKnownLocation: {
                type: 'Point',
                coordinates: [data.location.longitude, data.location.latitude],
              },
              lastDataReceivedAt: data.timestamp,
            };
          }
          return p;
        })
      );
    });

    return () => removeAlertListeners();
  }, []);

  const fetchMapData = async () => {
    try {
      const [patientRes, alertRes] = await Promise.allSettled([
        userAPI.getPatients(),
        alertAPI.getActive(),
      ]);

      if (patientRes.status === 'fulfilled') {
        setPatients(patientRes.value.data.data.patients || []);
      }
      if (alertRes.status === 'fulfilled') {
        setActiveAlerts(alertRes.value.data.data.alerts || []);
      }
    } catch (err) {
      console.error('Harita veri hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  // Her hasta için en son konumu ve alarm durumunu belirle
  const getPatientMarkers = () => {
    return patients.map((patient) => {
      // Son bilinen konum
      const loc = patient.lastKnownLocation;
      if (!loc?.coordinates || loc.coordinates.length < 2) return null;

      const lat = loc.coordinates[1]; // GeoJSON: [lng, lat]
      const lng = loc.coordinates[0];

      // Bu hasta için aktif alarm var mı?
      const hasAlert = activeAlerts.some(
        (a) => a.patientId?._id === patient._id || a.patientId === patient._id
      );
      const alertData = activeAlerts.find(
        (a) => a.patientId?._id === patient._id || a.patientId === patient._id
      );

      const isCritical = alertData?.severity === 'critical' || alertData?.severity === 'high';

      return {
        ...patient,
        lat,
        lng,
        hasAlert,
        alertData,
        icon: hasAlert ? (isCritical ? dangerIcon : warningIcon) : safeIcon,
      };
    }).filter(Boolean);
  };

  const markers = getPatientMarkers();
  // Bursa merkez (default)
  const center = markers.length > 0
    ? [markers[0].lat, markers[0].lng]
    : [40.2249, 28.9553];

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
        <h1>Canlı Harita</h1>
        <p>Hastaların anlık konumları ve alarm durumları</p>
      </div>

      {/* Durum özeti */}
      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card safe">
          <div className="stat-icon safe">📍</div>
          <div className="stat-content">
            <h3>{markers.filter((m) => !m.hasAlert).length}</h3>
            <p>Güvenli</p>
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-icon danger">🚨</div>
          <div className="stat-content">
            <h3>{markers.filter((m) => m.hasAlert).length}</h3>
            <p>Alarmda</p>
          </div>
        </div>
        <div className="stat-card info">
          <div className="stat-icon info">👥</div>
          <div className="stat-content">
            <h3>{patients.length}</h3>
            <p>Toplam Hasta</p>
          </div>
        </div>
      </div>

      {/* Harita */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapContainer
          center={center}
          zoom={13}
          className="map-container"
          style={{ height: '520px', borderRadius: 'var(--radius-lg)' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {markers.map((m) => (
            <Marker key={m._id} position={[m.lat, m.lng]} icon={m.icon}>
              <Popup>
                <div style={{ minWidth: 180, fontFamily: 'Inter, sans-serif' }}>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {m.firstName} {m.lastName}
                  </strong>
                  <br />
                  <span style={{ color: '#666', fontSize: '0.8rem' }}>{m.email}</span>
                  {m.age && <><br /><span style={{ fontSize: '0.8rem' }}>Yaş: {m.age}</span></>}
                  {m.hasAlert && (
                    <div style={{
                      marginTop: 8, padding: '4px 8px',
                      background: '#fef2f2', borderRadius: 4,
                      color: '#dc2626', fontSize: '0.8rem', fontWeight: 600,
                    }}>
                      ⚠️ {m.alertData?.alertType === 'FALL_DETECTED' ? 'Düşme Tespit Edildi' :
                        m.alertData?.alertType === 'INACTIVITY_LONG' ? 'Hareketsizlik' :
                        m.alertData?.alertType || 'Alarm Aktif'}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default MapPage;
