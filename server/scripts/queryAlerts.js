const mongoose = require('mongoose');
require('dotenv').config();
const { Alert, User } = require('../models');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mobile-safety-platform');
  console.log('Connected to MongoDB');

  const users = await User.find({});
  console.log('All users:');
  users.forEach(u => {
    console.log(`- Email: ${u.email}, Role: ${u.role}, ID: ${u._id}`);
  });

  const user = users.find(u => u.role === 'patient');
  if (!user) {
    console.log('No patient found');
    process.exit(1);
  }
  console.log(`Using patient ID: ${user._id}`);

  const alerts = await Alert.find({ patientId: user._id }).sort({ createdAt: -1 }).limit(10);
  console.log('Recent alerts:');
  alerts.forEach(a => {
    console.log(`- Type: ${a.alertType}, Status: ${a.status}, CreatedAt: ${a.createdAt}, Message: ${a.message}`);
  });

  mongoose.connection.close();
}

run().catch(console.error);
