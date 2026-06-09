/**
 * Düşme Simülasyon Scripti (scripts/simulateFall.js)
 *
 * Kullanım: node scripts/simulateFall.js
 *
 * Bu script:
 * 1. hasta1@test.com kullanıcısı ile sisteme giriş yapar (JWT alır)
 * 2. Yapay bir düşme veri serisi üretir (Yürüme -> Serbest Düşüş -> Darbe -> Hareketsizlik)
 * 3. Bu yığın veriyi POST /api/sensor/ingest endpoint'ine gönderir
 * 4. Sunucu anomali tespit algoritması düşmeyi yakalar ve alarm oluşturur
 */

const API_URL = 'http://localhost:5000/api';

const simulate = async () => {
  try {
    console.log('🚪 1. Kullanıcı girişi yapılıyor (hasta1@test.com)...');
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hasta1@test.com',
        password: '123456',
      }),
    });

    const loginData = await loginResponse.json();
    if (!loginResponse.ok) {
      throw new Error(loginData.message || 'Giriş başarısız');
    }

    const token = loginData.data.token;
    console.log('✅ Giriş başarılı. Token alındı.');

    // Konum koordinatları (Bursa Kent Meydanı)
    const location = {
      latitude: 40.1901,
      longitude: 29.0602,
      accuracy: 8.5,
    };

    console.log('📊 2. Düşme senaryosu sensör verileri hazırlanıyor...');
    const readings = [];
    let t = Date.now();

    // FAZ 1: Normal yürüme (5 okuma - 500ms)
    for (let i = 0; i < 5; i++) {
      readings.push({
        timestamp: new Date(t).toISOString(),
        accelerometer: {
          x: 0.1,
          y: 0.15,
          z: 9.8, // SV = 9.8g
        },
        gyroscope: { x: 0.05, y: -0.02, z: 0.01 },
        location,
      });
      t += 100;
    }

    // FAZ 2: Serbest düşüş (3 okuma - 300ms, ağırlıksızlık)
    // SV = √(x²+y²+z²) < 0.5g
    for (let i = 0; i < 3; i++) {
      readings.push({
        timestamp: new Date(t).toISOString(),
        accelerometer: {
          x: 0.05,
          y: 0.02,
          z: 0.15, // SV = 0.16g
        },
        gyroscope: { x: 2.5, y: 1.8, z: -2.0 },
        location,
      });
      t += 100;
    }

    // FAZ 3: Yere çarpma / Darbe (1 okuma - 100ms, yüksek ivme spike'ı)
    // SV = 3.67g (>2.5g eşiği)
    readings.push({
      timestamp: new Date(t).toISOString(),
      accelerometer: {
        x: 1.5,
        y: 1.0,
        z: 3.2,
      },
      gyroscope: { x: -4.5, y: 3.2, z: -1.5 },
      location,
    });
    t += 100;

    // FAZ 4: Düştükten sonra hareketsizlik (15 okuma - 1500ms, sıfır varyans)
    // Her okuma tam olarak aynı değerde olmalı ki varyans 0 olsun (< 0.1g eşiği)
    for (let i = 0; i < 15; i++) {
      readings.push({
        timestamp: new Date(t).toISOString(),
        accelerometer: {
          x: 0.0,
          y: 0.0,
          z: 9.8, // SV = 9.8g
        },
        gyroscope: { x: 0.0, y: 0.0, z: 0.0 },
        location,
      });
      t += 100;
    }

    console.log(`📡 3. ${readings.length} sensör verisi backend sunucusuna gönderiliyor...`);
    const response = await fetch(`${API_URL}/sensor/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ readings }),
    });

    const resData = await response.json();
    console.log('✅ Yanıt alındı:', resData);
    console.log('\n🎉 Düşme simülasyonu tamamlandı! Sunucu loglarını ve web panelini kontrol edin.');
  } catch (error) {
    console.error('❌ Simülasyon hatası:', error.message);
  }
};

simulate();
