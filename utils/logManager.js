const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

// إنشاء مجلد السجلات إذا لم يكن موجوداً
const logsDir = path.join(__dirname, '../logs');
fs.mkdir(logsDir, { recursive: true }).catch(console.error);

// إعداد نظام تدوير السجلات
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // سجلات الأخطاء
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '10m', // 10 ميجابايت
      maxFiles: '14d', // الاحتفاظ بالسجلات لمدة 14 يوم
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    // سجلات عامة
    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// إضافة سجل في وحدة التحكم في بيئة التطوير
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// دالة لتنظيف السجلات القديمة
async function cleanupOldLogs() {
  try {
    const files = await fs.readdir(logsDir);
    const now = Date.now();
    const maxAge = 14 * 24 * 60 * 60 * 1000; // 14 يوم

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        console.log(`تم حذف ملف السجل القديم: ${file}`);
      }
    }
  } catch (error) {
    console.error('خطأ في تنظيف السجلات القديمة:', error);
  }
}

// تشغيل تنظيف السجلات كل 24 ساعة
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// دالة لتسجيل الأحداث
function logEvent(type, data, error = null) {
  const logData = {
    timestamp: new Date(),
    type,
    data,
    error: error ? {
      message: error.message,
      stack: error.stack
    } : null
  };

  if (error) {
    logger.error(logData);
  } else {
    logger.info(logData);
  }
}

module.exports = {
  logger,
  logEvent,
  cleanupOldLogs
}; 