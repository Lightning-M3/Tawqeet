const fs = require('fs').promises;
const path = require('path');
const { zip } = require('zip-a-folder');
const logger = require('./logger');

class BackupSystem {
    constructor() {
        this.backupDir = path.join(__dirname, '../backups');
        this.maxBackups = 7; // الاحتفاظ بنسخ احتياطية لمدة أسبوع
    }

    async init() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
        } catch (error) {
            logger.log('error', 'فشل في إنشاء مجلد النسخ الاحتياطي', { error });
        }
    }

    async createBackup() {
        const date = new Date().toISOString().split('T')[0];
        const backupPath = path.join(this.backupDir, `backup-${date}.zip`);

        try {
            // إنشاء نسخة احتياطية من قاعدة البيانات
            // يمكن تنفيذ هذا حسب نوع قاعدة البيانات المستخدمة

            // ضغط الملفات
            await zip(path.join(__dirname, '../data'), backupPath);

            logger.log('info', 'تم إنشاء نسخة احتياطية بنجاح', { path: backupPath });
            await this.cleanOldBackups();
        } catch (error) {
            logger.log('error', 'فشل في إنشاء نسخة احتياطية', { error });
        }
    }

    async cleanOldBackups() {
        try {
            const files = await fs.readdir(this.backupDir);
            const backups = files.filter(f => f.startsWith('backup-')).sort();

            while (backups.length > this.maxBackups) {
                const oldestBackup = backups.shift();
                await fs.unlink(path.join(this.backupDir, oldestBackup));
                logger.log('info', 'تم حذف نسخة احتياطية قديمة', { file: oldestBackup });
            }
        } catch (error) {
            logger.log('error', 'فشل في تنظيف النسخ الاحتياطية القديمة', { error });
        }
    }
}

module.exports = new BackupSystem(); 