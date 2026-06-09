/**
 * ============================================================
 * Kullanıcı Modeli (models/User.js)
 * ============================================================
 *
 * Sistemdeki üç rol tipi:
 * ───────────────────────
 * 1. admin   → Tam yetki: tüm kullanıcıları/alarmları yönetir
 * 2. monitor → İzleyici: hastaları ve alarmları görüntüler
 * 3. patient → Hasta: sensör verisi gönderir, kendi durumunu görür
 *
 * Güvenlik Katmanları:
 * ────────────────────
 * - Şifre bcrypt ile hashlenip saklanır (salt: 12 round)
 * - Şifre alanı sorgularda varsayılan olarak döndürülmez (select: false)
 * - comparePassword() metodu ile güvenli karşılaştırma
 *
 * Türkçe Karakter Duyarlılığı:
 * ────────────────────────────
 * - E-posta kaydedilmeden önce küçük harfe çevrilerek normalize edilir
 * - Ad/soyad aramaları için collation desteği (locale: 'tr')
 * - Türkçe İ/ı, Ş/ş, Ğ/ğ, Ç/ç, Ö/ö, Ü/ü dönüşüm sorunları önlenir
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ─── Acil Durum İletişim Bilgisi Alt Şeması ───
// Hasta (patient) rolündeki kullanıcılar için zorunlu
const emergencyContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    relationship: {
      type: String,
      trim: true,
    },
  },
  { _id: false } // Alt belge için ayrı _id oluşturma
);

// ─── Ana Kullanıcı Şeması ───
const userSchema = new mongoose.Schema(
  {
    // ── Temel Bilgiler ──
    firstName: {
      type: String,
      required: [true, 'Ad alanı zorunludur'],
      trim: true,
      minlength: [2, 'Ad en az 2 karakter olmalıdır'],
      maxlength: [50, 'Ad en fazla 50 karakter olabilir'],
    },

    lastName: {
      type: String,
      required: [true, 'Soyad alanı zorunludur'],
      trim: true,
      minlength: [2, 'Soyad en az 2 karakter olmalıdır'],
      maxlength: [50, 'Soyad en fazla 50 karakter olabilir'],
    },

    email: {
      type: String,
      required: [true, 'E-posta adresi zorunludur'],
      unique: true,
      trim: true,
      lowercase: true, // Türkçe 'İ' → 'i' sorununu önler
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Geçerli bir e-posta adresi giriniz',
      ],
    },

    password: {
      type: String,
      required: [true, 'Şifre zorunludur'],
      minlength: [6, 'Şifre en az 6 karakter olmalıdır'],
      select: false, // Sorgu sonuçlarında şifre alanını döndürme
    },

    // ── Rol Yönetimi ──
    role: {
      type: String,
      enum: {
        values: ['admin', 'monitor', 'patient'],
        message: 'Geçersiz rol. Kabul edilen: admin, monitor, patient',
      },
      default: 'patient',
    },

    // ── İletişim ──
    phone: {
      type: String,
      trim: true,
      match: [
        /^(\+90|0)?[0-9]{10}$/,
        'Geçerli bir Türkiye telefon numarası giriniz (örn: 05XX XXX XX XX)',
      ],
    },

    // ── Hasta (Patient) Özel Alanları ──
    // Bu alanlar sadece patient rolünde anlamlıdır
    age: {
      type: Number,
      min: [0, 'Yaş 0\'dan küçük olamaz'],
      max: [150, 'Geçerli bir yaş giriniz'],
    },

    medicalNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Tıbbi notlar en fazla 1000 karakter olabilir'],
    },

    emergencyContact: emergencyContactSchema,

    // ── Durum ve İzleme ──
    isActive: {
      type: Boolean,
      default: true,
    },

    // Hangi monitor kullanıcıları bu hastayı izliyor?
    assignedMonitors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Son bilinen konum (GPS)
    lastKnownLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },

    // Son veri alınma zamanı (hareketsizlik tespiti için kritik)
    lastDataReceivedAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // createdAt ve updatedAt otomatik eklenir
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Sanal Alan: Tam Ad ───
// firstName + lastName birleştirmesi (sorgu kolaylığı)
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ─── Index'ler ───
// E-posta zaten unique olduğu için otomatik index'lenir
// Konum bazlı sorgular için 2dsphere index
userSchema.index({ lastKnownLocation: '2dsphere' });
// Rol bazlı filtreleme + aktiflik sorguları için bileşik index
userSchema.index({ role: 1, isActive: 1 });
// Ad/soyad araması için text index (Türkçe collation ile)
userSchema.index(
  { firstName: 'text', lastName: 'text' },
  {
    default_language: 'turkish',
    name: 'user_fulltext_search',
  }
);

// ─── Pre-save Hook: Şifre Hashleme ───
// Şifre değiştiğinde veya yeni kullanıcı oluşturulduğunda çalışır
userSchema.pre('save', async function (next) {
  // Şifre değişmediyse hashleme işlemine gerek yok
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ─── Instance Method: Şifre Karşılaştırma ───
// Login sırasında kullanılır
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Collation Ayarı ───
// Türkçe karakter duyarlılığı için tüm sorgularda kullanılacak
// strength: 1 → büyük/küçük harf ve aksan farkı gözetmez
// locale: 'tr' → Türkçe İ/ı dönüşümlerini doğru yapar
userSchema.set('collation', { locale: 'tr', strength: 2 });

const User = mongoose.model('User', userSchema);

module.exports = User;
