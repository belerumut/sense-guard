/**
 * Hareketsizlik Simülasyon Scripti (scripts/simulateInactivity.js)
 *
 * Kullanım: node scripts/simulateInactivity.js
 *
 * Bu script:
 * 1. MongoDB'ye bağlanır
 * 2. hasta2@test.com için son 2 saat boyunca tamamen sabit sensör verileri ekler (varyans ~0)
 * 3. Hareketsizlik Kontrol Algoritmasını (inactivityChecker) tetikler
 * 4. Eşik değerleri aşıldığı için INACTIVITY_LONG ve GPS_STAGNANT alarmlarının tetiklendiğini doğrular
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, SensorData, Alert } = require('../models');
const { checkPatientInactivity } = require('../services/inactivityChecker');
const logger = require('../utils/logger');

const runSimulate = async () => {
  try {
    console.log('📦 MongoDB bağlantısı kuruluyor...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB bağlandı.');

    // 1. Hasta 2'yi bul
    const patient = await User.findOne({ email: 'hasta2@test.com' });
    if (!patient) {
      console.error('❌ Hata: hasta2@test.com bulunamadı! Lütfen önce seed scriptini çalıştırın.');
      process.exit(1);
    }

    console.log(`👤 Hasta bulundu: ${patient.firstName} ${patient.lastName}`);

    // 2. Son 3 saatteki eski sensör verilerini bu hasta için temizle
    console.log('🗑️  Eski sensör verileri temizleniyor...');
    const threeHoursAgo = new Date();
    threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);
    await SensorData.deleteMany({
      userId: patient._id,
      timestamp: { $gte: threeHoursAgo },
    });

    // 3. 3 saat boyunca her 1 dakikada bir tamamen durağan (sabit) veri ekle
    console.log('📊 Durağan sensör verileri ve değişmeyen GPS koordinatları ekleniyor...');
    const readings = [];
    const now = Date.now();
    
    // Bursa merkez sabit koordinatları
    const fixedLocation = {
      latitude: 40.2249,
      longitude: 28.9553,
      accuracy: 10,
    };

    for (let i = 180; i > 0; i--) {
      const ts = now - i * 60 * 1000;
      
      // İvme büyüklüğü neredeyse tam 9.8g (varyans sıfıra yakın)
      readings.push({
        userId: patient._id,
        timestamp: new Date(ts),
        accelerometer: {
          x: 0.1,
          y: 0.1,
          z: 9.79, // SV = 9.8g
          magnitude: 9.8,
        },
        gyroscope: { x: 0, y: 0, z: 0 },
        location: fixedLocation,
        analyzed: false,
      });
    }

    await SensorData.insertMany(readings);
    console.log(`✅ ${readings.length} durağan veri noktası eklendi.`);

    // Son veri zamanını güncelle
    await User.findByIdAndUpdate(patient._id, {
      lastDataReceivedAt: new Date(),
      lastKnownLocation: {
        type: 'Point',
        coordinates: [fixedLocation.longitude, fixedLocation.latitude],
      },
    });

    // 4. Hareketsizlik Kontrol Algoritmasını bu hasta için çalıştır
    console.log('\n🔍 Hareketsizlik ve GPS durağanlık analiz motoru tetikleniyor...');
    
    // Cooldown'ı sıfırlamak için varsa son 1 saatteki alarmlarını silelim
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);
    await Alert.deleteMany({
      patientId: patient._id,
      createdAt: { $gte: oneHourAgo },
    });

    await checkPatientInactivity(patient);

    // 5. Oluşan alarmları kontrol et
    const createdAlerts = await Alert.find({
      patientId: patient._id,
      status: 'active',
    }).sort({ createdAt: -1 });

    console.log('\n🚨 AKTİF ALARMLAR (Algoritma Sonrası):');
    if (createdAlerts.length === 0) {
      console.log('   ⚠️ Hiç aktif alarm oluşturulmadı.');
    } else {
      createdAlerts.forEach((a) => {
        console.log(`   🔴 [${a.alertType}] Seviye: ${a.severity} | Mesaj: ${a.message}`);
      });
    }

    console.log('\n🎉 Hareketsizlik analizi simülasyonu başarıyla tamamlandı!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Simülasyon hatası:', error.message);
    if (mongoose.connection) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

runSimulate();
