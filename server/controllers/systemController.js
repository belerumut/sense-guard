const { SystemConfig } = require('../models');
const apiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Default config values as backup
const DEFAULTS = {
  INACTIVITY_CHECK_HOURS: 2,
  GPS_CHECK_HOURS: 3,
};

/**
 * @desc    Get system settings (inactivity hours, GPS stagnant hours)
 * @route   GET /api/system/settings
 * @access  Private (admin)
 */
const getSettings = async (req, res, next) => {
  try {
    const configs = await SystemConfig.find({
      key: { $in: ['INACTIVITY_CHECK_HOURS', 'GPS_CHECK_HOURS'] },
    });

    const settings = { ...DEFAULTS };
    configs.forEach((c) => {
      settings[c.key] = parseFloat(c.value);
    });

    return apiResponse.success(res, 'Sistem ayarları başarıyla getirildi', { settings });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update system settings
 * @route   PUT /api/system/settings
 * @access  Private (admin)
 */
const updateSettings = async (req, res, next) => {
  try {
    const { INACTIVITY_CHECK_HOURS, GPS_CHECK_HOURS } = req.body;

    if (INACTIVITY_CHECK_HOURS !== undefined) {
      const hoursVal = parseFloat(INACTIVITY_CHECK_HOURS);
      if (isNaN(hoursVal) || hoursVal <= 0) {
        return apiResponse.error(res, 'Hareketsizlik süresi pozitif bir sayı olmalıdır', 400);
      }
      await SystemConfig.findOneAndUpdate(
        { key: 'INACTIVITY_CHECK_HOURS' },
        { value: hoursVal, description: 'Hareketsizlik kontrol periyodu (saat)' },
        { upsert: true, new: true }
      );
      logger.info(`⚙️ Sistem ayarı güncellendi: INACTIVITY_CHECK_HOURS = ${hoursVal}`);
    }

    if (GPS_CHECK_HOURS !== undefined) {
      const gpsVal = parseFloat(GPS_CHECK_HOURS);
      if (isNaN(gpsVal) || gpsVal <= 0) {
        return apiResponse.error(res, 'GPS hareketsizlik süresi pozitif bir sayı olmalıdır', 400);
      }
      await SystemConfig.findOneAndUpdate(
        { key: 'GPS_CHECK_HOURS' },
        { value: gpsVal, description: 'GPS hareketsizlik kontrol periyodu (saat)' },
        { upsert: true, new: true }
      );
      logger.info(`⚙️ Sistem ayarı güncellendi: GPS_CHECK_HOURS = ${gpsVal}`);
    }

    return apiResponse.success(res, 'Sistem ayarları başarıyla güncellendi');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
