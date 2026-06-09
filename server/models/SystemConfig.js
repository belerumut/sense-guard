const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Anahtar alanı zorunludur'],
      unique: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Değer alanı zorunludur'],
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

module.exports = SystemConfig;
