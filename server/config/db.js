/**
 * ============================================================
 * Veritabanı Bağlantı Modülü (config/db.js)
 * ============================================================
 *
 * Mongoose ile MongoDB'ye bağlantı kurar.
 *
 * Strateji: "Fail-Fast"
 * ─────────────────────
 * Eğer veritabanına bağlanamazsa, sunucuyu çalışır durumda tutmanın
 * anlamı yoktur. Bu yüzden bağlantı hatalarında process.exit(1) ile
 * çıkış yapılır. Bu, Docker/PM2 gibi ortamlarında otomatik restart
 * mekanizmasıyla uyumludur.
 *
 * Olay Dinleyicileri:
 * ───────────────────
 * - connected  → Bağlantı kurulduğunda loga yazar
 * - error      → Bağlantı sırasında hata olursa loga yazar
 * - disconnected → Bağlantı koptuğunda uyarı verir
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    // ─── Mongoose Olay Dinleyicileri ───
    mongoose.connection.on('connected', () => {
      logger.info('📦 MongoDB bağlantısı başarıyla kuruldu');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`📦 MongoDB bağlantı hatası: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('📦 MongoDB bağlantısı kesildi');
    });

    // ─── Bağlantı Kurulumu ───
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Mongoose 8+ sürümünde bu ayarlar varsayılan olarak aktiftir,
      // ancak açıkça belirtmek kodun niyetini netleştirir.
    });

    logger.info(`📦 MongoDB bağlandı: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`📦 MongoDB bağlantı başarısız: ${error.message}`);
    process.exit(1); // Fail-fast: DB yoksa sunucu çalışmamalı
  }
};

module.exports = connectDB;
