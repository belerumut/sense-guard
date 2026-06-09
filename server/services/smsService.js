const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const logFilePath = path.join(__dirname, '../logs/sms.log');

// Log dizininin varlığını doğrula
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const axios = require('axios');

/**
 * Türkçe karakterleri GSM-7 uyumlu ASCII karakterlerine dönüştürür.
 * Twilio deneme hesabı gibi kısıtlı ortamlarda Unicode karakterleri (UCS-2) 
 * nedeniyle mesajın bölünmesini (ve dolayısıyla gönderilememesini) engeller.
 */
const cleanTurkishChars = (text) => {
  if (!text) return '';
  return text
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C');
};

/**
 * SMS Gönderici (Twilio veya Textbelt API)
 * 
 * @param {string} toPhone - Alıcı telefon numarası
 * @param {string} toName - Alıcı adı soyadı
 * @param {string} message - SMS içeriği
 */
const sendSms = async (toPhone, toName, message) => {
  const provider = process.env.SMS_PROVIDER || 'twilio';

  // Telefon numarasını uluslararası formata çevir (Örn: 0555... -> +90555...)
  let formattedPhone = toPhone;
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '+90' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('+')) {
    formattedPhone = '+90' + formattedPhone; // Varsayılan olarak Türkiye
  }

  // Türkçe karakterleri temizle ve mesajı GSM-7 uyumlu hale getir
  let cleanMessage = cleanTurkishChars(message);

  // Twilio deneme hesabı başlığı "Sent from your Twilio trial account - " (38 karakter) eklediği için
  // ve deneme hesapları çoklu segment SMS gönderimine izin vermediği için mesajı en fazla 120 karaktere sınırlandırıyoruz.
  if (provider === 'twilio') {
    if (cleanMessage.length > 120) {
      cleanMessage = cleanMessage.substring(0, 117) + '...';
    }
  }

  try {
    if (provider === 'local' || provider === 'log') {
      logger.info(`✉️  [Local SMS Kaydedildi] Alıcı: ${toName} (${formattedPhone})`);
    } else if (provider === 'twilio') {
      // Twilio Entegrasyonu
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromPhone = process.env.TWILIO_PHONE_NUMBER;
      
      if (!accountSid || !authToken || !fromPhone) {
        throw new Error('Twilio ayarları eksik. Lütfen .env dosyasını kontrol edin.');
      }

      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      
      await client.messages.create({
        body: cleanMessage,
        from: fromPhone,
        to: formattedPhone
      });
      
      logger.info(`✉️  [Twilio SMS Gönderildi] Alıcı: ${toName} (${formattedPhone})`);

    } else {
      // Textbelt Ücretsiz SMS API
      const textbeltKey = process.env.TEXTBELT_KEY || 'textbelt';
      const response = await axios.post('https://textbelt.com/text', {
        phone: formattedPhone,
        message: cleanMessage,
        key: textbeltKey,
      });

      if (response.data.success) {
        logger.info(`✉️  [Textbelt SMS Gönderildi] Alıcı: ${toName} (${formattedPhone}) | Kalan kota: ${response.data.quotaRemaining}`);
      } else {
        logger.error(`Textbelt SMS gönderim hatası: ${response.data.error}`);
        throw new Error(response.data.error);
      }
    }

    // Yedek olarak log dosyasına da yazalım (geçmiş takibi için)
    const timestamp = new Date().toLocaleString('tr-TR');
    const logEntry = `[${timestamp}] ALICI: ${toName} (${formattedPhone}) | MESAJ: ${cleanMessage}\n`;
    fs.appendFileSync(logFilePath, logEntry);

  } catch (error) {
    logger.error(`SMS gönderim hatası (${provider}): ${error.message}`);
  }
};

/**
 * Bir alarm tetiklendiğinde hasta yakınına giden uyarı SMS'i
 * 
 * @param {Object} user - Hasta kullanıcı nesnesi
 * @param {Object} alert - Oluşturulan alarm nesnesi
 */
const sendAlarmSms = async (user, alert) => {
  if (!user.emergencyContact || !user.emergencyContact.phone) {
    logger.warn(`[SMS] Hasta ${user.firstName} ${user.lastName} için acil durum kişisi veya telefon numarası bulunamadı.`);
    return;
  }

  const { name: contactName, phone: contactPhone, relationship } = user.emergencyContact;
  const patientName = `${user.firstName} ${user.lastName}`;

  const alertTypeTr = {
    'FALL_DETECTED': 'Düşme Algılama',
    'INACTIVITY_LONG': 'Uzun Süreli Hareketsizlik',
    'GPS_STAGNANT': 'Konum Sabitliği (GPS)',
    'NIGHT_ACTIVITY': 'Olağandışı Gece Aktivitesi',
  }[alert.alertType] || alert.alertType;

  const severityTr = {
    'low': 'Düşük',
    'medium': 'Orta',
    'high': 'Yüksek',
    'critical': 'Kritik',
  }[alert.severity] || alert.severity;

  const appName = process.env.APP_NAME || 'SafeGuard';
  const message = `${appName} UYARISI: Sayın ${contactName} (${relationship}), yakınınız ${patientName} için bir ${alertTypeTr} (Şiddet: ${severityTr}) alarmı oluşmuştur. Detay: ${alert.message}`;

  await sendSms(contactPhone, contactName, message);
};

/**
 * Bir alarm çözüldüğünde hasta yakınına giden bilgilendirme SMS'i
 * 
 * @param {Object} user - Hasta kullanıcı nesnesi
 * @param {Object} alert - Çözümlenen alarm nesnesi
 */
const sendResolveSms = async (user, alert) => {
  if (!user.emergencyContact || !user.emergencyContact.phone) {
    return;
  }

  const { name: contactName, phone: contactPhone, relationship } = user.emergencyContact;
  const patientName = `${user.firstName} ${user.lastName}`;

  const alertTypeTr = {
    'FALL_DETECTED': 'Düşme Algılama',
    'INACTIVITY_LONG': 'Uzun Süreli Hareketsizlik',
    'GPS_STAGNANT': 'Konum Sabitliği (GPS)',
    'NIGHT_ACTIVITY': 'Olağandışı Gece Aktivitesi',
  }[alert.alertType] || alert.alertType;

  const appName = process.env.APP_NAME || 'SafeGuard';
  const message = `${appName} BILGILENDIRMESI: Sayın ${contactName} (${relationship}), yakınınız ${patientName} için oluşan ${alertTypeTr} alarmı çözümlenmiştir ve hastanızın durumu şu anda GÜVENDE olarak işaretlenmiştir.`;

  await sendSms(contactPhone, contactName, message);
};

module.exports = {
  sendSms,
  sendAlarmSms,
  sendResolveSms,
};
