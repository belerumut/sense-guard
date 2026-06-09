/**
 * ============================================================
 * Alarm Modeli (models/Alert.js)
 * ============================================================
 *
 * Anomali tespit servisi bir düşme veya hareketsizlik algıladığında
 * bu model üzerinden alarm kaydı oluşturulur.
 *
 * Alarm Türleri:
 * ──────────────
 * - fall       → Düşme tespit edildi
 * - inactivity → Uzun süreli hareketsizlik
 *
 * Alarm Durumları:
 * ────────────────
 * active       → Yeni oluşmuş, henüz kimse müdahale etmedi
 * acknowledged → Bir monitor/admin alarmı gördü
 * resolved     → Alarm çözümlendi (yanlış alarm veya müdahale edildi)
 *
 * Risk Seviyeleri:
 * ────────────────
 * low      → Düşük şiddetli anomali
 * medium   → Orta şiddetli, izleme gerektirir
 * high     → Yüksek, acil müdahale önerisi
 * critical → Kritik, anında müdahale gerekli
 */

const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    // ── Hangi hastaya ait? ──
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Hasta kimliği zorunludur'],
    },

    // ── Alarm Türü ──
    alertType: {
      type: String,
      enum: {
        values: [
          'fall', 'inactivity',                                   // Eski değerler (backward compat)
          'FALL_DETECTED', 'INACTIVITY_LONG',                     // Teknik doküman standardı
          'NIGHT_ACTIVITY', 'GPS_STAGNANT',                       // Ek alarm türleri
        ],
        message: 'Geçersiz alarm türü. Kabul edilen: FALL_DETECTED, INACTIVITY_LONG, NIGHT_ACTIVITY, GPS_STAGNANT',
      },
      required: [true, 'Alarm türü zorunludur'],
    },

    // ── Risk Seviyesi ──
    severity: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'critical'],
        message: 'Geçersiz risk seviyesi',
      },
      required: [true, 'Risk seviyesi zorunludur'],
      default: 'medium',
    },

    // ── Alarm Durumu ──
    status: {
      type: String,
      enum: {
        values: ['active', 'acknowledged', 'resolved'],
        message: 'Geçersiz durum',
      },
      default: 'active',
    },

    // ── Alarm Detayları ──
    message: {
      type: String,
      required: [true, 'Alarm mesajı zorunludur'],
      maxlength: [500, 'Alarm mesajı en fazla 500 karakter olabilir'],
    },

    // Algoritmadan gelen detaylı analiz bilgisi
    analysisDetails: {
      // Net ivme değeri (SV) — düşme tespitinde
      signalVectorMagnitude: { type: Number },
      // Serbest düşüş süresi (ms)
      freefallDuration: { type: Number },
      // Darbe şiddeti (g)
      impactForce: { type: Number },
      // Hareketsizlik süresi (dakika)
      inactivityDuration: { type: Number },
      // Güven oranı (%)
      confidence: { type: Number, min: 0, max: 100 },
      // Algoritmanın kullandığı eşik değerleri
      thresholds: {
        type: Map,
        of: Number,
      },
    },

    // ── Konum (Alarm anındaki GPS) ──
    location: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String }, // Opsiyonel: reverse geocoding sonucu
    },

    // ── İlişkili Sensör Verileri ──
    // Alarmı tetikleyen sensör verilerinin referansları
    relatedSensorData: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SensorData',
      },
    ],

    // ── Müdahale Bilgileri ──
    // Kim onayladı / çözdü?
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    acknowledgedAt: { type: Date },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: { type: Date },

    // Çözüm notu (yanlış alarm mıydı, ne yapıldı?)
    resolutionNote: {
      type: String,
      maxlength: [1000, 'Çözüm notu en fazla 1000 karakter olabilir'],
    },

    // ── Socket.io ile bildirim gönderildi mi? ──
    notificationSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Index'ler ───
// Dashboard'da hasta bazlı aktif alarm listesi
alertSchema.index({ patientId: 1, status: 1, createdAt: -1 });
// Tüm aktif alarmları risk seviyesine göre sıralama
alertSchema.index({ status: 1, severity: 1, createdAt: -1 });
// Zaman bazlı alarm istatistikleri
alertSchema.index({ alertType: 1, createdAt: -1 });

// ─── Statik Metotlar ───

// Aktif alarmları getir (dashboard için)
alertSchema.statics.getActiveAlerts = async function (limit = 50) {
  return this.find({ status: 'active' })
    .sort({ severity: -1, createdAt: -1 })
    .limit(limit)
    .populate('patientId', 'firstName lastName email phone')
    .lean();
};

// Belirli hastanın alarm geçmişini getir
alertSchema.statics.getPatientAlertHistory = async function (patientId, limit = 100) {
  return this.find({ patientId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('acknowledgedBy', 'firstName lastName')
    .populate('resolvedBy', 'firstName lastName')
    .lean();
};

// Alarmı onayla (acknowledge)
alertSchema.statics.acknowledgeAlert = async function (alertId, userId) {
  return this.findByIdAndUpdate(
    alertId,
    {
      status: 'acknowledged',
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
    },
    { new: true, runValidators: true }
  );
};

// Alarmı çöz (resolve)
alertSchema.statics.resolveAlert = async function (alertId, userId, note) {
  return this.findByIdAndUpdate(
    alertId,
    {
      status: 'resolved',
      resolvedBy: userId,
      resolvedAt: new Date(),
      resolutionNote: note || '',
    },
    { new: true, runValidators: true }
  );
};

// Alarm istatistikleri (dashboard yüzdelik oranlar için)
alertSchema.statics.getAlertStats = async function (startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          type: '$alertType',
          severity: '$severity',
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.type',
        total: { $sum: '$count' },
        bySeverity: {
          $push: {
            severity: '$_id.severity',
            status: '$_id.status',
            count: '$count',
          },
        },
      },
    },
  ]);
};

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;
