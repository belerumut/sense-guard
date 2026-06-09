/**
 * ============================================================
 * Kimlik Doğrulama Controller'ı (controllers/authController.js)
 * ============================================================
 *
 * Kullanıcı kayıt (register) ve giriş (login) işlemlerini yönetir.
 *
 * Endpoint'ler:
 * ─────────────
 * POST /api/auth/register → Yeni kullanıcı kaydı
 * POST /api/auth/login    → Giriş yapma
 * GET  /api/auth/me       → Mevcut kullanıcı bilgileri
 *
 * Güvenlik Katmanları:
 * ────────────────────
 * 1. Şifre hashleme → User modeli pre-save hook'unda (bcrypt, 12 salt)
 * 2. JWT token      → Başarılı işlem sonrası döndürülür
 * 3. select: false  → Şifre sorgu sonuçlarına dahil edilmez
 * 4. Türkçe hata mesajları → Kullanıcı dostu yanıtlar
 */

const { User } = require('../models');
const { generateToken } = require('../utils/tokenHelper');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * @desc    Yeni kullanıcı kaydı
 * @route   POST /api/auth/register
 * @access  Public
 *
 * İş Akışı:
 * 1. Gerekli alanları doğrula
 * 2. E-posta tekrarlılık kontrolü (Türkçe-safe, lowercase)
 * 3. Kullanıcıyı oluştur (şifre pre-save hook'ta hashlenir)
 * 4. JWT token üret ve döndür
 */
const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, role, phone, age, medicalNotes, emergencyContact } = req.body;

    // ─── Zorunlu Alan Kontrolü ───
    if (!firstName || !lastName || !email || !password) {
      return apiResponse.error(
        res,
        'Ad, soyad, e-posta ve şifre alanları zorunludur',
        400
      );
    }

    // ─── E-posta Tekrarlılık Kontrolü ───
    // lowercase dönüşümü model seviyesinde yapılıyor,
    // ancak burada da kontrol ediyoruz (daha iyi hata mesajı için)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return apiResponse.error(
        res,
        'Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın veya farklı bir e-posta kullanın',
        409
      );
    }

    // ─── Rol Doğrulama ───
    // Güvenlik: Sadece admin, register endpoint'inden admin oluşturabilir
    // Şimdilik tüm rollere izin veriyoruz (FAZ ilerledikçe kısıtlanabilir)
    const allowedRoles = ['admin', 'monitor', 'patient'];
    const userRole = role && allowedRoles.includes(role) ? role : 'patient';

    // ─── Kullanıcı Oluşturma ───
    const user = await User.create({
      firstName,
      lastName,
      email,
      password, // pre-save hook'ta hashlenecek
      role: userRole,
      phone,
      age,
      medicalNotes,
      emergencyContact,
    });

    // ─── Token Üretimi ───
    const token = generateToken(user);

    // Şifreyi yanıttan çıkar
    const userResponse = user.toObject();
    delete userResponse.password;

    logger.info(`Yeni kullanıcı kaydı: ${user.email} (${user.role})`);

    return apiResponse.success(
      res,
      'Kayıt başarılı',
      {
        user: userResponse,
        token,
      },
      201
    );
  } catch (error) {
    next(error); // Merkezi hata yönetimine devret
  }
};

/**
 * @desc    Kullanıcı girişi
 * @route   POST /api/auth/login
 * @access  Public
 *
 * İş Akışı:
 * 1. E-posta ve şifre kontrolü
 * 2. Kullanıcıyı bul (şifre dahil — select: '+password')
 * 3. Hesap aktiflik kontrolü
 * 4. Şifreyi karşılaştır (bcrypt.compare)
 * 5. JWT token üret ve döndür
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // ─── Zorunlu Alan Kontrolü ───
    if (!email || !password) {
      return apiResponse.error(
        res,
        'E-posta ve şifre alanları zorunludur',
        400
      );
    }

    // ─── Kullanıcıyı Bul ───
    // select('+password') → normalde gizlenen şifre alanını dahil et
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return apiResponse.error(
        res,
        'E-posta veya şifre hatalı',
        401
      );
    }

    // ─── Hesap Aktiflik Kontrolü ───
    if (!user.isActive) {
      return apiResponse.error(
        res,
        'Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin',
        403
      );
    }

    // ─── Şifre Karşılaştırma ───
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      // Güvenlik: "E-posta veya şifre hatalı" → Hangi alanın yanlış
      // olduğunu ifşa etme (brute-force'u zorlaştırır)
      return apiResponse.error(
        res,
        'E-posta veya şifre hatalı',
        401
      );
    }

    // ─── Token Üretimi ───
    const token = generateToken(user);

    // Şifreyi yanıttan çıkar
    const userResponse = user.toObject();
    delete userResponse.password;

    logger.info(`Kullanıcı girişi: ${user.email} (${user.role})`);

    return apiResponse.success(res, 'Giriş başarılı', {
      user: userResponse,
      token,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mevcut giriş yapmış kullanıcının bilgilerini döndürür
 * @route   GET /api/auth/me
 * @access  Private (JWT gerekli)
 *
 * Not: Bu endpoint'e erişmek için auth middleware'den geçilmiş olmalı.
 * req.user auth middleware tarafından eklenir.
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return apiResponse.error(res, 'Kullanıcı bulunamadı', 404);
    }

    return apiResponse.success(res, 'Kullanıcı bilgileri', { user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
};
