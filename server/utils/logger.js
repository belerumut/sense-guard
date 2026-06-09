/**
 * ============================================================
 * Winston Logger Modülü (utils/logger.js)
 * ============================================================
 *
 * Uygulamanın tüm log ihtiyaçlarını merkezi olarak yönetir.
 *
 * Ortam Bazlı Davranış:
 * ─────────────────────
 * Development → Renkli, okunabilir console çıktısı
 * Production  → JSON formatında dosya logları
 *               - combined.log → Tüm seviyeler
 *               - error.log    → Sadece hatalar (hızlı sorun tespiti)
 *
 * Dosya Rotasyonu:
 * ────────────────
 * Her dosya max 5MB, en fazla 5 dosya tutulur.
 * Bu sayede disk dolması önlenir.
 */

const winston = require('winston');
const path = require('path');

// ─── Log Formatları ───
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ─── Transport'lar (Log Hedefleri) ───
const transports = [];

if (process.env.NODE_ENV === 'production') {
  // Production: Dosyaya yaz
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    })
  );
} else {
  // Development: Console'a yaz
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// ─── Logger Oluşturma ───
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: fileFormat,
  transports,
  // Yakalanmamış hataları da logla
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join('logs', 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join('logs', 'rejections.log'),
    }),
  ],
});

module.exports = logger;
