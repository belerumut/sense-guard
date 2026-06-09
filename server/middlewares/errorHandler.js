/**
 * ============================================================
 * Merkezi Hata Yönetim Middleware'i (middlewares/errorHandler.js)
 * ============================================================
 *
 * Express'in 4-parametreli hata middleware'idir.
 * Uygulama genelindeki tüm hatalar bu noktaya yönlendirilir.
 *
 * Yakalanan Hata Türleri:
 * ───────────────────────
 * 1. Mongoose ValidationError → Alan doğrulama hataları
 * 2. Mongoose CastError       → Geçersiz ObjectId formatı
 * 3. MongoDB 11000            → Tekrarlanan (unique) alan hatası
 * 4. JWT Hataları              → Token süresi dolmuş / geçersiz
 *
 * Güvenlik:
 * ─────────
 * Stack trace yalnızca development ortamında döndürülür.
 * Production'da hata detayları gizlenir.
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Orijinal hatanın bir kopyasını oluştur
  let error = {
    message: err.message || 'Sunucu hatası',
    statusCode: err.statusCode || 500,
  };

  // ─── 1) Mongoose Validation Error ───
  // Şema kurallarına uymayan alanlar (required, minlength vb.)
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((val) => val.message);
    error.message = `Doğrulama hatası: ${messages.join(', ')}`;
    error.statusCode = 400;
  }

  // ─── 2) Mongoose CastError ───
  // Geçersiz ObjectId ile sorgulama yapıldığında
  if (err.name === 'CastError') {
    error.message = `Geçersiz veri formatı: ${err.path} alanı için '${err.value}' değeri uygun değil`;
    error.statusCode = 400;
  }

  // ─── 3) MongoDB Duplicate Key (11000) ───
  // Unique index'e sahip alana aynı değer eklenmeye çalışıldığında
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue).join(', ');
    error.message = `Bu ${field} değeri zaten kullanımda. Lütfen farklı bir değer deneyin`;
    error.statusCode = 409; // Conflict
  }

  // ─── 4) JWT Token Süresi Dolmuş ───
  if (err.name === 'TokenExpiredError') {
    error.message = 'Oturum süresi doldu. Lütfen tekrar giriş yapın';
    error.statusCode = 401;
  }

  // ─── 5) JWT Geçersiz Token ───
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Geçersiz kimlik doğrulama bilgisi. Lütfen tekrar giriş yapın';
    error.statusCode = 401;
  }

  // ─── Hatayı Logla ───
  logger.error(`${error.statusCode} - ${error.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);

  // ─── Yanıtı Gönder ───
  const response = {
    success: false,
    message: error.message,
  };

  // Stack trace sadece development'ta gösterilir (güvenlik)
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(error.statusCode).json(response);
};

module.exports = errorHandler;
