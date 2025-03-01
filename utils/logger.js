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

        // إضافة Console في بيئة التطوير
        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.combine(
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
        // تصفية السجلات غير الضرورية في بيئة الإنتاج
        if (process.env.NODE_ENV === 'production' && level === 'debug') {
            return;
        }
        
        // تنظيف بيانات السجل
        const safeData = this._sanitizeLogData(data);
        
        this.logger.log(level, message, { ...safeData, timestamp: new Date() });
    }

    error(message, error = null, critical = false) {
        const errorData = {
            message,
            stack: error?.stack,
            timestamp: new Date(),
            critical
        };

        // تنظيف Stack Trace الطويل
        if (errorData.stack && errorData.stack.length > 2000) {
            errorData.stack = errorData.stack.substring(0, 2000) + '... [truncated]';
        }

        this.logger.error(message, errorData);

        // إرسال الأخطاء المهمة عبر Webhook
        if (critical && this.webhook) {
            // استخدام تأخير لتجنب طلبات Webhook المتزامنة
            setTimeout(() => this.notifyError(errorData), 100);
        }
    }

    async notifyError(errorData) {
        try {
            // منع إرسال إشعارات متكررة بنفس الخطأ في فترة زمنية قصيرة
            const errorKey = `${errorData.message.substring(0, 50)}`;
            if (this._recentErrors && this._recentErrors[errorKey]) {
                const timeSinceLastError = Date.now() - this._recentErrors[errorKey];
                if (timeSinceLastError < 300000) { // 5 دقائق
                    return;
                }
            }
            
            if (!this._recentErrors) {
                this._recentErrors = {};
            }
            this._recentErrors[errorKey] = Date.now();
            
            // تقصير وصف الخطأ إذا كان طويلًا
            const description = errorData.message.length > 1500 ? 
                errorData.message.substring(0, 1500) + '... [truncated]' : 
                errorData.message;

            await this.webhook.send({
                embeds: [{
                    title: '🚨 خطأ حرج',
                    description: description,
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
            this.logger.error('Failed to send webhook notification', { error: error.message });
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
    
    // دالة خاصة لتنظيف بيانات السجل
    _sanitizeLogData(data) {
        if (!data || typeof data !== 'object') return data;
        
        const safeData = {};
        Object.keys(data).forEach(key => {
            // تجاهل الكائنات الكبيرة والمعقدة
            if (data[key] instanceof Buffer) {
                safeData[key] = '[Buffer]';
            } else if (data[key] instanceof Error) {
                safeData[key] = { 
                    message: data[key].message,
                    name: data[key].name,
                    stack: data[key].stack?.substring(0, 500)
                };
            } else if (typeof data[key] === 'object' && data[key] !== null) {
                try {
                    const str = JSON.stringify(data[key]);
                    safeData[key] = str.length > 1000 ? '[Large Object]' : data[key];
                } catch (e) {
                    safeData[key] = '[Circular or Unstringifiable Object]';
                }
            } else {
                safeData[key] = data[key];
            }
        });
        
        return safeData;
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