/**
 * ============================================================
 * Kullanıcı Controller'ı (controllers/userController.js)
 * ============================================================
 *
 * Kullanıcı yönetimi endpoint mantıklarını içerir.
 *
 * Endpoint'ler:
 * ─────────────
 * GET    /api/users               → Kullanıcıları listele
 * GET    /api/users/:id           → Kullanıcı detayı
 * GET    /api/users/:id/live-location → Canlı konum
 * PUT    /api/users/:id           → Kullanıcı güncelle
 * DELETE /api/users/:id           → Kullanıcı sil
 * GET    /api/users/patients/list → Tüm hastaları listele
 */

const { User, SensorData, Alert } = require('../models');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * @desc    Tüm kullanıcıları listele (filtreleme destekli)
 * @route   GET /api/users?role=patient&active=true
 * @access  Private (admin, monitor)
 */
const getUsers = async (req, res, next) => {
  try {
    const { role, active, search } = req.query;
    const filter = {};

    // Rol filtresi
    if (role && ['admin', 'monitor', 'patient'].includes(role)) {
      filter.role = role;
    }

    // Aktiflik filtresi
    if (active !== undefined) {
      filter.isActive = active === 'true';
    }

    // Monitor kullanıcılar sadece hastaları görebilir
    if (req.user.role === 'monitor') {
      filter.role = 'patient';
    }

    let query = User.find(filter).select('-password');

    // Metin arama (ad/soyad)
    if (search) {
      query = User.find({
        ...filter,
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }).select('-password');
    }

    const users = await query.sort({ createdAt: -1 }).lean();

    return apiResponse.success(res, `${users.length} kullanıcı bulundu`, {
      users,
      count: users.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tek kullanıcı detayı
 * @route   GET /api/users/:id
 * @access  Private (admin, monitor, veya kendi profili)
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return apiResponse.error(res, 'Kullanıcı bulunamadı', 404);
    }

    // Monitor sadece patient görebilir
    if (req.user.role === 'monitor' && user.role !== 'patient') {
      return apiResponse.error(res, 'Bu kullanıcıya erişim yetkiniz yok', 403);
    }

    // Patient sadece kendini görebilir
    if (req.user.role === 'patient' && req.user._id.toString() !== req.params.id) {
      return apiResponse.error(res, 'Sadece kendi profilinizi görüntüleyebilirsiniz', 403);
    }

    return apiResponse.success(res, 'Kullanıcı detayı', { user });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Kullanıcının canlı konumunu getir
 * @route   GET /api/users/:id/live-location
 * @access  Private (admin, monitor)
 *
 * Teknik Doküman → Bölüm 5
 */
const getLiveLocation = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('firstName lastName lastKnownLocation lastDataReceivedAt isActive');

    if (!user) {
      return apiResponse.error(res, 'Kullanıcı bulunamadı', 404);
    }

    // Son sensör verisinden konum bilgisi al
    const { SensorData } = require('../models');
    const lastLocationData = await SensorData.findOne({
      userId: req.params.id,
      'location.latitude': { $exists: true, $ne: null },
    })
      .sort({ timestamp: -1 })
      .select('location timestamp')
      .lean();

    const locationInfo = {
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        isActive: user.isActive,
      },
      location: lastLocationData?.location || null,
      lastKnownLocation: user.lastKnownLocation || null,
      lastUpdate: lastLocationData?.timestamp || user.lastDataReceivedAt || null,
      isStale: lastLocationData
        ? (Date.now() - new Date(lastLocationData.timestamp).getTime()) > 10 * 60 * 1000 // 10 dk'dan eski
        : true,
    };

    return apiResponse.success(res, 'Canlı konum bilgisi', locationInfo);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Kullanıcı bilgilerini güncelle
 * @route   PUT /api/users/:id
 * @access  Private (admin, veya kendi profili)
 */
const updateUser = async (req, res, next) => {
  try {
    // Güncellenebilir alanlar (güvenlik: role ve password burada değiştirilemez)
    const allowedFields = [
      'firstName', 'lastName', 'phone', 'age',
      'medicalNotes', 'emergencyContact', 'isActive',
    ];

    // Admin ek alanları değiştirebilir
    if (req.user.role === 'admin') {
      allowedFields.push('role');
      allowedFields.push('email');
    }

    // Sadece izin verilen alanları filtrele
    const updates = {};
    Object.keys(req.body).forEach((key) => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // Yetki kontrolü
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return apiResponse.error(res, 'Sadece kendi profilinizi güncelleyebilirsiniz', 403);
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) {
      return apiResponse.error(res, 'Kullanıcı bulunamadı', 404);
    }

    logger.info(`Kullanıcı güncellendi: ${user.email} | Güncelleyen: ${req.user.email}`);

    return apiResponse.success(res, 'Kullanıcı başarıyla güncellendi', { user });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Kullanıcı sil (Kalıcı olarak siler ve ilişkili verileri temizler)
 * @route   DELETE /api/users/:id
 * @access  Private (admin)
 */
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return apiResponse.error(res, 'Kullanıcı bulunamadı', 404);
    }

    // Admin kendini silemez
    if (req.user._id.toString() === req.params.id) {
      return apiResponse.error(res, 'Kendi hesabınızı silemezsiniz', 400);
    }

    // İlişkili sensör verilerini ve alarmlarını da temizleyelim (cascading delete)
    await SensorData.deleteMany({ userId: user._id });
    await Alert.deleteMany({ patientId: user._id });
    await user.deleteOne();

    logger.info(`Kullanıcı kalıcı olarak silindi: ${user.email} | İşlemi yapan: ${req.user.email}`);

    return apiResponse.success(res, 'Kullanıcı başarıyla kalıcı olarak silindi', {
      user: { id: user._id, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Çoklu kullanıcı sil (Kalıcı olarak siler ve ilişkili verileri temizler)
 * @route   POST /api/users/bulk-delete
 * @access  Private (admin)
 */
const bulkDeleteUsers = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return apiResponse.error(res, 'Silinecek kullanıcıların ID listesi belirtilmedi', 400);
    }

    // Admin kendisini silemez
    if (ids.includes(req.user._id.toString())) {
      return apiResponse.error(res, 'Silinecek listesinde kendi hesabınız bulunamaz', 400);
    }

    // İlişkili sensör verilerini ve alarmlarını da temizleyelim (cascading delete)
    await SensorData.deleteMany({ userId: { $in: ids } });
    await Alert.deleteMany({ patientId: { $in: ids } });
    const result = await User.deleteMany({ _id: { $in: ids } });

    logger.info(`Kullanıcılar kalıcı olarak silindi: ${ids.length} adet | İşlemi yapan: ${req.user.email}`);

    return apiResponse.success(res, `${result.deletedCount} kullanıcı başarıyla silindi`);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tüm aktif hastaları listele (harita ve izleme için)
 * @route   GET /api/users/patients/list
 * @access  Private (admin, monitor)
 */
const getPatientsList = async (req, res, next) => {
  try {
    const patients = await User.find({ role: 'patient', isActive: true })
      .select('firstName lastName email phone age lastKnownLocation lastDataReceivedAt emergencyContact')
      .sort({ firstName: 1 })
      .lean();

    return apiResponse.success(res, `${patients.length} hasta bulundu`, {
      patients,
      count: patients.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Kullanıcı rolünü güncelle
 * @route   PUT /api/users/:id/role
 * @access  Private (admin)
 */
const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const allowedRoles = ['admin', 'monitor', 'patient'];

    if (!role || !allowedRoles.includes(role)) {
      return apiResponse.error(res, 'Geçersiz rol belirtildi', 400);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return apiResponse.error(res, 'Kullanıcı bulunamadı', 404);
    }

    logger.info(`Kullanıcı rolü güncellendi: ${user.email} -> ${role} | Yapan: ${req.user.email}`);

    return apiResponse.success(res, 'Kullanıcı rolü başarıyla güncellendi', { user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  getLiveLocation,
  updateUser,
  deleteUser,
  getPatientsList,
  updateUserRole,
  bulkDeleteUsers,
};
