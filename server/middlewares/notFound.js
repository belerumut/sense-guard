/**
 * ============================================================
 * Not Found (404) Middleware'i (middlewares/notFound.js)
 * ============================================================
 *
 * Tanımlanmamış route'lara yapılan istekleri yakalar ve
 * merkezi hata yöneticisine (errorHandler) yönlendirir.
 *
 * Neden ayrı bir middleware?
 * ─────────────────────────
 * Tüm geçerli route'lar eşleşmediğinde Express buraya düşer.
 * Bu middleware, 404 hatasını standart hata akışına dahil ederek
 * tutarlı bir hata yanıtı formatı sağlar.
 */

const notFound = (req, res, next) => {
  const error = new Error(`Bulunamadı: ${req.originalUrl} adresinde kaynak mevcut değil`);
  error.statusCode = 404;
  next(error); // errorHandler middleware'ine devret
};

module.exports = notFound;
