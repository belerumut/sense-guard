/**
 * ============================================================
 * Hareketsizlik Kontrol Servisi (services/inactivityChecker.js)
 * ============================================================
 *
 * Düzenli aralıklarla hastaların sensör verilerini kontrol ederek
 * uzun süreli hareketsizlik, GPS hareketsizliği ve olağandışı
 * gece aktivitesi tespiti yapar.
 *
 * Alarm Türleri:
 * ──────────────
 * 1. INACTIVITY_LONG  → Son 2 saatte hareket varyansı eşik altında
 * 2. GPS_STAGNANT     → Son 3 saatte GPS koordinatları 10m değişmemiş
 * 3. NIGHT_ACTIVITY   → 02:00-05:00 arası olağandışı hareketlenme
 *
 * Referans:
 * Teknik Doküman → Bölüm 6.2 (Uzun Süreli Hareketsizlik)
 */

const { Alert, SensorData, User, SystemConfig } = require('../models');
const { emitNewAlert } = require('./socketService');
const logger = require('../utils/logger');
const smsService = require('./smsService');

// ─── Konfigürasyon ───
const CONFIG = {
  // Hareketsizlik tespiti
  INACTIVITY_CHECK_HOURS: 0.0125,          // Son 2 saatteki verileri kontrol et
  INACTIVITY_VARIANCE_THRESHOLD: 0.05, // g — hareket varyansı eşiği
  MIN_DATA_POINTS_FOR_CHECK: 20,       // Kontrol için minimum veri sayısı

  // GPS hareketsizliği
  GPS_CHECK_HOURS: 3,                  // Son 3 saatteki GPS verilerini kontrol et
  GPS_STAGNANT_DISTANCE_M: 10,         // 10 metre — minimum beklenen hareket

  // Gece aktivitesi
  NIGHT_START_HOUR: 2,                 // 02:00
  NIGHT_END_HOUR: 5,                   // 05:00
  NIGHT_ACTIVITY_VARIANCE_THRESHOLD: 0.5, // g — gece hareket eşiği (bunun üstü anormal)
  NIGHT_MIN_READINGS: 10,              // Gece kontrolü için minimum veri

  // Gündüz filtresi (gece uykusunu elimine etmek)
  DAYTIME_START_HOUR: 0,              // 08:00
  DAYTIME_END_HOUR: 24,              // 22:00

  // Alarm tekrar engelleme
  COOLDOWN_MINUTES: 0,               // Aynı türde alarm arası minimum süre (dk)
};

/**
 * İki GPS koordinatı arasındaki mesafeyi metre cinsinden hesaplar
 * Haversine formülü kullanılır
 *
 * @param {number} lat1 - Enlem 1
 * @param {number} lon1 - Boylam 1
 * @param {number} lat2 - Enlem 2
 * @param {number} lon2 - Boylam 2
 * @returns {number} Mesafe (metre)
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Dünya yarıçapı (metre)
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Sayısal dizinin varyansını hesaplar
 *
 * @param {number[]} arr - Değerler
 * @returns {number} Varyans
 */
const variance = (arr) => {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
};

/**
 * Milisaniye cinsinden zaman farkını Türkçe okunabilir formata dönüştürür.
 * Örn: 90000 ms -> "1 dakika 30 saniye"
 * 
 * @param {number} ms - Milisaniye
 * @returns {string} Okunabilir süre metni
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return remHours > 0 ? `${days} gün ${remHours} saat` : `${days} gün`;
  }
  if (hours > 0) {
    const remMinutes = minutes % 60;
    return remMinutes > 0 ? `${hours} saat ${remMinutes} dakika` : `${hours} saat`;
  }
  if (minutes > 0) {
    const remSeconds = seconds % 60;
    return remSeconds > 0 ? `${minutes} dakika ${remSeconds} saniye` : `${minutes} dakika`;
  }
  return `${seconds} saniye`;
};

/**
 * Belirli bir alarm türü için son COOLDOWN_MINUTES dakika içinde
 * alarm üretilmiş mi kontrol eder (spam önleme)
 *
 * @param {string} patientId - Hasta ID
 * @param {string} alertType - Alarm türü
 * @returns {boolean} true = cooldown aktif, alarm üretme
 */
const isAlertOnCooldown = async (patientId, alertType) => {
  const cooldownStart = new Date();
  cooldownStart.setMinutes(cooldownStart.getMinutes() - CONFIG.COOLDOWN_MINUTES);

  const recentAlert = await Alert.findOne({
    patientId,
    alertType,
    createdAt: { $gte: cooldownStart },
  });

  return !!recentAlert;
};

/**
 * Alarm oluşturur ve Socket.io ile bildirim gönderir
 *
 * @param {Object} params - Alarm parametreleri
 */
const createAlert = async ({ patientId, alertType, severity, message, details, location }) => {
  try {
    // Cooldown kontrolü
    if (await isAlertOnCooldown(patientId, alertType)) {
      logger.debug(
        `⏳ Alarm cooldown aktif: ${alertType} | Hasta: ${patientId}`
      );
      return null;
    }

    const user = await User.findById(patientId).select('firstName lastName emergencyContact');
    if (!user) return null;

    const alert = await Alert.create({
      patientId,
      alertType,
      severity,
      status: 'active',
      message,
      analysisDetails: details,
      location,
    });

    // Socket.io bildirimi
    emitNewAlert({
      alertId: alert._id,
      alertType,
      severity,
      message,
      patient: {
        id: patientId,
        name: `${user.firstName} ${user.lastName}`,
      },
      location,
    });

    logger.warn(`🚨 ${alertType}: ${user.firstName} ${user.lastName} | ${message}`);

    // Hasta yakınına SMS uyarısı gönder
    smsService.sendAlarmSms(user, alert).catch((err) => {
      logger.error(`SMS gönderim hatası (${alertType}): ${err.message}`);
    });
    return alert;
  } catch (error) {
    logger.error(`Alarm oluşturma hatası (${alertType}): ${error.message}`);
    return null;
  }
};

/**
 * Tek bir hasta için hareketsizlik kontrolü yapar
 *
 * @param {Object} patient - Hasta kullanıcı nesnesi
 */
const checkPatientInactivity = async (patient, dynamicConfig) => {
  const now = new Date();
  const currentHour = now.getHours();

  const inactivityCheckHours = dynamicConfig?.inactivityCheckHours !== undefined ? dynamicConfig.inactivityCheckHours : CONFIG.INACTIVITY_CHECK_HOURS;
  const gpsCheckHours = dynamicConfig?.gpsCheckHours !== undefined ? dynamicConfig.gpsCheckHours : CONFIG.GPS_CHECK_HOURS;

  // ─── Gece saatlerinde hareketsizlik kontrolü yapma ───
  // (Uyku saatlerinde hareketsizlik normal)
  // Geliştirme/test ortamında 24 saat aktif olsun, canlı ortamda gece saatlerinde hareketsizlik kontrolü yapılmasın
  const isDaytime =
    process.env.NODE_ENV === 'development' ||
    (currentHour >= CONFIG.DAYTIME_START_HOUR &&
      currentHour < CONFIG.DAYTIME_END_HOUR);

  // ─── 1. UZUN SÜRELİ HAREKETSİZLİK (INACTIVITY_LONG) ───
  if (isDaytime) {
    const hoursAgo = new Date();
    hoursAgo.setTime(hoursAgo.getTime() - Math.round(inactivityCheckHours * 3600 * 1000));

    const recentData = await SensorData.find({
      userId: patient._id,
      timestamp: { $gte: hoursAgo },
    })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean();

    if (recentData.length >= CONFIG.MIN_DATA_POINTS_FOR_CHECK) {
      // Magnitude değerlerinin varyansını hesapla
      const magnitudes = recentData
        .map((d) => d.accelerometer?.magnitude)
        .filter((m) => m != null);

      if (magnitudes.length > 0) {
        const motionVariance = variance(magnitudes);

        if (motionVariance < CONFIG.INACTIVITY_VARIANCE_THRESHOLD) {
          const durationText = formatDuration(inactivityCheckHours * 3600 * 1000);
          await createAlert({
            patientId: patient._id,
            alertType: 'INACTIVITY_LONG',
            severity: 'high',
            message:
              `${patient.firstName} ${patient.lastName} son ${durationText} süredir ` +
              `hareketsiz. Hareket varyansı: ${motionVariance.toFixed(4)}g ` +
              `(eşik: ${CONFIG.INACTIVITY_VARIANCE_THRESHOLD}g)`,
            details: {
              inactivityDuration: inactivityCheckHours * 60,
              confidence: Math.min(
                95,
                Math.round((1 - motionVariance / CONFIG.INACTIVITY_VARIANCE_THRESHOLD) * 100)
              ),
              thresholds: new Map([
                ['varianceThreshold', CONFIG.INACTIVITY_VARIANCE_THRESHOLD],
                ['checkPeriodHours', inactivityCheckHours],
              ]),
            },
          });
        }
      }
    } else if (recentData.length === 0 && patient.lastDataReceivedAt) {
      // Hiç veri gelmiyorsa — cihaz kapalı veya ağ sorunu
      const timeDiffMs = now - new Date(patient.lastDataReceivedAt);
      if (timeDiffMs >= inactivityCheckHours * 3600 * 1000) {
        const durationText = formatDuration(timeDiffMs);
        await createAlert({
          patientId: patient._id,
          alertType: 'INACTIVITY_LONG',
          severity: 'medium',
          message:
            `${patient.firstName} ${patient.lastName}'den son ${durationText} süredir ` +
            `veri alınamıyor. Cihaz kapalı veya ağ bağlantısı kesilmiş olabilir.`,
          details: {
            inactivityDuration: Math.round((timeDiffMs) / (60 * 1000)),
            confidence: 50,
          },
        });
      }
    }
  }

  // ─── 2. GPS HAREKETSİZLİĞİ (GPS_STAGNANT) ───
  if (isDaytime) {
    const gpsHoursAgo = new Date();
    gpsHoursAgo.setTime(gpsHoursAgo.getTime() - Math.round(gpsCheckHours * 3600 * 1000));

    const gpsData = await SensorData.find({
      userId: patient._id,
      timestamp: { $gte: gpsHoursAgo },
      'location.latitude': { $exists: true, $ne: null },
      'location.longitude': { $exists: true, $ne: null },
    })
      .sort({ timestamp: 1 })
      .limit(200)
      .lean();

    if (gpsData.length >= 2) {
      const firstPoint = gpsData[0].location;
      const lastPoint = gpsData[gpsData.length - 1].location;

      // Tüm GPS noktaları arasındaki maksimum mesafeyi hesapla
      let maxDistance = 0;
      for (const point of gpsData) {
        const dist = haversineDistance(
          firstPoint.latitude,
          firstPoint.longitude,
          point.location.latitude,
          point.location.longitude
        );
        maxDistance = Math.max(maxDistance, dist);
      }

      if (maxDistance < CONFIG.GPS_STAGNANT_DISTANCE_M) {
        const durationText = formatDuration(gpsCheckHours * 3600 * 1000);
        await createAlert({
          patientId: patient._id,
          alertType: 'GPS_STAGNANT',
          severity: 'medium',
          message:
            `${patient.firstName} ${patient.lastName} son ${durationText} süredir ` +
            `aynı konumda. Maksimum yer değişimi: ${maxDistance.toFixed(1)}m ` +
            `(eşik: ${CONFIG.GPS_STAGNANT_DISTANCE_M}m)`,
          details: {
            confidence: Math.min(
              90,
              Math.round((1 - maxDistance / CONFIG.GPS_STAGNANT_DISTANCE_M) * 100)
            ),
            thresholds: new Map([
              ['distanceThreshold', CONFIG.GPS_STAGNANT_DISTANCE_M],
              ['checkPeriodHours', gpsCheckHours],
            ]),
          },
          location: {
            latitude: lastPoint.latitude,
            longitude: lastPoint.longitude,
          },
        });
      }
    }
  }

  // ─── 3. OLAĞANDIŞI GECE AKTİVİTESİ (NIGHT_ACTIVITY) ───
  const isNightTime =
    currentHour >= CONFIG.NIGHT_START_HOUR &&
    currentHour < CONFIG.NIGHT_END_HOUR;

  if (isNightTime) {
    const nightStart = new Date();
    nightStart.setHours(CONFIG.NIGHT_START_HOUR, 0, 0, 0);

    const nightData = await SensorData.find({
      userId: patient._id,
      timestamp: { $gte: nightStart },
    })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();

    if (nightData.length >= CONFIG.NIGHT_MIN_READINGS) {
      const magnitudes = nightData
        .map((d) => d.accelerometer?.magnitude)
        .filter((m) => m != null);

      const nightVariance = variance(magnitudes);

      if (nightVariance > CONFIG.NIGHT_ACTIVITY_VARIANCE_THRESHOLD) {
        await createAlert({
          patientId: patient._id,
          alertType: 'NIGHT_ACTIVITY',
          severity: 'low',
          message:
            `${patient.firstName} ${patient.lastName} gece saatlerinde (02:00-05:00) ` +
            `olağandışı hareketlenme gösteriyor. Hareket varyansı: ${nightVariance.toFixed(4)}g`,
          details: {
            confidence: Math.min(
              80,
              Math.round(
                (nightVariance / CONFIG.NIGHT_ACTIVITY_VARIANCE_THRESHOLD) * 50
              )
            ),
            thresholds: new Map([
              ['nightVarianceThreshold', CONFIG.NIGHT_ACTIVITY_VARIANCE_THRESHOLD],
            ]),
          },
        });
      }
    }
  }
};

/**
 * Tüm aktif hastaları kontrol eder
 * Cron job tarafından çağrılır
 */
const checkAllPatients = async () => {
  try {
    const configs = await SystemConfig.find({
      key: { $in: ['INACTIVITY_CHECK_HOURS', 'GPS_CHECK_HOURS'] }
    });

    const dynamicConfig = {
      inactivityCheckHours: CONFIG.INACTIVITY_CHECK_HOURS,
      gpsCheckHours: CONFIG.GPS_CHECK_HOURS
    };

    configs.forEach(c => {
      if (c.key === 'INACTIVITY_CHECK_HOURS') dynamicConfig.inactivityCheckHours = parseFloat(c.value);
      if (c.key === 'GPS_CHECK_HOURS') dynamicConfig.gpsCheckHours = parseFloat(c.value);
    });

    const patients = await User.find({
      role: 'patient',
      isActive: true,
    }).select('_id firstName lastName lastDataReceivedAt');

    logger.info(`🔍 Hareketsizlik kontrolü başladı: ${patients.length} hasta taranıyor`);

    for (const patient of patients) {
      try {
        await checkPatientInactivity(patient, dynamicConfig);
      } catch (error) {
        logger.error(
          `Hasta kontrolü hatası (${patient._id}): ${error.message}`
        );
      }
    }

    logger.info(`🔍 Hareketsizlik kontrolü tamamlandı`);
  } catch (error) {
    logger.error(`Toplu hareketsizlik kontrolü hatası: ${error.message}`);
  }
};

module.exports = {
  checkAllPatients,
  checkPatientInactivity,
  haversineDistance,
  CONFIG,
};
