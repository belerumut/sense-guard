import { Accelerometer, Gyroscope } from 'expo-sensors';
import { getLastKnownLocation } from './LocationService';
import { uploadSensorBatch, SensorReading } from './DataUploadService';

// Konfigürasyon
const SAMPLING_INTERVAL_MS = 100; // 10Hz (100ms)
const BATCH_SIZE = 50; // 5 saniyelik veri (50 * 100ms)

let accelerometerData = { x: 0, y: 0, z: 9.8 };
let gyroscopeData = { x: 0, y: 0, z: 0 };
let readingsBuffer: SensorReading[] = [];
let sampleTimer: NodeJS.Timeout | null = null;
let isTrackingActive = false;

let accelSubscription: any = null;
let gyroSubscription: any = null;

// UI Callback'leri (Anlık grafik veya değer göstermek için)
let onDataCallback: ((accel: typeof accelerometerData, gyro: typeof gyroscopeData, bufferCount: number) => void) | null = null;

export const setSensorDataCallback = (
  callback: (accel: typeof accelerometerData, gyro: typeof gyroscopeData, bufferCount: number) => void
) => {
  onDataCallback = callback;
};

export const startSensorTracking = async (): Promise<void> => {
  if (isTrackingActive) return;

  isTrackingActive = true;
  readingsBuffer = [];

  // Sensör hızlarını ayarla
  Accelerometer.setUpdateInterval(SAMPLING_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SAMPLING_INTERVAL_MS);

  // Dinleyicileri başlat
  accelSubscription = Accelerometer.addListener((data) => {
    // Expo accelerometer veriyi g cinsinden verir
    accelerometerData = { x: data.x, y: data.y, z: data.z };
  });

  gyroSubscription = Gyroscope.addListener((data) => {
    // Expo gyroscope rad/s cinsinden verir
    gyroscopeData = { x: data.x, y: data.y, z: data.z };
  });

  // Belirlenen frekansta veri örnekleyen zamanlayıcı
  sampleTimer = setInterval(async () => {
    const location = getLastKnownLocation();
    
    const reading: SensorReading = {
      timestamp: new Date().toISOString(),
      accelerometer: { ...accelerometerData },
      gyroscope: { ...gyroscopeData },
      location: location ? { ...location } : undefined,
    };

    readingsBuffer.push(reading);

    if (onDataCallback) {
      onDataCallback(accelerometerData, gyroscopeData, readingsBuffer.length);
    }

    // Yığın limitine ulaşıldıysa gönder
    if (readingsBuffer.length >= BATCH_SIZE) {
      const batchToUpload = [...readingsBuffer];
      readingsBuffer = []; // Buffer'ı sıfırla
      
      // Arka planda gönder
      uploadSensorBatch(batchToUpload).catch((err) => {
        console.error('Yığın gönderim hatası:', err);
      });
    }
  }, SAMPLING_INTERVAL_MS);

  console.log('📡 Sensör okuma ve zamanlayıcı başlatıldı');
};

export const stopSensorTracking = (): void => {
  isTrackingActive = false;

  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }

  if (accelSubscription) {
    accelSubscription.remove();
    accelSubscription = null;
  }

  if (gyroSubscription) {
    gyroSubscription.remove();
    gyroSubscription = null;
  }

  readingsBuffer = [];
  console.log('⏹️ Sensör okuma durduruldu');
};

export const isTracking = (): boolean => {
  return isTrackingActive;
};

/**
 * Test amaçlı yapay bir düşme senaryosu üretip gönderir.
 * 3 Faz: Normal yürüme -> Serbest Düşüş -> Darbe -> Hareketsizlik
 */
export const simulateFallEvent = async (): Promise<boolean> => {
  console.log('⚠️ Düşme simülasyonu başlatılıyor...');
  const simulateReadings: SensorReading[] = [];
  let t = Date.now();
  const location = getLastKnownLocation();

  // 1. Normal Yürüme (5 okuma - 500ms)
  for (let i = 0; i < 5; i++) {
    simulateReadings.push({
      timestamp: new Date(t).toISOString(),
      accelerometer: {
        x: 0.1 + Math.random() * 0.2,
        y: 0.1 + Math.random() * 0.2,
        z: 9.6 + Math.random() * 0.4,
      },
      gyroscope: {
        x: (Math.random() - 0.5) * 0.2,
        y: (Math.random() - 0.5) * 0.2,
        z: (Math.random() - 0.5) * 0.1,
      },
      location: location ? { ...location } : undefined,
    });
    t += 100;
  }

  // 2. Serbest Düşüş (3 okuma - 300ms, total magnitude < 0.5g)
  for (let i = 0; i < 3; i++) {
    simulateReadings.push({
      timestamp: new Date(t).toISOString(),
      accelerometer: {
        x: 0.05 + Math.random() * 0.05,
        y: 0.05 + Math.random() * 0.05,
        z: 0.1 + Math.random() * 0.1,
      },
      gyroscope: {
        x: 2.0 + Math.random() * 1.5,
        y: 2.0 + Math.random() * 1.5,
        z: 1.0 + Math.random() * 1.0,
      },
      location: location ? { ...location } : undefined,
    });
    t += 100;
  }

  // 3. Darbe (Impact) (1 okuma - 100ms, total magnitude > 3.0g)
  simulateReadings.push({
    timestamp: new Date(t).toISOString(),
    accelerometer: {
      x: 1.5,
      y: 1.0,
      z: 3.2, // √(1.5² + 1.0² + 3.2²) = 3.67g (IMPACT)
    },
    gyroscope: {
      x: -4.0,
      y: 3.0,
      z: -2.0,
    },
    location: location ? { ...location } : undefined,
  });
  t += 100;

  // 4. Hareketsizlik (Post-fall) (15 okuma - 1500ms, varyans < 0.1)
  for (let i = 0; i < 15; i++) {
    simulateReadings.push({
      timestamp: new Date(t).toISOString(),
      accelerometer: {
        x: 0.0,
        y: 0.0,
        z: 9.8,
      },
      gyroscope: {
        x: 0.0,
        y: 0.0,
        z: 0.0,
      },
      location: location ? { ...location } : undefined,
    });
    t += 100;
  }

  // Batch gönder
  return await uploadSensorBatch(simulateReadings);
};
