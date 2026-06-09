const mongoose = require('mongoose');
require('dotenv').config();
const { SensorData, User } = require('../models');

const variance = (arr) => {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mobile-safety-platform');
  console.log('Connected to MongoDB');

  const user = await User.findOne({ email: 'hasta1@test.com' });
  if (!user) {
    console.log('Patient not found');
    process.exit(1);
  }

  const inactivityCheckHours = 0.009; // 32.4 seconds
  const hoursAgo = new Date();
  hoursAgo.setTime(hoursAgo.getTime() - Math.round(inactivityCheckHours * 3600 * 1000));
  
  console.log(`Checking data since: ${hoursAgo}`);

  const recentData = await SensorData.find({
    userId: user._id,
    timestamp: { $gte: hoursAgo },
  })
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();

  console.log(`Found ${recentData.length} sensor readings in the last ${inactivityCheckHours} hours (${inactivityCheckHours * 3600} seconds).`);

  if (recentData.length > 0) {
    const magnitudes = recentData
      .map((d) => d.accelerometer?.magnitude)
      .filter((m) => m != null);

    console.log(`Number of magnitudes: ${magnitudes.length}`);
    if (magnitudes.length > 0) {
      const motionVariance = variance(magnitudes);
      console.log(`Motion Variance: ${motionVariance.toFixed(6)}g`);
      console.log(`Threshold: 0.05g`);
      console.log(`Is inactive: ${motionVariance < 0.05}`);
    }
  }

  mongoose.connection.close();
}

run().catch(console.error);
