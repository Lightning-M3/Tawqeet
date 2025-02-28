const mongoose = require('mongoose');
const logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 ثواني
        this.isConnecting = false;
    }

    async connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        let retries = this.maxRetries;
        while (retries > 0) {
            try {
                await mongoose.connect(process.env.MONGO_URI);
                logger.log('info', 'تم الاتصال بقاعدة البيانات بنجاح');
                this.isConnecting = false;
                this.setupEventHandlers();
                return;
            } catch (error) {
                retries--;
                logger.log('error', `فشل الاتصال بقاعدة البيانات. محاولات متبقية: ${retries}`, { error });
                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }

        logger.log('error', 'فشل الاتصال بقاعدة البيانات بعد عدة محاولات', { critical: true });
        process.exit(1);
    }

    setupEventHandlers() {
        mongoose.connection.on('disconnected', () => {
            logger.log('warn', 'انقطع الاتصال بقاعدة البيانات');
            this.connect();
        });

        mongoose.connection.on('error', (error) => {
            logger.log('error', 'خطأ في اتصال قاعدة البيانات', { error });
        });
    }
}

module.exports = new DatabaseManager(); 