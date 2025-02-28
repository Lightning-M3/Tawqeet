/*
const cron = require('node-cron');
const Attendance = require('../models/Attendance'); // تأكد من مسار النموذج
const logger = require('../utils/logger'); // تأكد من مسار السجل
const client = require('../index'); // تأكد من استيراد كائن العميل بشكل صحيح

// جدولة المهمة لتعمل كل ساعة
cron.schedule('0 * * * *', async () => {
    try {
        // الحصول على جميع السيرفرات التي ينتمي إليها البوت
        const guilds = client.guilds.cache;

        for (const guild of guilds.values()) {
            // تأكد من أن guild موجود
            if (!guild) {
                logger.warn(`Guild not found for ID: ${guild.id}`);
                continue;
            }

            // استخدام fetch للحصول على الأعضاء
            await guild.members.fetch();

            const attendanceRecords = await Attendance.find({
                guildId: guild.id, // تحقق من سجلات الحضور الخاصة بالسيرفر الحالي
                'sessions.checkOut': { $exists: false } // تحقق من وجود جلسات مفتوحة
            });

            for (const record of attendanceRecords) {
                const user = guild.members.cache.get(record.userId);
                if (user) {
                    // تحقق مما إذا كان المستخدم قد أنهى جلسة أو لم يسجل حضوره
                    if (!record.sessions.length || record.sessions[record.sessions.length - 1].checkOut) {
                        const attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
                        if (attendanceRole) {
                            await user.roles.remove(attendanceRole);
                            logger.info(`Removed attendance role from ${user.user.tag} in guild ${guild.name}`);
                        }
                    }
                } else {
                    logger.warn(`User not found in guild ${guild.name} for record: ${record.userId}`);
                }
            }
        }
    } catch (error) {
        logger.error('Error in attendance check cron job:', error);
    }
}); 
*/