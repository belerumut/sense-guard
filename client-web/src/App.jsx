import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Layout/Sidebar';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';
import AlertsPage from './pages/AlertsPage';
import { PatientsListPage, PatientDetailPage } from './pages/PatientsPage';
import ProfilePage from './pages/ProfilePage';
import UsersPage from './pages/UsersPage';

// Korumalı rota bileşeni
const ProtectedLayout = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-layout animate-fade-in">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

// Admin rolü için korumalı rota koruyucusu
const AdminLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

function App() {
  useEffect(() => {
    const appName = import.meta.env.VITE_APP_NAME || 'SafeGuard';
    document.title = appName;
  }, []);

  return (
    <AuthProvider>
      <Routes>
        {/* Giriş ve Kayıt Sayfaları */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Korumalı Rotalar */}
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/patients" element={<PatientsListPage />} />
          <Route path="/patients/:id" element={<PatientDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          
          {/* Sadece Admin Rotaları */}
          <Route element={<AdminLayout />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
        </Route>

        {/* Bilinmeyen rotaları anasayfaya yönlendir */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
