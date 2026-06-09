/**
 * ============================================================
 * Cron Job Servisi (services/cronJobs.js)
 * ============================================================
 *
 * Periyodik arka plan görevlerini yönetir.
 *
 * Görevler:
 * ─────────
 * 1. Hareketsizlik Kontrolü → Her 5 dakikada bir
 *    Tüm aktif hastaların sensör verilerini tarayarak
 *    uzun süreli hareketsizlik ve GPS durgunluğu algılar.
 *
 * Referans:
 * Teknik Doküman → Bölüm 6.2
 * "Düzenli aralıklarla (örneğin her 5 dakikada bir) bir cron job
 *  veya zamanlayıcı, hastaya ait sensör verilerini kontrol eder"
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const { checkAllPatients } = require('./inactivityChecker');

let scheduledTasks = [];

/**
 * Tüm cron job'ları başlatır
 * server.js tarafından sunucu başlangıcında çağrılır
 */
const startCronJobs = () => {
  logger.info('⏰ Cron job servisi başlatılıyor...');

  // ─── 1. Hareketsizlik Kontrolü ───
  // Cron ifadesi: "*/15 * * * *" → her 15. dakikada çalışır
  const inactivityCheck = cron.schedule(
    '*/15 * * * *',
    async () => {
      logger.info('⏰ [Cron] Hareketsizlik kontrol görevi başladı');
      const startTime = Date.now();

      try {
        await checkAllPatients();
        const elapsed = Date.now() - startTime;
        logger.info(`⏰ [Cron] Hareketsizlik kontrolü tamamlandı (${elapsed}ms)`);
      } catch (error) {
        logger.error(`⏰ [Cron] Hareketsizlik kontrol hatası: ${error.message}`);
      }
    },
    {
      scheduled: true,
      timezone: 'Europe/Istanbul', // Türkiye saat dilimi
    }
  );

  scheduledTasks.push({
    name: 'inactivity-check',
    task: inactivityCheck,
    schedule: '*/1 * * * *',
    description: 'Hareketsizlik ve GPS durgunluğu kontrolü',
  });

  logger.info(`⏰ ${scheduledTasks.length} cron job başlatıldı:`);
  scheduledTasks.forEach((t) => {
    logger.info(`   📋 ${t.name}: ${t.schedule} — ${t.description}`);
  });
};

/**
 * Tüm cron job'ları durdurur
 * Graceful shutdown sırasında çağrılır
 */
const stopCronJobs = () => {
  logger.info('⏰ Cron job\'lar durduruluyor...');
  scheduledTasks.forEach((t) => {
    t.task.stop();
    logger.info(`   ⏹️ ${t.name} durduruldu`);
  });
  scheduledTasks = [];
};

/**
 * Aktif cron job bilgilerini döndürür
 * Health check endpoint'i için kullanılabilir
 */
const getCronStatus = () => {
  return scheduledTasks.map((t) => ({
    name: t.name,
    schedule: t.schedule,
    description: t.description,
    running: t.task.options?.scheduled !== false,
  }));
};

module.exports = {
  startCronJobs,
  stopCronJobs,
  getCronStatus,
};
