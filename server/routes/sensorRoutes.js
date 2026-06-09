/**
 * ============================================================
 * Sensör Route'ları (routes/sensorRoutes.js)
 * ============================================================
 *
 * Endpoint Tablosu:
 * ─────────────────────────────────────────────────────────────
 * Method | URL                      | Erişim         | Açıklama
 * ─────────────────────────────────────────────────────────────
 * POST   | /api/sensor/ingest       | patient        | Batch veri alımı
 * GET    | /api/sensor/latest/:userId | admin,monitor,self | Son veriler
 * GET    | /api/sensor/range/:userId  | admin,monitor,self | Zaman aralığı
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const { ingestBatch, getLatestReadings, getReadingsByRange } = require('../controllers/sensorController');
const { protect, authorize } = require('../middlewares/auth');

// Tüm sensör route'ları JWT gerektirir
router.use(protect);

// Batch veri alımı — sadece patient (mobil cihaz) gönderebilir
router.post('/ingest', authorize('patient'), ingestBatch);

// Son veriler — admin, monitor veya kendi verisi
router.get('/latest/:userId', authorize('admin', 'monitor', 'patient'), getLatestReadings);

// Zaman aralığına göre veri — admin, monitor veya kendi verisi
router.get('/range/:userId', authorize('admin', 'monitor', 'patient'), getReadingsByRange);

module.exports = router;
