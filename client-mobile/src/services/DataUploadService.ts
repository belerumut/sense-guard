import axios from 'axios';
import { getApiUrl, getToken } from './AuthService';

export interface SensorReading {
  timestamp: string;
  accelerometer: {
    x: number;
    y: number;
    z: number;
  };
  gyroscope: {
    x: number;
    y: number;
    z: number;
  };
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export const uploadSensorBatch = async (readings: SensorReading[]): Promise<boolean> => {
  if (readings.length === 0) return false;

  try {
    const apiUrl = await getApiUrl();
    const token = await getToken();

    if (!token) {
      console.warn('Oturum açılmadığı için veri gönderimi iptal edildi');
      return false;
    }

    const response = await axios.post(
      `${apiUrl}/sensor/ingest`,
      { readings },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 saniye zaman aşımı
      }
    );

    if (response.status === 201 || response.status === 207) {
      console.log(`📡 Batch başarıyla yüklendi: ${readings.length} kayıt`);
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('📡 Veri yükleme hatası:', error.message || error);
    return false;
  }
};
