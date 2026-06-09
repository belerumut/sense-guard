/**
 * ============================================================
 * Kullanıcı Route'ları (routes/userRoutes.js)
 * ============================================================
 *
 * Kullanıcı yönetimi endpoint'lerini tanımlar.
 *
 * Endpoint'ler:
 * ─────────────
 * GET    /api/users               → Tüm kullanıcıları listele (admin/monitor)
 * GET    /api/users/patients/list → Aktif hastaları listele (admin/monitor)
 * GET    /api/users/:id           → Kullanıcı detayı
 * GET    /api/users/:id/live-location → Canlı konum (admin/monitor)
 * PUT    /api/users/:id           → Kullanıcı güncelle (admin/kendisi)
 * DELETE /api/users/:id           → Kullanıcı sil (admin)
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const {
  getUsers,
  getUserById,
  getLiveLocation,
  updateUser,
  deleteUser,
  getPatientsList,
  updateUserRole,
  bulkDeleteUsers,
} = require('../controllers/userController');

// Tüm route'lar için kimlik doğrulama gerekli
router.use(protect);

// ─── Toplu Kullanıcı Silme (Sadece Admin) ───
// NOT: Bu route /:id'den önce tanımlanmalı
router.post('/bulk-delete', authorize('admin'), bulkDeleteUsers);

// ─── Hasta Listesi (harita/izleme için) ───
// Bu route /:id'den önce tanımlanmalı (yoksa "patients" id olarak algılanır)
router.get('/patients/list', authorize('admin', 'monitor'), getPatientsList);

// ─── Kullanıcı Listeleme ───
router.get('/', authorize('admin', 'monitor'), getUsers);

// ─── Kullanıcı Detayı ───
router.get('/:id', getUserById);

// ─── Canlı Konum ───
router.get('/:id/live-location', authorize('admin', 'monitor'), getLiveLocation);

// ─── Kullanıcı Güncelleme ───
router.put('/:id', updateUser);

// ─── Kullanıcı Rolü Güncelleme (Sadece Admin) ───
router.put('/:id/role', authorize('admin'), updateUserRole);

// ─── Kullanıcı Silme ───
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;
