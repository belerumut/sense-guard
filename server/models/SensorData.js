/**
 * ============================================================
 * Sensör Verisi Modeli (models/SensorData.js)
 * ============================================================
 *
 * Akıllı telefonlardan gelen sensör verilerini depolar.
 * MongoDB Time-Series koleksiyonu olarak optimize edilmiştir.
 *
 * Veri Kaynakları:
 * 1. İvmeölçer (x, y, z) → Düşme tespiti için kritik
 * 2. Jiroskop (x, y, z)  → Dönüş hareketi tespiti
 * 3. GPS Koordinatları    → Hareketsizlik tespiti
 */

const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Kullanıcı kimliği zorunludur'],
    },

    // Cihaz tarafında ölçümün yapıldığı an
    timestamp: {
      type: Date,
      required: [true, 'Zaman damgası zorunludur'],
      index: true,
    },

    // İvmeölçer (g-kuvveti, 1g ≈ 9.81 m/s²)
    accelerometer: {
      x: { type: Number, required: [true, 'İvmeölçer X zorunludur'] },
      y: { type: Number, required: [true, 'İvmeölçer Y zorunludur'] },
      z: { type: Number, required: [true, 'İvmeölçer Z zorunludur'] },
      // SV = √(x² + y² + z²) — analiz servisinde hesaplanır
      magnitude: { type: Number },
    },

    // Jiroskop (rad/s)
    gyroscope: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      z: { type: Number, default: 0 },
    },

    // GPS konumu (opsiyonel, seyrek güncellenir)
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number },
      altitude: { type: Number },
    },

    // Aynı gönderime ait verileri gruplar
    batchId: { type: String, index: true },

    // Anomali tespit servisi bu veriyi işledi mi?
    analyzed: { type: Boolean, default: false },

    // Anomali tespit sonucu
    anomaly: {
      detected: { type: Boolean, default: false },
      type: {
        type: String,
        enum: ['none', 'freefall', 'impact', 'inactivity'],
        default: 'none',
      },
      confidence: { type: Number, min: 0, max: 100 },
    },
  },
  {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'userId',
      granularity: 'seconds',
    },
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 gün TTL
    timestamps: { createdAt: 'serverReceivedAt', updatedAt: false },
  }
);

// ─── Index'ler ───
sensorDataSchema.index({ userId: 1, timestamp: -1 });
sensorDataSchema.index({ analyzed: 1, timestamp: -1 });
sensorDataSchema.index({ 'anomaly.detected': 1, timestamp: -1 });

// ─── Statik Metotlar ───

// Batch kayıt (ordered:false → hata olsa bile diğerleri yazılır)
sensorDataSchema.statics.insertBatch = async function (dataArray) {
  return this.insertMany(dataArray, { ordered: false });
};

// Kullanıcının son verilerini getir
sensorDataSchema.statics.getLatestByUser = async function (userId, limit = 100) {
  return this.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean();
};

// Zaman aralığına göre veri getir
sensorDataSchema.statics.getByTimeRange = async function (userId, start, end) {
  return this.find({
    userId,
    timestamp: { $gte: start, $lte: end },
  }).sort({ timestamp: 1 }).lean();
};

// Analiz edilmemiş verileri getir
sensorDataSchema.statics.getUnanalyzed = async function (limit = 500) {
  return this.find({ analyzed: false }).sort({ timestamp: 1 }).limit(limit).lean();
};

const SensorData = mongoose.model('SensorData', sensorDataSchema);

module.exports = SensorData;
