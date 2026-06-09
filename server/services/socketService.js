/**
 * ============================================================
 * Socket.io Servis Modülü (services/socketService.js)
 * ============================================================
 *
 * Gerçek zamanlı iletişim altyapısını yönetir.
 *
 * Sorumluluklar:
 * ──────────────
 * 1. Socket.io sunucusunu HTTP sunucusuna bağlar
 * 2. İstemci bağlantılarını yönetir (connect/disconnect)
 * 3. Oda (room) tabanlı yetkilendirme sağlar
 * 4. Alarm bildirimlerini ilgili odalara yayınlar
 *
 * Oda Yapısı:
 * ───────────
 * - "dashboard"    → Admin ve monitor kullanıcıları (alarm bildirimleri)
 * - "patient:<id>" → Belirli bir hastaya ait oda (opsiyonel, gelecek)
 *
 * Olay (Event) Tablosu:
 * ─────────────────────────────────────────────
 * Sunucu → İstemci:
 *   "new-alert"       → Yeni alarm oluştuğunda
 *   "alert-updated"   → Alarm durumu değiştiğinde
 *   "connection-ack"  → Bağlantı onayı
 *
 * İstemci → Sunucu:
 *   "join-dashboard"  → Dashboard odasına katılma isteği
 *   "leave-dashboard" → Dashboard odasından ayrılma
 * ─────────────────────────────────────────────
 */

const { Server } = require('socket.io');
const { verifyToken } = require('../utils/tokenHelper');
const logger = require('../utils/logger');

let io = null;

/**
 * Socket.io sunucusunu başlatır ve HTTP sunucusuna bağlar
 * @param {Object} httpServer - Node.js HTTP sunucusu
 * @returns {Object} Socket.io sunucu örneği
 */
const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Bağlantı ayarları
    pingTimeout: 60000,    // 60 saniye ping timeout
    pingInterval: 25000,   // 25 saniye ping aralığı
    transports: ['websocket', 'polling'], // WebSocket öncelikli
  });

  // ─── Bağlantı Öncesi JWT Doğrulama (Middleware) ───
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Kimlik doğrulama gerekli'));
      }

      const decoded = verifyToken(token);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      logger.warn(`🔌 Socket bağlantı reddedildi: Geçersiz token`);
      next(new Error('Geçersiz kimlik doğrulama bilgisi'));
    }
  });

  // ─── Bağlantı Yönetimi ───
  io.on('connection', (socket) => {
    logger.info(
      `🔌 Socket bağlandı: ${socket.id} | Kullanıcı: ${socket.userId} | Rol: ${socket.userRole}`
    );

    // Bağlantı onayı gönder
    socket.emit('connection-ack', {
      message: 'Sunucuya başarıyla bağlandınız',
      socketId: socket.id,
      role: socket.userRole,
    });

    // ─── Dashboard Odasına Katılma ───
    // Sadece admin ve monitor dashboard odasına katılabilir
    socket.on('join-dashboard', () => {
      if (['admin', 'monitor'].includes(socket.userRole)) {
        socket.join('dashboard');
        logger.info(`🔌 Dashboard odasına katıldı: ${socket.userId}`);
        socket.emit('room-joined', { room: 'dashboard' });
      } else {
        socket.emit('error-message', {
          message: 'Dashboard odasına katılma yetkiniz yok',
        });
      }
    });

    // ─── Dashboard Odasından Ayrılma ───
    socket.on('leave-dashboard', () => {
      socket.leave('dashboard');
      logger.info(`🔌 Dashboard odasından ayrıldı: ${socket.userId}`);
    });

    // ─── Bağlantı Kesilmesi ───
    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Socket ayrıldı: ${socket.id} | Sebep: ${reason}`);
    });
  });

  logger.info('🔌 Socket.io sunucusu başlatıldı');
  return io;
};

/**
 * Yeni alarm bildirimi yayınlar
 * Dashboard odasındaki tüm admin/monitor'lere gönderilir
 *
 * @param {Object} alertData - Alarm verisi
 * @param {string} alertData.alertType - Alarm türü (fall/inactivity)
 * @param {string} alertData.severity - Risk seviyesi
 * @param {string} alertData.message - Alarm mesajı
 * @param {Object} alertData.patient - Hasta bilgileri (ad, id)
 */
const emitNewAlert = (alertData) => {
  if (!io) {
    logger.warn('🔌 Socket.io başlatılmamış, alarm bildirimi gönderilemedi');
    return;
  }

  io.to('dashboard').emit('new-alert', {
    ...alertData,
    timestamp: new Date().toISOString(),
  });

  logger.info(
    `🔔 Alarm bildirimi yayınlandı: ${alertData.alertType} | Şiddet: ${alertData.severity}`
  );
};

/**
 * Alarm durumu değişikliği bildirimi
 * Bir alarm onaylandığında veya çözümlendiğinde yayınlanır
 *
 * @param {Object} alertData - Güncellenmiş alarm verisi
 */
const emitAlertUpdate = (alertData) => {
  if (!io) {
    logger.warn('🔌 Socket.io başlatılmamış, güncelleme bildirimi gönderilemedi');
    return;
  }

  io.to('dashboard').emit('alert-updated', {
    ...alertData,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Kullanıcı konum güncellemesini yayınlar
 * @param {string} userId - Hasta ID'si
 * @param {Object} locationData - Konum verisi (lat, lng, accuracy)
 */
const emitLocationUpdate = (userId, locationData) => {
  if (!io) {
    logger.warn('🔌 Socket.io başlatılmamış, konum güncelleme bildirimi gönderilemedi');
    return;
  }

  io.to('dashboard').emit('location-update', {
    userId,
    location: locationData,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Socket.io sunucu örneğini döndürür
 * @returns {Object|null} Socket.io sunucusu
 */
const getIO = () => io;

/**
 * Bağlı dashboard istemci sayısını döndürür
 * @returns {number} Bağlı istemci sayısı
 */
const getDashboardClientCount = async () => {
  if (!io) return 0;
  const sockets = await io.in('dashboard').fetchSockets();
  return sockets.length;
};

module.exports = {
  initializeSocket,
  emitNewAlert,
  emitAlertUpdate,
  emitLocationUpdate,
  getIO,
  getDashboardClientCount,
};
