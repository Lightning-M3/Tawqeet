const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const logger = require('./logger');
const mongoose = require('mongoose');

class MaintenanceSystem {
    constructor() {
        this.backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir);
        }
    }

    // عمل نسخة احتياطية لقاعدة البيانات
    async backupDatabase() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.backupDir, `backup-${timestamp}`);

        try {
            const uri = process.env.MONGO_URI;
            const dbName = uri.split('/').pop().split('?')[0];
            const command = `mongodump --uri="${uri}" --out="${backupPath}"`;
            
            return new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        logger.error('Database backup failed:', error);
                        reject(error);
                        return;
                    }
                    logger.info(`Database backup created at ${backupPath}`);
                    resolve(backupPath);
                });
            });
        } catch (error) {
            logger.error('Backup creation failed:', error);
            throw error;
        }
    }

    // تنظيف النسخ الاحتياطية القديمة
    async cleanupOldBackups() {
        try {
            const maxAge = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();

            const files = fs.readdirSync(this.backupDir);
            for (const file of files) {
                const filePath = path.join(this.backupDir, file);
                const stats = fs.statSync(filePath);

                if (now - stats.mtime.getTime() > maxAge) {
                    fs.rmSync(filePath, { recursive: true });
                    logger.info(`Deleted old backup: ${file}`);
                }
            }
        } catch (error) {
            logger.error('Backup cleanup failed:', error);
        }
    }

    // تنظيف البيانات القديمة
    async cleanupOldData() {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const Attendance = require('../models/Attendance');
            const attendanceResult = await Attendance.deleteMany({
                date: { $lt: thirtyDaysAgo }
            });
            logger.info(`Deleted ${attendanceResult.deletedCount} old attendance records`);

            const Ticket = require('../models/Ticket');
            const ticketResult = await Ticket.deleteMany({
                status: 'closed',
                createdAt: { $lt: thirtyDaysAgo }
            });
            logger.info(`Deleted ${ticketResult.deletedCount} old tickets`);

        } catch (error) {
            logger.error('Data cleanup failed:', error);
        }
    }

    // تحسين أداء قاعدة البيانات
    async optimizeDatabase() {
        try {
            const collections = await mongoose.connection.db.collections();
            for (const collection of collections) {
                await collection.dropIndexes();
                await collection.createIndexes();
                logger.info(`Reindexed collection: ${collection.collectionName}`);
            }

            await mongoose.connection.db.command({ analyze: 1 });
            logger.info('Database analysis completed');

        } catch (error) {
            logger.error('Database optimization failed:', error);
        }
    }

    // جدولة المهام الدورية
    scheduleMaintenanceTasks() {
        // نسخ احتياطي يومي
        setInterval(async () => {
            try {
                await this.backupDatabase();
                await this.cleanupOldBackups();
            } catch (error) {
                logger.error('Scheduled backup failed:', error);
            }
        }, 24 * 60 * 60 * 1000);

        // تنظيف أسبوعي للبيانات
        setInterval(async () => {
            try {
                await this.cleanupOldData();
            } catch (error) {
                logger.error('Scheduled cleanup failed:', error);
            }
        }, 7 * 24 * 60 * 60 * 1000);

        // تحسين شهري لقاعدة البيانات
        setInterval(async () => {
            try {
                await this.optimizeDatabase();
            } catch (error) {
                logger.error('Scheduled optimization failed:', error);
            }
        }, 2147483647);
    }
}

module.exports = new MaintenanceSystem();