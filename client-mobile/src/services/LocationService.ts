import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import axios from 'axios';
import { getApiUrl, getToken } from './AuthService';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

const BACKGROUND_LOCATION_TASK = 'background-location-task';
let lastKnownLocation: LocationData | null = null;
let locationWatcher: Location.LocationSubscription | null = null;

// TASK 5: Arka plan konum görevini tanımla
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('Arka plan konum takibi görevi hatası:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      const newLoc: LocationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || undefined,
      };

      lastKnownLocation = newLoc;
      console.log('🌍 [Arka Plan Konum] Yeni konum alındı:', newLoc);

      try {
        const token = await getToken();
        if (token) {
          const apiUrl = await getApiUrl();
          
          // Arka planda konum güncellendiğinde sunucuya bir "hayattayım" paketi yolla
          // Bu, kullanıcının lastKnownLocation ve lastDataReceivedAt alanını güncelleyerek
          // hareketsizlik uyarısı oluşmasını engelleyecek ve haritada güncellenmesini sağlayacaktır.
          const payload = {
            readings: [
              {
                timestamp: new Date().toISOString(),
                accelerometer: { x: 0, y: 0, z: 9.8 }, // Sabit/durağan ivme
                gyroscope: { x: 0, y: 0, z: 0 },
                location: newLoc,
              }
            ]
          };

          await axios.post(`${apiUrl}/sensor/ingest`, payload, {
            headers: {
              Authorization: `Bearer ${token}`,
            }
          });
          console.log('📡 [Arka Plan Konum] Konum verisi sunucuya iletildi.');
        }
      } catch (err: any) {
        console.error('📡 [Arka Plan Konum] Sunucuya gönderme hatası:', err.message);
      }
    }
  }
});

export const startLocationUpdates = async (
  onLocationUpdate?: (location: LocationData) => void
): Promise<void> => {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.warn('Ön plan konum izni reddedildi');
      return;
    }

    // İlk konumu hızlıca al
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    
    lastKnownLocation = {
      latitude: initialLocation.coords.latitude,
      longitude: initialLocation.coords.longitude,
      accuracy: initialLocation.coords.accuracy || undefined,
    };

    if (onLocationUpdate) {
      onLocationUpdate(lastKnownLocation);
    }

    // Ön planda izleme
    locationWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000, // 5 saniyede bir
        distanceInterval: 5, // 5 metrede bir
      },
      (newLocation) => {
        lastKnownLocation = {
          latitude: newLocation.coords.latitude,
          longitude: newLocation.coords.longitude,
          accuracy: newLocation.coords.accuracy || undefined,
        };
        if (onLocationUpdate) {
          onLocationUpdate(lastKnownLocation);
        }
      }
    );

    // Arka plan konum takibini başlat (Cihaz/Emülatör kısıtlamalarına karşı try-catch içinde)
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        console.warn('Arka plan konum izni reddedildi. Uygulama kapandığında takip çalışmayabilir.');
      } else {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 5,
          foregroundService: {
            notificationTitle: `${process.env.EXPO_PUBLIC_APP_NAME || 'SafeGuard'} Aktif İzleme`,
            notificationBody: 'Konumunuz arka planda takip ediliyor.',
            notificationColor: '#3b82f6',
          },
          pausesUpdatesAutomatically: false,
        });
        console.log('📡 Arka plan konum takibi başlatıldı');
      }
    } catch (bgError: any) {
      console.warn(
        '⚠️ Arka plan konum takibi başlatılamadı (Expo Go veya Emülatör kısıtlaması):',
        bgError.message
      );
    }
  } catch (error) {
    console.error('Konum takibi başlatma hatası:', error);
  }
};

export const stopLocationUpdates = async (): Promise<void> => {
  if (locationWatcher) {
    locationWatcher.remove();
    locationWatcher = null;
  }
  
  try {
    const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isTaskRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('⏹️ Arka plan konum takibi durduruldu');
    }
  } catch (error) {
    console.error('Arka plan konum takibi durdurma hatası:', error);
  }
};

export const getLastKnownLocation = (): LocationData | null => {
  return lastKnownLocation;
};
