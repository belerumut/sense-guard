/**
 * ============================================================
 * API Yanıt Yardımcıları (utils/apiResponse.js)
 * ============================================================
 *
 * Tüm API endpoint'lerinden tutarlı JSON yanıtı döndürmeyi garanti eder.
 *
 * Neden Gerekli?
 * ──────────────
 * Frontend tarafı (React dashboard, mobil uygulama) her zaman aynı
 * yapıda yanıt bekler. Bu, hata yönetimini ve veri çözümlemeyi
 * büyük ölçüde basitleştirir.
 *
 * Yanıt Formatı:
 * ──────────────
 * Başarılı → { success: true,  message: "...", data: {...} }
 * Hatalı   → { success: false, message: "...", errors: [...] }
 */

/**
 * Başarılı yanıt döndürür
 * @param {Object} res - Express response nesnesi
 * @param {string} message - Kullanıcıya gösterilecek mesaj
 * @param {*} data - Döndürülecek veri (opsiyonel)
 * @param {number} statusCode - HTTP durum kodu (varsayılan: 200)
 */
const success = (res, message = 'İşlem başarılı', data = null, statusCode = 200) => {
  const response = {
    success: true,
    message,
  };

  // data varsa yanıta ekle, yoksa gereksiz alan gönderme
  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Hata yanıtı döndürür
 * @param {Object} res - Express response nesnesi
 * @param {string} message - Hata mesajı
 * @param {number} statusCode - HTTP durum kodu (varsayılan: 500)
 * @param {Array} errors - Detaylı hata listesi (validasyon hataları vb.)
 */
const error = (res, message = 'Bir hata oluştu', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors !== null) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

module.exports = { success, error };
