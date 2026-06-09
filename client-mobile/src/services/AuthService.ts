import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Varsayılan API URL (Geliştirme ortamında bilgisayar IP'sine göre güncellenebilir)
// Android simülatörü için 10.0.2.2, iOS için localhost kullanılır.
export const DEFAULT_API_URL = 'http://localhost:5000/api';

const TOKEN_KEY = '@safeguard_token';
const USER_KEY = '@safeguard_user';
const API_URL_KEY = '@safeguard_api_url';

export interface User {
  id: string;
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

export const getApiUrl = async (): Promise<string> => {
  try {
    const savedUrl = await AsyncStorage.getItem(API_URL_KEY);
    return savedUrl || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
};

export const setApiUrl = async (url: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(API_URL_KEY, url);
  } catch (error) {
    console.error('API URL kaydetme hatası:', error);
  }
};

export const login = async (email: string, password: string): Promise<User> => {
  const apiUrl = await getApiUrl();
  const response = await axios.post(`${apiUrl}/auth/login`, {
    email,
    password,
  });

  const { token, user } = response.data.data;

  if (user.role !== 'patient') {
    throw new Error('Sadece hasta (patient) rolündeki kullanıcılar bu uygulamaya giriş yapabilir.');
  }

  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

  return user;
};

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  age?: number;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
}

export const register = async (data: RegisterData): Promise<User> => {
  const apiUrl = await getApiUrl();
  const response = await axios.post(`${apiUrl}/auth/register`, {
    ...data,
    role: 'patient', // Mobil uygulamadan sadece hasta kaydı yapılabilir
  });

  const { token, user } = response.data.data;

  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

  return user;
};

export const logout = async (): Promise<void> => {
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(USER_KEY);
};

export const getToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(TOKEN_KEY);
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const userStr = await AsyncStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
};
