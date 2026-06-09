/**
 * ============================================================
 * Alarm Route'ları (routes/alertRoutes.js)
 * ============================================================
 *
 * Endpoint Tablosu:
 * ──────────────────────────────────────────────────────────────────
 * Method | URL                          | Erişim         | Açıklama
 * ──────────────────────────────────────────────────────────────────
 * GET    | /api/alerts                  | admin,monitor  | Aktif alarmlar
 * GET    | /api/alerts/stats            | admin,monitor  | İstatistikler
 * GET    | /api/alerts/:id              | admin,monitor  | Alarm detayı
 * PATCH  | /api/alerts/:id/ack          | admin,monitor  | Onayla
 * PATCH  | /api/alerts/:id/resolve      | admin,monitor  | Çöz
 * GET    | /api/alerts/patient/:patientId | admin,monitor,self | Hasta geçmişi
 * ──────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const {
  getActiveAlerts,
  getAlertStats,
  getAlertById,
  acknowledgeAlert,
  resolveAlert,
  getPatientAlerts,
  deleteAlert,
  bulkDeleteAlerts,
} = require('../controllers/alertController');
const { protect, authorize } = require('../middlewares/auth');

// Tüm alarm route'ları JWT gerektirir
router.use(protect);

// ─── Toplu Alarm Silme (Sadece Admin) ───
// NOT: Bu route /:id'den önce tanımlanmalı
router.post('/bulk-delete', authorize('admin'), bulkDeleteAlerts);

// Aktif alarmlar — admin, monitor ve patient
router.get('/', authorize('admin', 'monitor', 'patient'), getActiveAlerts);

// Alarm istatistikleri — sadece admin ve monitor
router.get('/stats', authorize('admin', 'monitor'), getAlertStats);

// Hasta alarm geçmişi — admin, monitor veya kendi geçmişi
// NOT: Bu route /api/alerts/patient/:patientId şeklinde
// /:id route'undan önce tanımlanmalı (parametre çakışması önlenir)
router.get('/patient/:patientId', authorize('admin', 'monitor', 'patient'), getPatientAlerts);

// Tek alarm detayı — admin ve monitor
router.get('/:id', authorize('admin', 'monitor'), getAlertById);

// Alarm onayla — admin ve monitor
router.patch('/:id/ack', authorize('admin', 'monitor'), acknowledgeAlert);

// Alarm çöz — admin ve monitor
router.patch('/:id/resolve', authorize('admin', 'monitor'), resolveAlert);

// Alarm Silme — Sadece Admin
router.delete('/:id', authorize('admin'), deleteAlert);

module.exports = router;
