/**
 * ============================================================
 * Sensör Veri Controller'ı (controllers/sensorController.js)
 * ============================================================
 *
 * Mobil cihazlardan gelen yüksek frekanslı sensör verilerini
 * karşılayan ve işleyen endpoint'leri içerir.
 *
 * Endpoint'ler:
 * ─────────────
 * POST /api/sensor/ingest → Batch (yığın) sensör verisi alımı
 * GET  /api/sensor/latest/:userId → Kullanıcının son verileri
 * GET  /api/sensor/range/:userId  → Zaman aralığına göre veri
 *
 * Batch Yapısı:
 * ─────────────
 * Mobil cihaz saniyede ~10 veri noktası toplar.
 * Bunları her 5-10 saniyede bir 50-100'lük yığınlar halinde gönderir.
 * Bu yaklaşım:
 * - Ağ trafiğini azaltır (tek istek vs 100 ayrı istek)
 * - Pil tüketimini düşürür (radio wake-up sayısını azaltır)
 * - Sunucu yükünü hafifletir (insertMany tek DB operasyonu)
 */

const { SensorData, User } = require('../models');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { analyzeBatch } = require('../services/anomalyDetector');

/**
 * @desc    Batch sensör verisi alımı
 * @route   POST /api/sensor/ingest
 * @access  Private (patient rolü)
 *
 * Beklenen Body Formatı:
 * {
 *   "readings": [
 *     {
 *       "timestamp": "2026-05-04T15:00:00.000Z",
 *       "accelerometer": { "x": 0.1, "y": 0.2, "z": 9.8 },
 *       "gyroscope": { "x": 0.01, "y": -0.02, "z": 0.0 },
 *       "location": { "latitude": 41.0082, "longitude": 28.9784, "accuracy": 10 }
 *     },
 *     ...
 *   ]
 * }
 *
 * İş Akışı:
 * 1. readings dizisini doğrula
 * 2. Her okumaya userId ve batchId ekle
 * 3. Her okumaya magnitude (SV) hesapla
 * 4. insertMany ile toplu kaydet (ordered: false)
 * 5. Kullanıcının lastDataReceivedAt alanını güncelle
 * 6. Başarılı kayıt sayısını döndür
 */
const ingestBatch = async (req, res, next) => {
  try {
    const { readings } = req.body;
    const userId = req.user._id;

    // ─── Doğrulama: readings dizisi var mı? ───
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      return apiResponse.error(
        res,
        'Geçerli bir "readings" dizisi gönderilmelidir',
        400
      );
    }

    // ─── Batch boyutu limiti ───
    const MAX_BATCH_SIZE = 500;
    if (readings.length > MAX_BATCH_SIZE) {
      return apiResponse.error(
        res,
        `Tek seferde en fazla ${MAX_BATCH_SIZE} veri noktası gönderilebilir. Gönderilen: ${readings.length}`,
        400
      );
    }

    // ─── Unique Batch ID oluştur ───
    const batchId = uuidv4();

    // ─── Veri noktalarını hazırla ───
    const preparedReadings = readings.map((reading) => {
      // Magnitude (SV) hesapla: √(x² + y² + z²)
      let magnitude = null;
      if (
        reading.accelerometer &&
        typeof reading.accelerometer.x === 'number' &&
        typeof reading.accelerometer.y === 'number' &&
        typeof reading.accelerometer.z === 'number'
      ) {
        const { x, y, z } = reading.accelerometer;
        magnitude = Math.sqrt(x * x + y * y + z * z);
      }

      return {
        userId,
        timestamp: reading.timestamp || new Date(),
        accelerometer: {
          x: reading.accelerometer?.x,
          y: reading.accelerometer?.y,
          z: reading.accelerometer?.z,
          magnitude,
        },
        gyroscope: {
          x: reading.gyroscope?.x || 0,
          y: reading.gyroscope?.y || 0,
          z: reading.gyroscope?.z || 0,
        },
        location: reading.location || undefined,
        batchId,
        analyzed: false,
      };
    });

    // ─── Toplu Kayıt ───
    // ordered: false → Bir kayıt hata verse bile diğerleri yazılır
    const result = await SensorData.insertBatch(preparedReadings);

    // ─── En Son Konum Bilgisini Bul ───
    const locationReadings = readings.filter(
      (r) => r.location && typeof r.location.latitude === 'number' && typeof r.location.longitude === 'number'
    );
    let lastLocation = null;
    if (locationReadings.length > 0) {
      lastLocation = locationReadings[locationReadings.length - 1].location;
    }

    // ─── Kullanıcının Son Veri Zamanını ve Konumunu Güncelle ───
    const userUpdate = {
      lastDataReceivedAt: new Date(),
    };
    if (lastLocation) {
      userUpdate.lastKnownLocation = {
        type: 'Point',
        coordinates: [lastLocation.longitude, lastLocation.latitude], // GeoJSON: [lng, lat]
      };
    }
    await User.findByIdAndUpdate(userId, userUpdate);

    // ─── Canlı Konum Güncellemesini Socket ile Gönder ───
    if (lastLocation) {
      const { emitLocationUpdate } = require('../services/socketService');
      emitLocationUpdate(userId, {
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        accuracy: lastLocation.accuracy,
      });
    }

    logger.info(
      `📡 Sensör verisi alındı: ${result.length} kayıt | Kullanıcı: ${req.user.email} | Batch: ${batchId}`
    );

    // ─── Anomali Tespiti Tetikle (Asenkron) ───
    // Yanıtı bekletmemek için arka planda çalıştır
    analyzeBatch(userId, preparedReadings).catch((err) => {
      logger.error(`Anomali analiz hatası (batch ${batchId}): ${err.message}`);
    });

    return apiResponse.success(
      res,
      'Sensör verileri başarıyla kaydedildi',
      {
        batchId,
        receivedCount: readings.length,
        savedCount: result.length,
      },
      201
    );
  } catch (error) {
    // insertMany kısmi başarı durumu (bazı kayıtlar yazılmış olabilir)
    if (error.name === 'MongoBulkWriteError' || error.name === 'BulkWriteError') {
      const successCount = error.insertedDocs?.length || error.result?.nInserted || 0;
      logger.warn(
        `📡 Kısmi batch kayıt: ${successCount} başarılı, bazı kayıtlar hatalı`
      );
      return apiResponse.success(
        res,
        'Sensör verileri kısmen kaydedildi. Bazı kayıtlarda doğrulama hatası oluştu',
        { savedCount: successCount },
        207 // Multi-Status
      );
    }
    next(error);
  }
};

/**
 * @desc    Kullanıcının son sensör verilerini getir
 * @route   GET /api/sensor/latest/:userId
 * @access  Private (admin, monitor, veya kendi verisi)
 */
const getLatestReadings = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 100;

    // ─── Yetki Kontrolü ───
    // Patient kendi verisini, admin/monitor herkesinkileri görebilir
    if (
      req.user.role === 'patient' &&
      req.user._id.toString() !== userId
    ) {
      return apiResponse.error(
        res,
        'Sadece kendi sensör verilerinizi görüntüleyebilirsiniz',
        403
      );
    }

    const readings = await SensorData.getLatestByUser(userId, Math.min(limit, 500));

    return apiResponse.success(
      res,
      `Son ${readings.length} sensör verisi`,
      { readings, count: readings.length }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Zaman aralığına göre sensör verisi getir
 * @route   GET /api/sensor/range/:userId?start=...&end=...
 * @access  Private (admin, monitor, veya kendi verisi)
 */
const getReadingsByRange = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { start, end } = req.query;

    // ─── Parametre Kontrolü ───
    if (!start || !end) {
      return apiResponse.error(
        res,
        '"start" ve "end" sorgu parametreleri zorunludur (ISO 8601 formatında)',
        400
      );
    }

    // ─── Yetki Kontrolü ───
    if (
      req.user.role === 'patient' &&
      req.user._id.toString() !== userId
    ) {
      return apiResponse.error(
        res,
        'Sadece kendi sensör verilerinizi görüntüleyebilirsiniz',
        403
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return apiResponse.error(
        res,
        'Geçersiz tarih formatı. ISO 8601 formatında gönderiniz (örn: 2026-05-04T00:00:00Z)',
        400
      );
    }

    const readings = await SensorData.getByTimeRange(userId, startDate, endDate);

    return apiResponse.success(
      res,
      `${readings.length} sensör verisi bulundu`,
      {
        readings,
        count: readings.length,
        range: { start: startDate, end: endDate },
      }
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  ingestBatch,
  getLatestReadings,
  getReadingsByRange,
};
