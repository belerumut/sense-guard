/**
 * ============================================================
 * Anomali Tespit Servisi (services/anomalyDetector.js)
 * ============================================================
 *
 * Sensör verilerinden düşme ve anomali tespiti yapar.
 *
 * Düşme Tespiti — 3 Fazlı Algoritma:
 * ───────────────────────────────────
 * 1. Serbest Düşüş (Weightlessness): SV < 0.4g
 * 2. Darbe (Impact):                 SV > 2.0g (1 sn içinde)
 * 3. Hareketsizlik (Post-fall):      Varyans < 0.1g (5 sn boyunca)
 *
 * SV (Signal Vector Magnitude) = √(x² + y² + z²)
 *
 * Sliding Window Tekniği:
 * ───────────────────────
 * Her yeni veri paketi geldiğinde, son N veri noktası üzerinden
 * 3 fazın sıralı olarak gerçekleşip gerçekleşmediği kontrol edilir.
 *
 * Referans:
 * Teknik Doküman → Bölüm 6.1 (Düşme Tespiti Algoritması)
 */

const { SensorData, User, Alert } = require('../models');
const { emitNewAlert } = require('./socketService');
const logger = require('../utils/logger');
const smsService = require('./smsService');

// ─── Konfigürasyon (Eşik Değerleri) ───
const CONFIG = {
  // Düşme Tespiti Eşikleri
  FREEFALL_THRESHOLD: 0.4,       // g — bunun altı serbest düşüş
  IMPACT_THRESHOLD: 2.0,         // g — bunun üstü darbe
  POST_FALL_VARIANCE: 0.1,       // g — bunun altı hareketsizlik
  
  // Zaman Pencereleri (ms)
  FREEFALL_WINDOW: 500,          // Serbest düşüş süresi (maks 500ms)
  IMPACT_WINDOW: 1000,           // Darbe bekleme süresi (serbest düşüşten sonra 1sn)
  POST_FALL_WINDOW: 5000,        // Hareketsizlik gözlem süresi (5sn)
  
  // Genel Ayarlar
  MIN_READINGS_FOR_ANALYSIS: 10, // Analiz için minimum veri sayısı
  CONFIDENCE_BOOST_GYRO: 10,     // Jiroskop doğrulama bonusu (%)
};

/**
 * İvmeölçer verisinden magnitude (SV) hesaplar
 * SV = √(x² + y² + z²)
 *
 * @param {Object} accel - { x, y, z } ivmeölçer değerleri
 * @returns {number} Signal Vector Magnitude
 */
const calculateMagnitude = (accel) => {
  if (!accel || typeof accel.x !== 'number') return null;
  return Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
};

/**
 * Veri dizisinin varyansını hesaplar
 * Düşük varyans = hareketsizlik
 *
 * @param {number[]} values - Sayısal dizi
 * @returns {number} Varyans
 */
const calculateVariance = (values) => {
  if (!values || values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
};

/**
 * Batch sensör verisinde düşme tespiti yapar
 *
 * Algoritma:
 * 1. Tüm veri noktaları için magnitude hesapla
 * 2. Serbest düşüş fazını ara (SV < 0.4g)
 * 3. Serbest düşüşün ardından darbe fazını ara (SV > 2.0g)
 * 4. Darbenin ardından hareketsizlik fazını ara (varyans < 0.1g)
 * 5. 3 faz da tespit edildiyse → FALL_DETECTED
 *
 * @param {Array} readings - Sensör veri dizisi (timestamp sıralı)
 * @returns {Object|null} Tespit sonucu veya null
 */
const detectFall = (readings) => {
  if (!readings || readings.length < CONFIG.MIN_READINGS_FOR_ANALYSIS) {
    return null;
  }

  // ─── Magnitude değerlerini hesapla ───
  const dataPoints = readings.map((r) => ({
    timestamp: new Date(r.timestamp).getTime(),
    magnitude: r.accelerometer?.magnitude || calculateMagnitude(r.accelerometer),
    gyro: r.gyroscope || { x: 0, y: 0, z: 0 },
    id: r._id,
  })).filter((d) => d.magnitude !== null);

  if (dataPoints.length < CONFIG.MIN_READINGS_FOR_ANALYSIS) {
    return null;
  }

  // ─── FAZ 1: Serbest Düşüş Ara ───
  for (let i = 0; i < dataPoints.length; i++) {
    const point = dataPoints[i];

    // Serbest düşüş eşiğinin altında mı?
    if (point.magnitude >= CONFIG.FREEFALL_THRESHOLD) continue;

    const freefallStart = point.timestamp;
    let freefallEnd = freefallStart;

    // Serbest düşüş süresini hesapla (ardışık düşük-g okumalar)
    let j = i + 1;
    while (j < dataPoints.length) {
      if (dataPoints[j].magnitude < CONFIG.FREEFALL_THRESHOLD) {
        freefallEnd = dataPoints[j].timestamp;
        j++;
      } else {
        break;
      }
    }

    const freefallDuration = freefallEnd - freefallStart;

    // Serbest düşüş çok uzun sürüyorsa sensör hatası olabilir (>2sn)
    if (freefallDuration > 2000) continue;

    // ─── FAZ 2: Darbe Ara (serbest düşüşten sonra IMPACT_WINDOW içinde) ───
    let impactDetected = false;
    let impactForce = 0;
    let impactIndex = -1;

    for (let k = j; k < dataPoints.length; k++) {
      const timeSinceFreefallEnd = dataPoints[k].timestamp - freefallEnd;

      // Zaman penceresi dışına çıktıysa darbe yok
      if (timeSinceFreefallEnd > CONFIG.IMPACT_WINDOW) break;

      if (dataPoints[k].magnitude > CONFIG.IMPACT_THRESHOLD) {
        impactDetected = true;
        impactForce = dataPoints[k].magnitude;
        impactIndex = k;
        break;
      }
    }

    if (!impactDetected) continue;

    // ─── FAZ 3: Hareketsizlik Ara (darbeden sonra POST_FALL_WINDOW boyunca) ───
    const postFallReadings = [];
    for (let m = impactIndex + 1; m < dataPoints.length; m++) {
      const timeSinceImpact = dataPoints[m].timestamp - dataPoints[impactIndex].timestamp;

      if (timeSinceImpact > CONFIG.POST_FALL_WINDOW) break;

      postFallReadings.push(dataPoints[m].magnitude);
    }

    // Yeterli hareketsizlik verisi var mı?
    if (postFallReadings.length < 3) continue;

    const postFallVariance = calculateVariance(postFallReadings);

    if (postFallVariance < CONFIG.POST_FALL_VARIANCE) {
      // ─── 3 FAZ TAMAMLANDI → DÜŞME TESPİT EDİLDİ ───

      // Güven oranı hesapla
      let confidence = 70; // Temel güven

      // Serbest düşüş süresi makul aralıkta mı? (+10%)
      if (freefallDuration >= 100 && freefallDuration <= 1000) {
        confidence += 10;
      }

      // Darbe kuvveti yüksek mi? (+10%)
      if (impactForce > 3.0) {
        confidence += 10;
      }

      // Jiroskop rotasyonu algılanmış mı? (+10%)
      const impactGyro = dataPoints[impactIndex]?.gyro;
      if (impactGyro) {
        const gyroMag = Math.sqrt(
          (impactGyro.x || 0) ** 2 +
          (impactGyro.y || 0) ** 2 +
          (impactGyro.z || 0) ** 2
        );
        if (gyroMag > 1.0) {
          confidence += CONFIG.CONFIDENCE_BOOST_GYRO;
        }
      }

      confidence = Math.min(confidence, 100);

      // İlgili sensör verisi ID'lerini topla
      const relatedIds = dataPoints
        .slice(i, Math.min(impactIndex + postFallReadings.length + 1, dataPoints.length))
        .map((d) => d.id)
        .filter(Boolean);

      return {
        detected: true,
        type: 'FALL_DETECTED',
        severity: confidence >= 85 ? 'critical' : confidence >= 70 ? 'high' : 'medium',
        confidence,
        details: {
          freefallDuration,
          freefallMinG: point.magnitude,
          impactForce,
          postFallVariance,
          postFallReadingCount: postFallReadings.length,
        },
        relatedSensorDataIds: relatedIds,
        thresholds: {
          freefallThreshold: CONFIG.FREEFALL_THRESHOLD,
          impactThreshold: CONFIG.IMPACT_THRESHOLD,
          postFallVarianceThreshold: CONFIG.POST_FALL_VARIANCE,
        },
      };
    }
  }

  return null; // Düşme tespit edilmedi
};

/**
 * Batch sensör verisini analiz eder ve gerekirse alarm oluşturur
 *
 * @param {string} userId - Kullanıcı ID
 * @param {Array} readings - Sensör veri dizisi
 * @returns {Object|null} Oluşturulan alarm veya null
 */
const analyzeBatch = async (userId, readings) => {
  try {
    // ─── Düşme Tespiti ───
    const fallResult = detectFall(readings);

    if (fallResult && fallResult.detected) {
      // Kullanıcı bilgilerini al (alarm mesajı için)
      const user = await User.findById(userId).select('firstName lastName lastKnownLocation emergencyContact');

      if (!user) {
        logger.warn(`Anomali tespit: Kullanıcı bulunamadı (${userId})`);
        return null;
      }

      // Son konum bilgisini al
      const lastReading = readings[readings.length - 1];
      const location = lastReading?.location || {};

      // ─── Alarm Oluştur ───
      const alert = await Alert.create({
        patientId: userId,
        alertType: 'FALL_DETECTED',
        severity: fallResult.severity,
        status: 'active',
        message: `⚠️ ${user.firstName} ${user.lastName} için düşme tespit edildi! ` +
          `Darbe kuvveti: ${fallResult.details.impactForce.toFixed(1)}g, ` +
          `Güven oranı: %${fallResult.confidence}`,
        analysisDetails: {
          signalVectorMagnitude: fallResult.details.impactForce,
          freefallDuration: fallResult.details.freefallDuration,
          impactForce: fallResult.details.impactForce,
          confidence: fallResult.confidence,
          thresholds: fallResult.thresholds,
        },
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        relatedSensorData: fallResult.relatedSensorDataIds,
      });

      // ─── Socket.io ile Gerçek Zamanlı Bildirim ───
      emitNewAlert({
        alertId: alert._id,
        alertType: 'FALL_DETECTED',
        severity: fallResult.severity,
        message: alert.message,
        patient: {
          id: userId,
          name: `${user.firstName} ${user.lastName}`,
        },
        location: alert.location,
        confidence: fallResult.confidence,
      });

      logger.warn(
        `🚨 DÜŞME TESPİT EDİLDİ: ${user.firstName} ${user.lastName} | ` +
        `Darbe: ${fallResult.details.impactForce.toFixed(1)}g | ` +
        `Güven: %${fallResult.confidence}`
      );

      // Hasta yakınına SMS uyarısı gönder
      smsService.sendAlarmSms(user, alert).catch((err) => {
        logger.error(`SMS gönderim hatası (FALL_DETECTED): ${err.message}`);
      });

      // ─── Analiz edilen verileri işaretle ───
      if (fallResult.relatedSensorDataIds.length > 0) {
        await SensorData.updateMany(
          { _id: { $in: fallResult.relatedSensorDataIds } },
          {
            analyzed: true,
            'anomaly.detected': true,
            'anomaly.type': 'impact',
            'anomaly.confidence': fallResult.confidence,
          }
        );
      }

      return alert;
    }

    return null;
  } catch (error) {
    logger.error(`Anomali tespit hatası: ${error.message}`);
    return null;
  }
};

module.exports = {
  detectFall,
  analyzeBatch,
  calculateMagnitude,
  calculateVariance,
  CONFIG,
};
