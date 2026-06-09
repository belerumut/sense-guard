/**
 * ============================================================
 * Alarm Controller'ı (controllers/alertController.js)
 * ============================================================
 *
 * Dashboard'un alarm verilerini okuması, onaylaması ve
 * çözmesi için gerekli endpoint mantıklarını içerir.
 *
 * Endpoint'ler:
 * ─────────────
 * GET    /api/alerts           → Aktif alarmları listele
 * GET    /api/alerts/stats     → Alarm istatistikleri (yüzdelik)
 * GET    /api/alerts/:id       → Tek alarm detayı
 * PATCH  /api/alerts/:id/ack   → Alarmı onayla (acknowledge)
 * PATCH  /api/alerts/:id/resolve → Alarmı çöz (resolve)
 * GET    /api/alerts/patient/:patientId → Hasta alarm geçmişi
 */

const { Alert, User } = require('../models');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const smsService = require('../services/smsService');

/**
 * @desc    Aktif alarmları listele
 * @route   GET /api/alerts
 * @access  Private (admin, monitor)
 */
const getActiveAlerts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    const query = {};

    // Yetki kontrolü: Eğer rol patient ise sadece kendine ait alarmları görsün
    if (req.user.role === 'patient') {
      query.patientId = req.user._id;
    }

    if (status && status !== 'all') {
      query.status = status;
    } else if (!status) {
      query.status = 'active';
    }

    const total = await Alert.countDocuments(query);
    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patientId', 'firstName lastName email phone')
      .lean();

    return apiResponse.success(res, `${alerts.length} alarm`, {
      alerts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Alarm istatistikleri (dashboard yüzdelik oranlar)
 * @route   GET /api/alerts/stats?days=7
 * @access  Private (admin, monitor)
 */
const getAlertStats = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rawStats = await Alert.getAlertStats(startDate, endDate);

    // Toplam alarm sayısını hesapla
    const totalAlerts = rawStats.reduce((sum, s) => sum + s.total, 0);

    // Yüzdelik oranları hesapla
    const stats = rawStats.map((s) => ({
      type: s._id,
      total: s.total,
      percentage: totalAlerts > 0
        ? parseFloat(((s.total / totalAlerts) * 100).toFixed(1))
        : 0,
      bySeverity: s.bySeverity,
    }));

    // Genel durum özeti
    const activeCounts = await Alert.countDocuments({ status: 'active' });
    const acknowledgedCounts = await Alert.countDocuments({ status: 'acknowledged' });
    const resolvedCounts = await Alert.countDocuments({
      status: 'resolved',
      resolvedAt: { $gte: startDate },
    });

    return apiResponse.success(res, 'Alarm istatistikleri', {
      period: { startDate, endDate, days },
      totalAlerts,
      overview: {
        active: activeCounts,
        acknowledged: acknowledgedCounts,
        recentlyResolved: resolvedCounts,
      },
      byType: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Tek alarm detayı
 * @route   GET /api/alerts/:id
 * @access  Private (admin, monitor)
 */
const getAlertById = async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('patientId', 'firstName lastName email phone age medicalNotes emergencyContact')
      .populate('acknowledgedBy', 'firstName lastName')
      .populate('resolvedBy', 'firstName lastName');

    if (!alert) {
      return apiResponse.error(res, 'Alarm bulunamadı', 404);
    }

    return apiResponse.success(res, 'Alarm detayı', { alert });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Alarmı onayla (acknowledge)
 * @route   PATCH /api/alerts/:id/ack
 * @access  Private (admin, monitor)
 */
const acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return apiResponse.error(res, 'Alarm bulunamadı', 404);
    }

    if (alert.status !== 'active') {
      return apiResponse.error(
        res,
        `Bu alarm zaten "${alert.status}" durumunda. Sadece "active" alarmlar onaylanabilir`,
        400
      );
    }

    const updatedAlert = await Alert.acknowledgeAlert(req.params.id, req.user._id);

    logger.info(
      `🔔 Alarm onaylandı: ${req.params.id} | Onaylayan: ${req.user.email}`
    );

    return apiResponse.success(res, 'Alarm başarıyla onaylandı', {
      alert: updatedAlert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Alarmı çöz (resolve)
 * @route   PATCH /api/alerts/:id/resolve
 * @access  Private (admin, monitor)
 *
 * Body: { "note": "Yanlış alarm, hasta test yapıyordu" }
 */
const resolveAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return apiResponse.error(res, 'Alarm bulunamadı', 404);
    }

    if (alert.status === 'resolved') {
      return apiResponse.error(res, 'Bu alarm zaten çözümlenmiş', 400);
    }

    const { note } = req.body;
    const updatedAlert = await Alert.resolveAlert(req.params.id, req.user._id, note);

    logger.info(
      `✅ Alarm çözümlendi: ${req.params.id} | Çözen: ${req.user.email}`
    );

    // Hasta yakınına SMS bilgilendirmesi gönder
    User.findById(updatedAlert.patientId)
      .select('firstName lastName emergencyContact')
      .then((user) => {
        if (user) {
          smsService.sendResolveSms(user, updatedAlert).catch((err) => {
            logger.error(`SMS gönderim hatası (RESOLVED): ${err.message}`);
          });
        }
      })
      .catch((err) => {
        logger.error(`Hasta yakını SMS gönderimi için hasta aranırken hata oluştu: ${err.message}`);
      });

    return apiResponse.success(res, 'Alarm başarıyla çözümlendi', {
      alert: updatedAlert,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Hasta alarm geçmişi
 * @route   GET /api/alerts/patient/:patientId
 * @access  Private (admin, monitor, veya kendi geçmişi)
 */
const getPatientAlerts = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 100;

    // Yetki kontrolü: patient sadece kendi geçmişini görebilir
    if (
      req.user.role === 'patient' &&
      req.user._id.toString() !== patientId
    ) {
      return apiResponse.error(
        res,
        'Sadece kendi alarm geçmişinizi görüntüleyebilirsiniz',
        403
      );
    }

    const alerts = await Alert.getPatientAlertHistory(patientId, Math.min(limit, 500));

    return apiResponse.success(res, `${alerts.length} alarm kaydı`, {
      alerts,
      count: alerts.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Alarm sil (Kalıcı olarak siler)
 * @route   DELETE /api/alerts/:id
 * @access  Private (admin)
 */
const deleteAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return apiResponse.error(res, 'Alarm bulunamadı', 404);
    }

    await alert.deleteOne();

    logger.info(`🚨 Alarm silindi: ${req.params.id} | Silen: ${req.user.email}`);

    return apiResponse.success(res, 'Alarm başarıyla silindi');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Çoklu alarm sil (Kalıcı olarak siler)
 * @route   POST /api/alerts/bulk-delete
 * @access  Private (admin)
 */
const bulkDeleteAlerts = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return apiResponse.error(res, 'Silinecek alarmların ID listesi belirtilmedi', 400);
    }

    const result = await Alert.deleteMany({ _id: { $in: ids } });

    logger.info(`🚨 Çoklu alarm silindi: ${ids.length} adet | Silen: ${req.user.email}`);

    return apiResponse.success(res, `${result.deletedCount} alarm başarıyla silindi`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveAlerts,
  getAlertStats,
  getAlertById,
  acknowledgeAlert,
  resolveAlert,
  getPatientAlerts,
  deleteAlert,
  bulkDeleteAlerts,
};
