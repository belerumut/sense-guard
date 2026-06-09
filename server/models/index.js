/**
 * ============================================================
 * Model Index Dosyası (models/index.js)
 * ============================================================
 *
 * Tüm Mongoose modellerini tek bir noktadan dışa aktarır.
 * Kullanım: const { User, SensorData, Alert } = require('./models');
 */

const User = require('./User');
const SensorData = require('./SensorData');
const Alert = require('./Alert');
const SystemConfig = require('./SystemConfig');

module.exports = {
  User,
  SensorData,
  Alert,
  SystemConfig,
};
