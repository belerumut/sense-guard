/**
 * ============================================================
 * Ana Sunucu Dosyası (server.js)
 * ============================================================
 *
 * Bu dosya uygulamanın giriş noktasıdır (entry point).
 *
 * Sorumlulukları:
 * ───────────────
 * 1. Ortam değişkenlerini yükle (.env)
 * 2. Express uygulamasını oluştur
 * 3. Güvenlik middleware'lerini uygula (Helmet, CORS, Rate Limit)
 * 4. Body parser yapılandır (10MB limit — batch sensör verisi)
 * 5. HTTP request loglama (Morgan + Winston entegrasyonu)
 * 6. API route'larını monte et (/api)
 * 7. Hata yönetimi middleware'lerini ekle (404, merkezi hata)
 * 8. MongoDB'ye bağlan
 * 9. HTTP sunucusunu başlat (Socket.io uyumlu)
 * 10. Graceful shutdown (temiz kapanış)
 *
 * Neden http.createServer kullanılıyor?
 * ─────────────────────────────────────
 * Socket.io, Express'in kendi listen() metodu yerine Node.js'in
 * native http modülü üzerinden çalışır. FAZ 4'te Socket.io
 * eklendiğinde aynı HTTP sunucusuna bağlanacaktır.
 */

// ─── 1) Ortam Değişkenlerini Yükle ───
// .env dosyasını en başta yükle, tüm modüller process.env'e erişebilsin
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { initializeSocket } = require('./services/socketService');
const { startCronJobs, stopCronJobs } = require('./services/cronJobs');

// ─── 2) Express Uygulaması Oluştur ───
const app = express();

// ─── 3) Güvenlik Middleware'leri ───

// Helmet: HTTP güvenlik başlıklarını otomatik ayarlar
// (X-Frame-Options, X-Content-Type-Options, CSP vb.)
app.use(helmet());

// CORS: Sadece izin verilen origin'lerden gelen istekleri kabul et
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Cookie/auth header'ları için gerekli
  })
);

// Rate Limiting: Brute-force ve DDoS saldırılarına karşı temel koruma
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 dakika
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  message: {
    success: false,
    message: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.',
  },
  standardHeaders: true, // RateLimit-* başlıklarını yanıta ekle
  legacyHeaders: false,  // X-RateLimit-* eski başlıkları gönderme
});
app.use('/api/', limiter);

// ─── 4) Body Parser ───
// 10MB limit: Mobil cihazdan batch sensör verisi geleceği için
// varsayılan 100KB çok düşük kalır
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── 5) HTTP Request Loglama ───
// Morgan'ın çıktısını Winston logger'a yönlendir
// Böylece tüm loglar tek bir yerden yönetilir
const morganStream = {
  write: (message) => logger.http(message.trim()),
};
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: morganStream,
  })
);

// ─── 6) API Route'larını Monte Et ───
app.use('/api', routes);

// ─── 7) Hata Yönetimi ───
// Sıralama önemli: önce 404, sonra genel hata yakalayıcı
app.use(notFound);
app.use(errorHandler);

// ─── 8) HTTP Sunucusu Oluştur ───
const server = http.createServer(app);

// ─── 9) Socket.io Entegrasyonu ───
// Socket.io aynı HTTP sunucusu üzerinden çalışır
const io = initializeSocket(server);

const PORT = process.env.PORT || 5000;

// ─── 10) Veritabanına Bağlan ve Sunucuyu Başlat ───
const startServer = async () => {
  try {
    // Önce DB'ye bağlan
    await connectDB();

    // Sonra HTTP sunucusunu başlat
    server.listen(PORT, () => {
      logger.info('═══════════════════════════════════════════');
      logger.info(`🚀 Sunucu başlatıldı: http://localhost:${PORT}`);
      logger.info(`📡 API Endpoint: http://localhost:${PORT}/api`);
      logger.info(`🏥 Sağlık Kontrolü: http://localhost:${PORT}/api/health`);
      logger.info(`🔌 Socket.io: Aktif (gerçek zamanlı bildirimler)`);
      logger.info(`🌍 Ortam: ${process.env.NODE_ENV || 'development'}`);
      logger.info('═══════════════════════════════════════════');

      // Cron job'ları başlat
      startCronJobs();
    });
  } catch (error) {
    logger.error(`Sunucu başlatılamadı: ${error.message}`);
    process.exit(1);
  }
};

// ─── 11) Graceful Shutdown (Temiz Kapanış) ───
// SIGTERM (Docker/PM2 stop) veya SIGINT (Ctrl+C) sinyallerinde:
// 1. Socket.io bağlantılarını kapat
// 2. Yeni HTTP bağlantılarını kabul etmeyi durdur
// 3. Mevcut bağlantıların tamamlanmasını bekle
// 4. Veritabanı bağlantısını kapat
// 5. Temiz çıkış yap
const gracefulShutdown = (signal) => {
  logger.info(`\n${signal} sinyali alındı. Sunucu kapatılıyor...`);

  // Önce Socket.io bağlantılarını kapat
  if (io) {
    io.close();
    logger.info('Socket.io bağlantıları kapatıldı');
  }

  // Cron job'ları durdur
  stopCronJobs();

  server.close(async () => {
    logger.info('HTTP sunucusu durduruldu');

    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB bağlantısı kapatıldı');
    } catch (err) {
      logger.error(`MongoDB kapatma hatası: ${err.message}`);
    }

    logger.info('Temiz kapanış tamamlandı. Hoşça kalın! 👋');
    process.exit(0);
  });

  // 10 saniye içinde kapanamazsa zorla çık
  setTimeout(() => {
    logger.error('Temiz kapanış zaman aşımına uğradı, zorla kapatılıyor');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Sunucuyu Başlat ───
startServer();

// Express app'i dışa aktar (test amaçlı)
module.exports = { app, server };
