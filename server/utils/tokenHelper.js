/**
 * ============================================================
 * JWT Token Yardımcıları (utils/tokenHelper.js)
 * ============================================================
 *
 * Token oluşturma ve doğrulama işlemlerini merkezileştirir.
 *
 * Neden ayrı bir modül?
 * ─────────────────────
 * Token üretimi birden fazla yerde kullanılabilir:
 * - Login sonrası
 * - Kayıt sonrası (otomatik giriş)
 * - Token yenileme (refresh — gelecekte eklenebilir)
 *
 * Token Payload:
 * ──────────────
 * { id, role } → Kullanıcı kimliği ve rolü token içine gömülür.
 * Böylece her istekte DB sorgusu yapmadan rol kontrolü yapılabilir.
 */

const jwt = require('jsonwebtoken');

/**
 * JWT token oluşturur
 * @param {Object} user - Mongoose user belgesi
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '7d',
    }
  );
};

/**
 * JWT token'ı doğrular ve payload'ı döndürür
 * @param {string} token - Doğrulanacak JWT token
 * @returns {Object} Token payload { id, role, iat, exp }
 * @throws {JsonWebTokenError|TokenExpiredError} Geçersiz/süresi dolmuş token
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateToken, verifyToken };
