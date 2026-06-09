const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Alert = require('./models/Alert');
const smsService = require('./services/smsService');

async function runTest() {
  try {
    console.log('Connecting to MongoDB...', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mobile-safety-platform');
    console.log('MongoDB connected');

    const email = 'keentom100@gmail.com';
    const user = await User.findOne({ email });

    if (!user) {
      console.error(`User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`User found: ${user.firstName} ${user.lastName}`);
    
    if (!user.emergencyContact || !user.emergencyContact.phone) {
      console.log('User does not have an emergency contact phone configured. SMS will not be sent properly.');
    } else {
      console.log(`Emergency Contact: ${user.emergencyContact.name} - ${user.emergencyContact.phone}`);
    }

    // Alarm oluştur
    const newAlert = new Alert({
      patientId: user._id,
      alertType: 'INACTIVITY_LONG',
      severity: 'high',
      message: 'Test: Hasta 60 dakikadan uzun süredir hareketsiz (Test Alarmı)!',
      location: null,
      status: 'active'
    });

    await newAlert.save();
    console.log('Alert saved to DB successfully.');

    // SMS gönder
    console.log('Attempting to send SMS via twilio...');
    await smsService.sendAlarmSms(user, newAlert);
    console.log('SMS process finished. Check the logs and your phone.');

    process.exit(0);
  } catch (error) {
    console.error('Test script error:', error);
    process.exit(1);
  }
}

runTest();
