/**
 * API Servis Modülü — Axios instance ve interceptor'lar
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request Interceptor: JWT Token Ekleme ───
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor: Hata Yönetimi ───
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth API ───
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

// ─── User API ───
export const userAPI = {
  getUsers: (params) => api.get('/users', { params }),
  getUserById: (id) => api.get(`/users/${id}`),
  getPatients: () => api.get('/users/patients/list'),
  getLiveLocation: (id) => api.get(`/users/${id}/live-location`),
  updateUser: (id, data) => api.put(`/users/${id}`, data),
  updateUserRole: (id, role) => api.put(`/users/${id}/role`, { role }),
  deleteUser: (id) => api.delete(`/users/${id}`),
  bulkDeleteUsers: (ids) => api.post('/users/bulk-delete', { ids }),
};

// ─── Sensor API ───
export const sensorAPI = {
  getLatest: (userId, limit = 100) => api.get(`/sensor/latest/${userId}`, { params: { limit } }),
  getByRange: (userId, start, end) =>
    api.get(`/sensor/range/${userId}`, { params: { start, end } }),
};

// ─── Alert API ───
export const alertAPI = {
  getActive: (limit = 20, status, page = 1) => api.get('/alerts', { params: { limit, status, page } }),
  getStats: (days = 7) => api.get('/alerts/stats', { params: { days } }),
  getById: (id) => api.get(`/alerts/${id}`),
  acknowledge: (id) => api.patch(`/alerts/${id}/ack`),
  resolve: (id, note) => api.patch(`/alerts/${id}/resolve`, { note }),
  getPatientAlerts: (patientId) => api.get(`/alerts/patient/${patientId}`),
  deleteAlert: (id) => api.delete(`/alerts/${id}`),
  bulkDeleteAlerts: (ids) => api.post('/alerts/bulk-delete', { ids }),
};

// ─── Health API ───
export const healthAPI = {
  check: () => api.get('/health'),
};

// ─── System Config API ───
export const systemAPI = {
  getSettings: () => api.get('/system/settings'),
  updateSettings: (data) => api.put('/system/settings', data),
};

export default api;
