const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { WebhookClient } = require('discord.js');
require('winston-daily-rotate-file');

class Logger {
    constructor() {
        this.logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir);
        }

        // إعداد Winston
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                // ملف للأخطاء
                new winston.transports.DailyRotateFile({
                    filename: path.join(this.logsDir, 'error-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    maxFiles: '14d' // الاحتفاظ بالسجلات لمدة 14 يوم
                }),
                // ملف لجميع المستويات
                new winston.transports.DailyRotateFile({
                    filename: path.join(this.logsDir, 'combined-%DATE%.log'),
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '7d' // الاحتفاظ بالسجلات لمدة 7 أيام
                })
            ]
        });

        // إضافة Console في بيئة التطوير مع فلتر للرسائل
        if (process.env.NODE_ENV !== 'production') {
            // إنشاء فلتر لمنع رسائل تحديث حالة البوت من الظهور في الكونسول
            const consoleFilter = winston.format((info) => {
                // التحقق مما إذا كانت الرسالة تتعلق بتحديث حالة البوت
                if (info.message && info.message.includes('تم تحديث حالة البوت')) {
                    return false; // لا تظهر في الكونسول
                }
                return info; // إظهار باقي الرسائل
            });
            
            this.logger.add(new winston.transports.Console({
                format: winston.format.combine(
                    consoleFilter(),
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }));
        }

        // إعداد Webhook للإشعارات المهمة
        if (process.env.ERROR_WEBHOOK_URL) {
            this.webhook = new WebhookClient({ url: process.env.ERROR_WEBHOOK_URL });
        }
    }

    log(level, message, data = {}) {
        this.logger.log(level, message, { ...data, timestamp: new Date() });
    }

    error(message, error = null, critical = false) {
        const errorData = {
            message,
            stack: error?.stack,
            timestamp: new Date(),
            critical
        };

        this.logger.error(message, errorData);

        // إرسال الأخطاء المهمة عبر Webhook
        if (critical && this.webhook) {
            this.notifyError(errorData);
        }
    }

    async notifyError(errorData) {
        try {
            await this.webhook.send({
                embeds: [{
                    title: '🚨 خطأ حرج',
                    description: errorData.message,
                    fields: [
                        {
                            name: 'Stack Trace',
                            value: errorData.stack?.substring(0, 1000) || 'No stack trace',
                            inline: false
                        },
                        {
                            name: 'الوقت',
                            value: errorData.timestamp.toLocaleString('en-GB', {
                                timeZone: 'Asia/Riyadh'
                            }),
                            inline: true
                        }
                    ],
                    color: 0xff0000,
                    timestamp: new Date()
                }]
            });
        } catch (error) {
            this.logger.error('Failed to send webhook notification', error);
        }
    }

    info(message, data = {}) {
        this.log('info', message, data);
    }

    warn(message, data = {}) {
        this.log('warn', message, data);
    }

    debug(message, data = {}) {
        this.log('debug', message, data);
    }

    // تنظيف السجلات القديمة
    async cleanup() {
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 يوم
        const now = Date.now();

        const files = fs.readdirSync(this.logsDir);
        for (const file of files) {
            const filePath = path.join(this.logsDir, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                this.debug(`Deleted old log file: ${file}`);
            }
        }
    }
}

module.exports = new Logger();