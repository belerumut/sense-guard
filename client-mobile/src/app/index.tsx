import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { login, logout, register, getCurrentUser, getApiUrl, setApiUrl, User } from '../services/AuthService';
import { startLocationUpdates, stopLocationUpdates, LocationData } from '../services/LocationService';
import {
  startSensorTracking,
  stopSensorTracking,
  isTracking,
  setSensorDataCallback,
} from '../services/SensorService';
import Constants from 'expo-constants';

const getAutoApiUrl = () => {
  const debuggerHost = Constants.expoConfig?.hostUri;
  if (debuggerHost) {
    const hostIp = debuggerHost.split(':')[0];
    return `http://${hostIp}:5000/api`;
  }
  return 'http://localhost:5000/api';
};

export default function IndexScreen() {
  const appName = process.env.EXPO_PUBLIC_APP_NAME || 'SafeGuard';
  const appLogo = process.env.EXPO_PUBLIC_APP_LOGO || '🛡️';
  const appSubtext = process.env.EXPO_PUBLIC_APP_SUBTEXT || 'Sensör Akışı ve Davranış Analizi İstemcisi';

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAge, setRegAge] = useState('');

  // TASK 2: Hasta yakını bilgileri state'i
  const [regContactName, setRegContactName] = useState('');
  const [regContactPhone, setRegContactPhone] = useState('');
  const [regContactRelation, setRegContactRelation] = useState('');

  const [apiUrl, setApiUrlState] = useState(getAutoApiUrl());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Tracking state
  const [trackingActive, setTrackingActive] = useState(false);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [sensorValues, setSensorValues] = useState({
    accel: { x: 0, y: 0, z: 9.8 },
    gyro: { x: 0, y: 0, z: 0 },
    magnitude: 9.8,
    bufferCount: 0,
  });

  // Başlangıç yüklemesi
  useEffect(() => {
    const initApp = async () => {
      try {
        const savedUrl = await getApiUrl();
        setApiUrlState(savedUrl);

        if (savedUrl === 'http://localhost:5000/api' && Platform.OS === 'android') {
          const androidUrl = 'http://10.0.2.2:5000/api';
          setApiUrlState(androidUrl);
          await setApiUrl(androidUrl);
        }

        const currentUser = await getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
        }
      } catch (error) {
        console.error('App init hatası:', error);
      } finally {
        setLoading(false);
      }
    };

    initApp();

    return () => {
      stopTracking();
    };
  }, []);

  // Sensör verilerini dinleme callback'i
  useEffect(() => {
    if (trackingActive) {
      setSensorDataCallback((accel, gyro, bufferCount) => {
        const mag = Math.sqrt(accel.x * accel.x + accel.y * accel.y + accel.z * accel.z);
        setSensorValues({
          accel,
          gyro,
          magnitude: mag,
          bufferCount,
        });
      });
    }
  }, [trackingActive]);

  // Takibi başlat
  const startTracking = async () => {
    try {
      await startLocationUpdates((newLoc) => {
        setLocation(newLoc);
      });
      await startSensorTracking();
      setTrackingActive(true);
    } catch (error) {
      console.error('Takip başlatılamadı:', error);
      Alert.alert('Hata', 'Sensör veya konum takibi başlatılamadı.');
    }
  };

  // Takibi durdur
  const stopTracking = () => {
    stopSensorTracking();
    stopLocationUpdates();
    setTrackingActive(false);
    setLocation(null);
  };

  // Giriş Yap butonu tetikleyici
  const handleLogin = async () => {
    if (!email || !password || !apiUrl) {
      setAuthError('Lütfen tüm alanları doldurun.');
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      await setApiUrl(apiUrl);
      const loggedUser = await login(email, password);
      setUser(loggedUser);
    } catch (error: any) {
      setAuthError(error.message || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  // Kayıt Ol butonu tetikleyici
  const handleRegister = async () => {
    // TASK 2: Hasta yakını bilgileri zorunluluk kontrolü
    if (!regFirstName || !regLastName || !regEmail || !regPassword || !regContactName || !regContactPhone || !regContactRelation) {
      setAuthError('Yıldızlı (*) tüm alanlar ve acil durum kişisi bilgileri zorunludur.');
      return;
    }
    if (regPassword.length < 6) {
      setAuthError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setLoading(true);
    setAuthError('');
    try {
      await setApiUrl(apiUrl);
      const registeredUser = await register({
        firstName: regFirstName,
        lastName: regLastName,
        email: regEmail,
        password: regPassword,
        ...(regPhone ? { phone: regPhone } : {}),
        ...(regAge ? { age: parseInt(regAge, 10) } : {}),
        emergencyContact: {
          name: regContactName,
          phone: regContactPhone,
          relationship: regContactRelation,
        }
      });
      setUser(registeredUser);
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Kayıt başarısız.';
      setAuthError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Çıkış Yap butonu tetikleyici
  const handleLogout = async () => {
    stopTracking();
    await logout();
    setUser(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  // ─── GİRİŞ / KAYIT EKRANI ───
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.authCard}>
            {appLogo.endsWith('.svg') ? (
              <Image
                source={require('../../assets/images/logo.svg')}
                style={{ width: 120, height: 120, marginBottom: 20, alignSelf: 'center' }}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.logo}>{appLogo}</Text>
            )}
            <Text style={styles.title}>{appName} Mobile</Text>
            <Text style={styles.subtitle}>{appSubtext}</Text>

            {/* Tab Selector */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, authMode === 'login' && styles.tabActive]}
                onPress={() => { setAuthMode('login'); setAuthError(''); }}
              >
                <Text style={[styles.tabText, authMode === 'login' && styles.tabTextActive]}>Giriş Yap</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, authMode === 'register' && styles.tabActive]}
                onPress={() => { setAuthMode('register'); setAuthError(''); }}
              >
                <Text style={[styles.tabText, authMode === 'register' && styles.tabTextActive]}>Kayıt Ol</Text>
              </TouchableOpacity>
            </View>

            {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

            {/* API URL - Her iki modda da göster */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Sunucu API URL</Text>
              <TextInput
                style={styles.input}
                value={apiUrl}
                onChangeText={setApiUrlState}
                placeholder="http://localhost:5000/api"
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
              />
            </View>

            {authMode === 'login' ? (
              /* ─── GİRİŞ FORMU ─── */
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Hasta E-posta Adresi</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="ornek@test.com"
                    placeholderTextColor="#6b7280"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Şifre</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••"
                    placeholderTextColor="#6b7280"
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                  <Text style={styles.buttonText}>Giriş Yap</Text>
                </TouchableOpacity>

                <Text style={styles.infoText}>
                  Not: Bu uygulama sadece hastalarımız için veri takibi amacıyla geliştirilmiştir.
                </Text>
              </>
            ) : (
              /* ─── KAYIT FORMU ─── */
              <>
                <View style={styles.registerRow}>
                  <View style={styles.registerCol}>
                    <Text style={styles.label}>Ad *</Text>
                    <TextInput
                      style={styles.input}
                      value={regFirstName}
                      onChangeText={setRegFirstName}
                      placeholder="Adınız"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                  <View style={styles.registerCol}>
                    <Text style={styles.label}>Soyad *</Text>
                    <TextInput
                      style={styles.input}
                      value={regLastName}
                      onChangeText={setRegLastName}
                      placeholder="Soyadınız"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>E-posta *</Text>
                  <TextInput
                    style={styles.input}
                    value={regEmail}
                    onChangeText={setRegEmail}
                    placeholder="ornek@email.com"
                    placeholderTextColor="#6b7280"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Şifre * (en az 6 karakter)</Text>
                  <TextInput
                    style={styles.input}
                    value={regPassword}
                    onChangeText={setRegPassword}
                    placeholder="••••••"
                    placeholderTextColor="#6b7280"
                    secureTextEntry
                  />
                </View>

                <View style={styles.registerRow}>
                  <View style={styles.registerCol}>
                    <Text style={styles.label}>Telefon</Text>
                    <TextInput
                      style={styles.input}
                      value={regPhone}
                      onChangeText={setRegPhone}
                      placeholder="05551234567"
                      placeholderTextColor="#6b7280"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={styles.registerCol}>
                    <Text style={styles.label}>Yaş</Text>
                    <TextInput
                      style={styles.input}
                      value={regAge}
                      onChangeText={setRegAge}
                      placeholder="65"
                      placeholderTextColor="#6b7280"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>

                {/* TASK 2: Hasta Yakını Bilgileri Eklendi */}
                <View style={styles.sectionDivider}>
                  <Text style={styles.sectionTitle}>Acil Durum İletişim Kişisi (Hasta Yakını)</Text>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Yakın Adı Soyadı *</Text>
                  <TextInput
                    style={styles.input}
                    value={regContactName}
                    onChangeText={setRegContactName}
                    placeholder="Hasta Yakınının Adı Soyadı"
                    placeholderTextColor="#6b7280"
                  />
                </View>

                <View style={styles.registerRow}>
                  <View style={styles.registerCol}>
                    <Text style={styles.label}>Yakın Telefonu *</Text>
                    <TextInput
                      style={styles.input}
                      value={regContactPhone}
                      onChangeText={setRegContactPhone}
                      placeholder="05551234567"
                      placeholderTextColor="#6b7280"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={styles.registerCol}>
                    <Text style={styles.label}>Yakınlık Derecesi *</Text>
                    <TextInput
                      style={styles.input}
                      value={regContactRelation}
                      onChangeText={setRegContactRelation}
                      placeholder="Örn: Oğlu, Kızı, Eşi"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                </View>

                <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
                  <Text style={styles.buttonText}>Kayıt Ol</Text>
                </TouchableOpacity>

                <Text style={styles.infoText}>
                  Mobil uygulamadan yapılan kayıtlar otomatik olarak "hasta" rolünde oluşturulur.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── TASK 3: USER FRIENDLY DASHBOARD EKRANI ───
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Modern Header / Karşılama Alanı */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Hoş Geldiniz 👋</Text>
            <Text style={styles.userName}>{user.firstName} {user.lastName}</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>

        {/* Canlı İzleme Koruma Durumu Paneli */}
        <View style={[styles.statusCard, trackingActive ? styles.statusCardActive : null]}>
          <View style={styles.statusHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {appLogo.endsWith('.svg') ? (
                <Image
                  source={require('../../assets/images/logo.svg')}
                  style={{ width: 22, height: 22, marginRight: 6 }}
                  contentFit="contain"
                />
              ) : (
                <Text style={{ fontSize: 18, marginRight: 6 }}>{appLogo}</Text>
              )}
              <Text style={styles.statusTitle}>{appName} Koruması</Text>
            </View>
            <View style={styles.badgeWrapper}>
              <View style={[styles.badgeDot, trackingActive ? styles.badgeDotActive : styles.badgeDotInactive]} />
              <Text style={[styles.badgeText, trackingActive ? styles.textSuccess : styles.textWarning]}>
                {trackingActive ? 'AKTİF KORUMA' : 'PASİF / DEVRE DIŞI'}
              </Text>
            </View>
          </View>

          <Text style={styles.statusDescription}>
            {trackingActive
              ? 'Arka planda sensörleriniz ve GPS konumunuz canlı olarak izleniyor. Olası bir düşme veya uzun süreli hareketsizlik durumunda hasta yakınınıza anında SMS uyarısı gönderilecektir.'
              : `${appName} koruması kapalı. Güvenliğiniz için lütfen aşağıdaki butona basarak takibi başlatın.`}
          </Text>

          <TouchableOpacity
            style={[styles.mainToggleButton, trackingActive ? styles.btnDanger : styles.btnSuccess]}
            onPress={trackingActive ? stopTracking : startTracking}
          >
            <Text style={styles.mainToggleText}>
              {trackingActive ? '🛑 Korumayı Durdur' : '⚡ Korumayı Başlat'}
            </Text>
          </TouchableOpacity>

          {trackingActive && (
            <View style={styles.bufferProgressBar}>
              <View style={styles.bufferProgressInfo}>
                <Text style={styles.bufferProgressText}>Veri Gönderim Yığını</Text>
                <Text style={styles.bufferProgressText}>{sensorValues.bufferCount} / 50 veri</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${(sensorValues.bufferCount / 50) * 100}%` }]} />
              </View>
            </View>
          )}
        </View>

        {/* Canlı Veri Grid Görünümü */}
        <View style={styles.gridContainer}>
          {/* Sensör Metrikleri Kartı */}
          <View style={styles.gridCard}>
            <Text style={styles.gridCardTitle}>📈 İvmeölçer</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Net Kuvvet (SV):</Text>
              <Text style={styles.metricValueHighlight}>{sensorValues.magnitude.toFixed(2)} g</Text>
            </View>
            <View style={styles.subMetricGrid}>
              <View style={styles.subMetric}>
                <Text style={styles.subMetricLabel}>X</Text>
                <Text style={styles.subMetricVal}>{sensorValues.accel.x.toFixed(2)}</Text>
              </View>
              <View style={styles.subMetric}>
                <Text style={styles.subMetricLabel}>Y</Text>
                <Text style={styles.subMetricVal}>{sensorValues.accel.y.toFixed(2)}</Text>
              </View>
              <View style={styles.subMetric}>
                <Text style={styles.subMetricLabel}>Z</Text>
                <Text style={styles.subMetricVal}>{sensorValues.accel.z.toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Jiroskop Kartı */}
          <View style={styles.gridCard}>
            <Text style={styles.gridCardTitle}>🌀 Jiroskop</Text>
            <Text style={styles.gyroInfoText}>Rotasyon Hızları (rad/s)</Text>
            <View style={styles.subMetricGrid}>
              <View style={styles.subMetric}>
                <Text style={styles.subMetricLabel}>X</Text>
                <Text style={styles.subMetricVal}>{sensorValues.gyro.x.toFixed(2)}</Text>
              </View>
              <View style={styles.subMetric}>
                <Text style={styles.subMetricLabel}>Y</Text>
                <Text style={styles.subMetricVal}>{sensorValues.gyro.y.toFixed(2)}</Text>
              </View>
              <View style={styles.subMetric}>
                <Text style={styles.subMetricLabel}>Z</Text>
                <Text style={styles.subMetricVal}>{sensorValues.gyro.z.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* GPS Konum Kartı */}
        <View style={styles.gpsCard}>
          <View style={styles.gpsHeaderRow}>
            <Text style={styles.gpsTitle}>📍 Canlı Konum Bilgisi</Text>
            <Text style={styles.gpsStatusText}>
              {location ? '🛰️ Sinyal Bağlı' : '🔍 Aranıyor...'}
            </Text>
          </View>
          {location ? (
            <View style={styles.gpsInfoWrapper}>
              <View style={styles.gpsInfoCol}>
                <Text style={styles.gpsInfoLabel}>Enlem</Text>
                <Text style={styles.gpsInfoVal}>{location.latitude.toFixed(6)}</Text>
              </View>
              <View style={styles.gpsInfoCol}>
                <Text style={styles.gpsInfoLabel}>Boylam</Text>
                <Text style={styles.gpsInfoVal}>{location.longitude.toFixed(6)}</Text>
              </View>
              {location.accuracy && (
                <View style={styles.gpsInfoCol}>
                  <Text style={styles.gpsInfoLabel}>Hassasiyet</Text>
                  <Text style={styles.gpsInfoVal}>±{location.accuracy.toFixed(1)}m</Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.noGpsText}>
              {trackingActive
                ? 'Telefonunuzdan GPS uydularına bağlanılıyor, lütfen bekleyin...'
                : 'Konum takibi kapalı. Korumayı başlattığınızda GPS verisi okunacaktır.'}
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070a13',
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#070a13',
  },
  loadingText: {
    marginTop: 12,
    color: '#9ca3af',
    fontSize: 16,
  },
  // Giriş/Kayıt Stilleri
  authCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  logo: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f9fafb',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    padding: 12,
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#f9fafb',
  },
  loginButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 20,
  },
  tabRow: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tabActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  registerRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  registerCol: {
    flex: 1,
  },
  registerButton: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38bdf8',
  },

  // ─── Dashboard Modern Stilleri ───
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  welcomeText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f9fafb',
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  logoutText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  statusCardActive: {
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f9fafb',
  },
  badgeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeDotActive: {
    backgroundColor: '#10b981',
  },
  badgeDotInactive: {
    backgroundColor: '#f59e0b',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textSuccess: {
    color: '#10b981',
  },
  textWarning: {
    color: '#f59e0b',
  },
  statusDescription: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 20,
  },
  mainToggleButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  btnSuccess: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  btnDanger: {
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
  },
  mainToggleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bufferProgressBar: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  bufferProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bufferProgressText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#020617',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },

  // Grid Stilleri
  gridContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  gridCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#38bdf8',
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  metricValueHighlight: {
    fontSize: 15,
    color: '#f9fafb',
    fontWeight: '800',
  },
  gyroInfoText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 12,
    fontWeight: '600',
  },
  subMetricGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  subMetric: {
    flex: 1,
    backgroundColor: '#020617',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  subMetricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 2,
  },
  subMetricVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f9fafb',
  },

  // GPS Kart Stilleri
  gpsCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 20,
  },
  gpsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  gpsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f9fafb',
  },
  gpsStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#a7f3d0',
  },
  gpsInfoWrapper: {
    flexDirection: 'row',
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  gpsInfoCol: {
    flex: 1,
    alignItems: 'center',
  },
  gpsInfoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  gpsInfoVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f9fafb',
  },
  noGpsText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
  },
});
