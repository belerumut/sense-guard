/**
 * ============================================================
 * Kimlik Doğrulama Route'ları (routes/authRoutes.js)
 * ============================================================
 *
 * Endpoint Tablosu:
 * ─────────────────────────────────────────────────────────
 * Method  | URL              | Erişim   | Açıklama
 * ─────────────────────────────────────────────────────────
 * POST    | /api/auth/register | Public   | Yeni kullanıcı kaydı
 * POST    | /api/auth/login    | Public   | Giriş yapma
 * GET     | /api/auth/me       | Private  | Mevcut kullanıcı bilgileri
 * ─────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

// ─── Public Route'lar (Token gerektirmez) ───
router.post('/register', register);
router.post('/login', login);

// ─── Protected Route'lar (Token gerektirir) ───
router.get('/me', protect, getMe);

module.exports = router;
