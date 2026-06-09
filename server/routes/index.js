/**
 * ============================================================
 * Ana Route Dosyası (routes/index.js)
 * ============================================================
 *
 * Tüm alt route modüllerini tek bir noktadan birleştirir.
 * server.js yalnızca bu dosyayı require eder; her yeni faz
 * eklendikçe sadece buraya yeni satır eklenir.
 *
 * Mevcut Endpoint'ler:
 * ────────────────────
 * GET /api/health → Sunucu sağlık kontrolü
 *   Döndürdüğü bilgiler:
 *   - status     : "OK"
 *   - environment: Çalışma ortamı (development/production)
 *   - uptime     : Sunucu çalışma süresi (saniye)
 *   - database   : MongoDB bağlantı durumu
 *   - timestamp  : Şu anki zaman damgası
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ─── Veritabanı Bağlantı Durumu Etiketleri ───
const DB_STATES = {
  0: 'Bağlantı kesildi',
  1: 'Bağlı',
  2: 'Bağlanıyor',
  3: 'Bağlantı kesiliyor',
};

// ─── Sağlık Kontrolü Endpoint'i ───
router.get('/health', (req, res) => {
  const healthData = {
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    uptime: `${Math.floor(process.uptime())} saniye`,
    database: DB_STATES[mongoose.connection.readyState] || 'Bilinmiyor',
    timestamp: new Date().toISOString(),
  };

  // DB bağlantısı yoksa 503 döndür
  const statusCode = mongoose.connection.readyState === 1 ? 200 : 503;

  res.status(statusCode).json({
    success: statusCode === 200,
    message: statusCode === 200 ? 'Sunucu sağlıklı çalışıyor' : 'Veritabanı bağlantısı yok',
    data: healthData,
  });
});

// ─── Alt Route'lar ───
router.use('/auth', require('./authRoutes'));       // Kimlik doğrulama
router.use('/sensor', require('./sensorRoutes'));   // Sensör veri akışı
router.use('/alerts', require('./alertRoutes'));    // Alarm yönetimi
router.use('/users', require('./userRoutes'));      // Kullanıcı yönetimi
router.use('/system', require('./systemRoutes'));    // Sistem ayarları

module.exports = router;
