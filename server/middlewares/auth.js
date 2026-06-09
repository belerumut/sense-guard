/**
 * ============================================================
 * Kimlik Doğrulama Middleware'i (middlewares/auth.js)
 * ============================================================
 *
 * İki katmanlı koruma sağlar:
 *
 * 1. protect() → JWT Token Doğrulama
 *    - Authorization header'ından "Bearer <token>" formatında token alır
 *    - Token'ı doğrular ve payload'daki user id ile kullanıcıyı DB'den çeker
 *    - req.user nesnesine kullanıcıyı ekler (sonraki middleware'ler kullanır)
 *
 * 2. authorize(...roles) → Rol Tabanlı Erişim Kontrolü
 *    - protect() sonrasında çalışır
 *    - Kullanıcının rolünün izin verilen roller arasında olup olmadığını kontrol eder
 *    - Örnek: authorize('admin', 'monitor') → sadece admin ve monitor erişebilir
 *
 * Kullanım Örnekleri:
 * ───────────────────
 * // Sadece giriş yapmış kullanıcılar
 * router.get('/profile', protect, getProfile);
 *
 * // Sadece admin ve monitor
 * router.get('/alerts', protect, authorize('admin', 'monitor'), getAlerts);
 *
 * // Sadece admin
 * router.delete('/users/:id', protect, authorize('admin'), deleteUser);
 */

const { User } = require('../models');
const { verifyToken } = require('../utils/tokenHelper');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * JWT Token Doğrulama Middleware'i
 * Authorization: Bearer <token> formatını kontrol eder
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // ─── Token'ı Header'dan Al ───
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
      // "Bearer eyJhbG..." → "eyJhbG..." kısmını al
      token = authHeader.split(' ')[1];
    }

    // Token yoksa erişimi reddet
    if (!token) {
      return apiResponse.error(
        res,
        'Bu kaynağa erişmek için giriş yapmanız gerekiyor',
        401
      );
    }

    // ─── Token'ı Doğrula ───
    // verifyToken hata fırlatırsa errorHandler yakalar
    // (TokenExpiredError, JsonWebTokenError)
    const decoded = verifyToken(token);

    // ─── Kullanıcıyı DB'den Çek ───
    // Token geçerli olsa bile kullanıcı silinmiş/deaktif olmuş olabilir
    const user = await User.findById(decoded.id);

    if (!user) {
      return apiResponse.error(
        res,
        'Bu token\'a ait kullanıcı artık mevcut değil',
        401
      );
    }

    // Hesap aktiflik kontrolü
    if (!user.isActive) {
      return apiResponse.error(
        res,
        'Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin',
        403
      );
    }

    // ─── Kullanıcıyı Request'e Ekle ───
    // Sonraki middleware'ler ve controller'lar req.user üzerinden erişir
    req.user = user;
    next();
  } catch (error) {
    // JWT hataları errorHandler tarafından Türkçe mesajlarla döndürülür
    next(error);
  }
};

/**
 * Rol Tabanlı Erişim Kontrolü Middleware'i (Factory Function)
 *
 * @param  {...string} roles - İzin verilen roller
 * @returns {Function} Express middleware
 *
 * Örnekler:
 *   authorize('admin')                 → Sadece admin
 *   authorize('admin', 'monitor')      → Admin veya monitor
 *   authorize('admin', 'monitor', 'patient') → Herkes (giriş yapmış)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // protect() middleware'i çalışmamışsa req.user olmaz
    if (!req.user) {
      return apiResponse.error(
        res,
        'Yetkilendirme hatası: Önce giriş yapmalısınız',
        401
      );
    }

    // Admin her zaman tam yetkilidir (Bypass)
    if (req.user.role === 'admin') {
      return next();
    }

    // Kullanıcının rolü izin verilenler arasında mı?
    if (!roles.includes(req.user.role)) {
      logger.warn(
        `Yetkisiz erişim denemesi: ${req.user.email} (${req.user.role}) → ${req.originalUrl}`
      );

      return apiResponse.error(
        res,
        `Bu işlem için yetkiniz bulunmuyor. Gerekli roller: ${roles.join(', ')}`,
        403
      );
    }

    next();
  };
};

module.exports = { protect, authorize };
