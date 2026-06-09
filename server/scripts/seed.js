/**
 * ============================================================
 * Test Verisi Oluşturma Scripti (scripts/seed.js)
 * ============================================================
 *
 * Kullanım: node scripts/seed.js
 *
 * Bu script veritabanına örnek veriler ekler:
 * - 1 Admin kullanıcısı
 * - 1 Monitor kullanıcısı
 * - 3 Patient (hasta) kullanıcısı
 * - Her hasta için sensör verileri (son 24 saat)
 * - Örnek alarm kayıtları
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, SensorData, Alert } = require('../models');
const logger = require('../utils/logger');

// ─── Seed Verileri ───
const users = [
  {
    firstName: 'Umut',
    lastName: 'Kaya',
    email: 'admin@admin.com',
    password: '123456',
    role: 'admin',
    phone: '05551234567',
  },
  {
    firstName: 'Burak',
    lastName: 'Erim',
    email: 'burak@monitor.com',
    password: '123456',
    role: 'monitor',
    phone: '05559876543',
  },
  {
    firstName: 'Göksel',
    lastName: 'Bingöl',
    email: 'göksel@hasta.com',
    password: '123456',
    role: 'patient',
    phone: '05551112233',
    age: 72,
    medicalNotes: 'Tansiyon hastası, düzenli ilaç kullanıyor',
    emergencyContact: {
      name: 'Yusuf Bingöl',
      phone: '05552223344',
      relationship: 'Abisi',
    },
  },
  {
    firstName: 'Samet',
    lastName: 'Uçar',
    email: 'samet@hasta.com',
    password: '123456',
    role: 'patient',
    phone: '05554445566',
    age: 68,
    medicalNotes: 'Diyabet, kalp ritim bozukluğu',
    emergencyContact: {
      name: 'Hasan Uçar',
      phone: '05555556677',
      relationship: 'Abisi',
    },
  },
];

/**
 * Normal yürüme sensör verisi üretir
 */
const generateNormalWalkingData = (userId, timestamp) => {
  // Normal yürüme: ~9.8g total magnitude, küçük varyasyonlar
  const baseX = 0.1 + Math.random() * 0.3;
  const baseY = 0.1 + Math.random() * 0.3;
  const baseZ = 9.6 + Math.random() * 0.4;

  return {
    userId,
    timestamp,
    accelerometer: {
      x: baseX,
      y: baseY,
      z: baseZ,
      magnitude: Math.sqrt(baseX ** 2 + baseY ** 2 + baseZ ** 2),
    },
    gyroscope: {
      x: (Math.random() - 0.5) * 0.2,
      y: (Math.random() - 0.5) * 0.2,
      z: (Math.random() - 0.5) * 0.1,
    },
    location: {
      latitude: 40.2249 + (Math.random() - 0.5) * 0.01,
      longitude: 28.9553 + (Math.random() - 0.5) * 0.01,
      accuracy: 5 + Math.random() * 15,
    },
    analyzed: true,
    anomaly: { detected: false, type: 'none' },
  };
};

/**
 * Düşme senaryosu sensör verisi üretir
 * 3 faz: serbest düşüş → darbe → hareketsizlik
 */
const generateFallSequence = (userId, startTime) => {
  const readings = [];
  let t = new Date(startTime).getTime();

  // FAZ 1: Normal yürüme (5 okuma)
  for (let i = 0; i < 5; i++) {
    readings.push(generateNormalWalkingData(userId, new Date(t)));
    t += 100; // 100ms aralık (10Hz)
  }

  // FAZ 2: Serbest düşüş (3 okuma, ~300ms)
  for (let i = 0; i < 3; i++) {
    readings.push({
      userId,
      timestamp: new Date(t),
      accelerometer: {
        x: 0.05 + Math.random() * 0.1,
        y: 0.03 + Math.random() * 0.1,
        z: 0.1 + Math.random() * 0.2,
        magnitude: 0.1 + Math.random() * 0.3, // < 0.5g
      },
      gyroscope: {
        x: (Math.random() - 0.5) * 3,
        y: (Math.random() - 0.5) * 3,
        z: (Math.random() - 0.5) * 2,
      },
      analyzed: true,
      anomaly: { detected: true, type: 'freefall', confidence: 85 },
    });
    t += 100;
  }

  // FAZ 3: Darbe (2 okuma)
  for (let i = 0; i < 2; i++) {
    const impactForce = 3.0 + Math.random() * 2;
    readings.push({
      userId,
      timestamp: new Date(t),
      accelerometer: {
        x: impactForce * 0.5,
        y: impactForce * 0.3,
        z: impactForce * 0.8,
        magnitude: impactForce,
      },
      gyroscope: {
        x: (Math.random() - 0.5) * 5,
        y: (Math.random() - 0.5) * 5,
        z: (Math.random() - 0.5) * 3,
      },
      analyzed: true,
      anomaly: { detected: true, type: 'impact', confidence: 90 },
    });
    t += 100;
  }

  // FAZ 4: Hareketsizlik (10 okuma, 1sn)
  for (let i = 0; i < 10; i++) {
    readings.push({
      userId,
      timestamp: new Date(t),
      accelerometer: {
        x: 0.01 + Math.random() * 0.03,
        y: 0.01 + Math.random() * 0.03,
        z: 9.78 + Math.random() * 0.04,
        magnitude: 9.78 + Math.random() * 0.04,
      },
      gyroscope: {
        x: Math.random() * 0.02,
        y: Math.random() * 0.02,
        z: Math.random() * 0.01,
      },
      analyzed: true,
      anomaly: { detected: true, type: 'inactivity', confidence: 80 },
    });
    t += 100;
  }

  return readings;
};

// ─── Ana Seed Fonksiyonu ───
const seed = async () => {
  try {
    console.log('\n🌱 Seed işlemi başlıyor...\n');

    // Veritabanına bağlan
    await mongoose.connect(process.env.MONGO_URI);
    console.log('📦 MongoDB bağlantısı kuruldu');

    // Mevcut verileri temizle
    console.log('🗑️  Mevcut veriler temizleniyor...');
    await User.deleteMany({});
    await Alert.deleteMany({});
    // SensorData time-series koleksiyonunu drop etmek gerekebilir
    try {
      await mongoose.connection.db.dropCollection('sensordatas');
    } catch (e) {
      // Koleksiyon yoksa hata verir, sorun değil
    }

    // Kullanıcıları oluştur
    console.log('👤 Kullanıcılar oluşturuluyor...');
    const createdUsers = [];
    for (const userData of users) {
      const user = await User.create(userData);
      createdUsers.push(user);
      console.log(`   ✅ ${user.role}: ${user.firstName} ${user.lastName} (${user.email})`);
    }

    // Hasta kullanıcılarını bul
    const patients = createdUsers.filter((u) => u.role === 'patient');

    // Sensör verileri oluştur (son 24 saat, her hasta için)
    console.log('\n📊 Sensör verileri oluşturuluyor...');
    const now = Date.now();
    for (const patient of patients) {
      const sensorReadings = [];

      // Son 24 saatte her 30 saniyede bir normal veri
      for (let h = 24; h > 0; h--) {
        for (let m = 0; m < 60; m += 0.5) {
          const ts = now - h * 60 * 60 * 1000 + m * 60 * 1000;
          sensorReadings.push(generateNormalWalkingData(patient._id, new Date(ts)));
        }
      }

      // İlk hasta için düşme senaryosu ekle (2 saat önce)
      if (patient.email === 'hasta1@test.com') {
        const fallTime = now - 2 * 60 * 60 * 1000;
        const fallData = generateFallSequence(patient._id, new Date(fallTime));
        sensorReadings.push(...fallData);
      }

      // Batch olarak kaydet
      const batchSize = 500;
      for (let i = 0; i < sensorReadings.length; i += batchSize) {
        const batch = sensorReadings.slice(i, i + batchSize);
        await SensorData.insertMany(batch, { ordered: false });
      }

      // Kullanıcının son veri zamanını güncelle
      await User.findByIdAndUpdate(patient._id, {
        lastDataReceivedAt: new Date(),
        lastKnownLocation: {
          type: 'Point',
          coordinates: [28.9553, 40.2249], // Bursa
        },
      });

      console.log(`   ✅ ${patient.firstName}: ${sensorReadings.length} sensör verisi`);
    }

    // Örnek alarmlar oluştur
    console.log('\n🚨 Örnek alarmlar oluşturuluyor...');
    const alertsData = [
      {
        patientId: patients[0]._id,
        alertType: 'FALL_DETECTED',
        severity: 'critical',
        status: 'active',
        message: `⚠️ ${patients[0].firstName} ${patients[0].lastName} için düşme tespit edildi! Darbe kuvveti: 3.5g, Güven oranı: %92`,
        analysisDetails: {
          signalVectorMagnitude: 3.5,
          freefallDuration: 280,
          impactForce: 3.5,
          confidence: 92,
        },
        location: { latitude: 40.2249, longitude: 28.9553 },
      },
      {
        patientId: patients[1]._id,
        alertType: 'INACTIVITY_LONG',
        severity: 'high',
        status: 'active',
        message: `${patients[1].firstName} ${patients[1].lastName} son 2 saattir hareketsiz.`,
        analysisDetails: {
          inactivityDuration: 120,
          confidence: 78,
        },
        location: { latitude: 40.2230, longitude: 28.9570 },
      },
      {
        patientId: patients[2]._id,
        alertType: 'GPS_STAGNANT',
        severity: 'medium',
        status: 'resolved',
        message: `${patients[2].firstName} ${patients[2].lastName} son 3 saattir aynı konumda.`,
        resolvedBy: createdUsers[0]._id,
        resolvedAt: new Date(),
        resolutionNote: 'Hasta evinde, durumu normal.',
      },
    ];

    for (const alertData of alertsData) {
      const alert = await Alert.create(alertData);
      console.log(`   ✅ ${alert.alertType}: ${alert.status} (${alert.severity})`);
    }

    // Özet
    const userCount = await User.countDocuments();
    const sensorCount = await SensorData.countDocuments();
    const alertCount = await Alert.countDocuments();

    console.log('\n════════════════════════════════════════');
    console.log('🌱 Seed işlemi tamamlandı!');
    console.log('════════════════════════════════════════');
    console.log(`   👤 Kullanıcılar: ${userCount}`);
    console.log(`   📊 Sensör Verileri: ${sensorCount}`);
    console.log(`   🚨 Alarmlar: ${alertCount}`);
    console.log('\n📋 Test Hesapları:');
    console.log('   Admin:   admin@test.com   / 123456');
    console.log('   Monitor: monitor@test.com / 123456');
    console.log('   Hasta 1: hasta1@test.com  / 123456');
    console.log('   Hasta 2: hasta2@test.com  / 123456');
    console.log('   Hasta 3: hasta3@test.com  / 123456');
    console.log('════════════════════════════════════════\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Seed hatası: ${error.message}`);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seed();
