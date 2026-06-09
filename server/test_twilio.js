require('dotenv').config();
const twilio = require('twilio');

async function test() {
  console.log('Testing twilio connection...');
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
      body: 'Test mesajı',
      from: process.env.TWILIO_PHONE_NUMBER,
      to: '+905555555555' // just a dummy number, it should fail with "unverified number" rather than ENOTFOUND if DNS is fine
    });
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
