const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const Attendance = require('../models/Attendance');
const GuildSettings = require('../models/GuildSettings');
const moment = require('moment-timezone');

// قفل لمنع التنفيذ المتزامن لكل نوع من العمليات
const locks = {
    checkOut: false,
    dailyReport: false,
    weeklyReport: false
};

// تنسيق التاريخ والوقت
const timeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Riyadh'
};

/**
 * تنسيق المدة الزمنية
 * @param {number} minutes - عدد الدقائق
 * @returns {string} المدة منسقة (ساعات:دقائق)
 */
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * تنسيق الوقت
 * @param {Date} date - التاريخ
 * @returns {string} الوقت منسق
 */
function formatTime(date) {
    return moment(date).tz('Asia/Riyadh').format('hh:mm A');
}

/**
 * فرض تسجيل الانصراف لجميع المستخدمين
 * @param {Guild} guild - السيرفر
 */
async function forceCheckOutAll(guild) {
    if (locks.checkOut) {
        logger.warn('عملية تسجيل الانصراف التلقائي قيد التنفيذ بالفعل');
        return;
    }

    try {
        locks.checkOut = true;
        const today = moment().tz('Asia/Riyadh').startOf('day').toDate();
        const tomorrow = moment(today).add(1, 'day').toDate();

        const records = await Attendance.find({
            guildId: guild.id,
            date: { $gte: today, $lt: tomorrow },
            'sessions.checkOut': { $exists: false }
        });

        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        const now = new Date();
        const processedUsers = new Set();
        let checkedOutCount = 0;

        for (const record of records) {
            if (processedUsers.has(record.userId)) continue;

            let updated = false;
            for (const session of record.sessions) {
                if (session.checkIn && !session.checkOut) {
                    session.checkOut = now;
                    session.duration = Math.floor((now - session.checkIn) / 1000 / 60);
                    updated = true;
                }
            }

            if (updated) {
                await record.save();
                checkedOutCount++;
                processedUsers.add(record.userId);

                const member = await guild.members.fetch(record.userId).catch(() => null);
                if (member) {
                    const attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
                    if (attendanceRole?.id && member.roles.cache.has(attendanceRole.id)) {
                        await member.roles.remove(attendanceRole);
                        logger.info(`تم إزالة رتبة الحضور من ${member.user.tag} في سيرفر ${guild.name}`);
                    }

                    if (logChannel) {
                        const lastSession = record.sessions[record.sessions.length - 1];
                        const embed = new EmbedBuilder()
                            .setTitle('⚠️ تسجيل انصراف تلقائي')
                            .setDescription(`تم تسجيل انصراف تلقائي للعضو ${member}`)
                            .addFields([
                                {
                                    name: 'وقت الحضور',
                                    value: formatTime(lastSession.checkIn)
                                },
                                {
                                    name: 'وقت الانصراف',
                                    value: formatTime(now)
                                },
                                {
                                    name: 'مدة الجلسة',
                                    value: `${formatDuration(lastSession.duration)} ساعة`
                                }
                            ])
                            .setColor(0xffa500)
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] });
                    }
                }
            }
        }

        // إزالة الرتبة من الأعضاء المتبقين
        const attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (attendanceRole) {
            for (const [memberId, member] of attendanceRole.members) {
                if (!processedUsers.has(memberId)) {
                    await member.roles.remove(attendanceRole);
                    logger.info(`تم إزالة رتبة الحضور من ${member.user.tag} في سيرفر ${guild.name}`);
                }
            }
        }

        if (logChannel && checkedOutCount > 0) {
            const summaryEmbed = new EmbedBuilder()
                .setTitle('📋 ملخص الانصراف التلقائي')
                .setDescription(`تم تسجيل انصراف ${checkedOutCount} عضو بشكل تلقائي`)
                .setColor(0x00ff00)
                .setTimestamp();

            await logChannel.send({ embeds: [summaryEmbed] });
        }

    } catch (error) {
        logger.error('خطأ في forceCheckOutAll:', error);
    } finally {
        locks.checkOut = false;
    }
}

/**
 * إرسال التقرير اليومي
 * @param {Guild} guild - السيرفر
 */
async function sendDailyReport(guild) {
    if (locks.dailyReport) {
        logger.warn('عملية إرسال التقرير اليومي قيد التنفيذ بالفعل');
        return;
    }

    try {
        locks.dailyReport = true;
        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (!logChannel) return;

        const today = moment().tz('Asia/Riyadh').startOf('day');
        const tomorrow = moment(today).add(1, 'day');

        const records = await Attendance.find({
            guildId: guild.id,
            date: {
                $gte: today.toDate(),
                $lt: tomorrow.toDate()
            }
        }).exec();

        const validRecords = records.filter(record => 
            record.sessions?.some(session => session.checkIn && session.checkOut)
        );

        if (validRecords.length === 0) {
            const noRecordsEmbed = new EmbedBuilder()
                .setTitle('📊 التقرير اليومي للحضور')
                .setDescription(`لا توجد سجلات حضور مكتملة ليوم ${today.format('DD/MM/YYYY')}`)
                .setColor(0xffff00)
                .setTimestamp();

            await logChannel.send({ embeds: [noRecordsEmbed] });
            return;
        }

        const stats = await generateDailyStats(validRecords, guild);
        await sendDailyReportEmbeds(stats, logChannel, today);

    } catch (error) {
        logger.error('خطأ في إرسال التقرير اليومي:', error);
    } finally {
        locks.dailyReport = false;
    }
}

/**
 * توليد إحصائيات التقرير اليومي
 * @param {Array} records - سجلات الحضور
 * @param {Guild} guild - السيرفر
 */
async function generateDailyStats(records, guild) {
    const stats = {
        totalMinutes: 0,
        totalSessions: 0,
        earliestCheckIn: null,
        latestCheckOut: null,
        userStats: new Map()
    };

    for (const record of records) {
        const member = await guild.members.fetch(record.userId).catch(() => null);
        if (!member) continue;

        let userStats = {
            displayName: member.displayName,
            totalMinutes: 0,
            sessions: 0,
            earliestCheckIn: null,
            latestCheckOut: null
        };

        for (const session of record.sessions) {
            if (!session.checkIn || !session.checkOut) continue;

            const duration = Math.floor((session.checkOut - session.checkIn) / 1000 / 60);
            userStats.totalMinutes += duration;
            userStats.sessions++;
            stats.totalSessions++;

            if (!userStats.earliestCheckIn || session.checkIn < userStats.earliestCheckIn) {
                userStats.earliestCheckIn = session.checkIn;
            }
            if (!userStats.latestCheckOut || session.checkOut > userStats.latestCheckOut) {
                userStats.latestCheckOut = session.checkOut;
            }
            if (!stats.earliestCheckIn || session.checkIn < stats.earliestCheckIn) {
                stats.earliestCheckIn = session.checkIn;
            }
            if (!stats.latestCheckOut || session.checkOut > stats.latestCheckOut) {
                stats.latestCheckOut = session.checkOut;
            }
        }

        if (userStats.sessions > 0) {
            stats.totalMinutes += userStats.totalMinutes;
            stats.userStats.set(member.id, userStats);
        }
    }

    return stats;
}

/**
 * إرسال التقرير اليومي كـ embeds
 * @param {Object} stats - الإحصائيات
 * @param {TextChannel} channel - القناة
 * @param {moment.Moment} date - التاريخ
 */
async function sendDailyReportEmbeds(stats, channel, date) {
    const mainEmbed = new EmbedBuilder()
        .setTitle('📊 التقرير اليومي للحضور')
        .setDescription(`تقرير يوم ${date.format('DD/MM/YYYY')}`)
        .addFields([
            {
                name: '📈 إحصائيات عامة',
                value: [
                    `👥 إجمالي الحضور: ${stats.userStats.size} عضو`,
                    `⏱️ إجمالي ساعات العمل: ${formatDuration(stats.totalMinutes)} ساعة`,
                    `🔄 إجمالي الجلسات: ${stats.totalSessions}`,
                    `⏰ أول حضور: ${formatTime(stats.earliestCheckIn)}`,
                    `⏰ آخر انصراف: ${formatTime(stats.latestCheckOut)}`
                ].join('\n')
            }
        ])
        .setColor(0x00ff00)
        .setTimestamp();

    await channel.send({ embeds: [mainEmbed] });

    // تقسيم تفاصيل المستخدمين إلى أجزاء
    const sortedUsers = Array.from(stats.userStats.values())
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

    const userChunks = [];
    let currentChunk = [];
    let currentLength = 0;

    for (const user of sortedUsers) {
        const userText = [
            `**${user.displayName}**`,
            `⏰ المدة: ${formatDuration(user.totalMinutes)} ساعة`,
            `📊 عدد الجلسات: ${user.sessions}`,
            `🕐 أول حضور: ${formatTime(user.earliestCheckIn)}`,
            `🕐 آخر انصراف: ${formatTime(user.latestCheckOut)}`,
            ''
        ].join('\n');

        if (currentLength + userText.length > 1024) {
            userChunks.push(currentChunk);
            currentChunk = [];
            currentLength = 0;
        }

        currentChunk.push(userText);
        currentLength += userText.length;
    }

    if (currentChunk.length > 0) {
        userChunks.push(currentChunk);
    }

    // إرسال تفاصيل المستخدمين
    for (let i = 0; i < userChunks.length; i++) {
        const detailsEmbed = new EmbedBuilder()
            .setTitle(`👤 تفاصيل الأعضاء (${i + 1}/${userChunks.length})`)
            .setDescription(userChunks[i].join('\n'))
            .setColor(0x00ff00)
            .setTimestamp();

        await channel.send({ embeds: [detailsEmbed] });
    }
}

/**
 * إعداد المهام المجدولة
 * @param {Client} client - كائن البوت
 * @returns {Function} دالة التنظيف
 */
function setupDailyReset(client) {
    const tasks = [];

    // تسجيل انصراف تلقائي في 11:58 مساءً
    tasks.push(cron.schedule('58 23 * * *', async () => {
        logger.info('بدء عملية تسجيل الانصراف التلقائي...');
        for (const guild of client.guilds.cache.values()) {
            try {
                await forceCheckOutAll(guild);
            } catch (error) {
                logger.error('خطأ في معالجة تسجيل الانصراف التلقائي:', { guildId: guild.id, error: error.message });
            }
        }
    }, {
        timezone: 'Asia/Riyadh'
    }));

    // التقرير اليومي في 11:59 مساءً
    tasks.push(cron.schedule('59 23 * * *', async () => {
        logger.info('بدء إنشاء التقرير اليومي للحضور...');
        for (const guild of client.guilds.cache.values()) {
            try {
                await sendDailyReport(guild);
            } catch (error) {
                logger.error('خطأ في إرسال التقرير اليومي:', { guildId: guild.id, error: error.message });
            }
        }
    }, {
        timezone: 'Asia/Riyadh'
    }));

    // التقرير الأسبوعي في 11:30 مساءً يوم السبت
    tasks.push(cron.schedule('30 23 * * 6', async () => {
        logger.info('بدء إنشاء التقرير الأسبوعي للحضور...');
        for (const guild of client.guilds.cache.values()) {
            try {
                await generateWeeklyAttendanceLog(guild);
            } catch (error) {
                logger.error(`خطأ في إرسال التقرير الأسبوعي لسيرفر ${guild.name}:`, error);
            }
        }
    }, {
        timezone: 'Asia/Riyadh'
    }));

    // دالة التنظيف
    return function cleanup() {
        tasks.forEach(task => task.stop());
        tasks.length = 0;
    };
}

/**
 * توليد وإرسال تقرير الحضور الأسبوعي
 * @param {Guild} guild - السيرفر
 * @returns {Promise<void>}
 */
async function generateWeeklyAttendanceLog(guild) {
    try {
        // الحصول على إعدادات السيرفر
        const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
        
        // التحقق من وجود ميزة الحضور وتفعيلها
        if (!guildSettings || !guildSettings.features || !guildSettings.features.attendance || !guildSettings.features.attendance.enabled) {
            return;
        }
        
        // التحقق من وجود قناة التقارير
        let logChannelId = guildSettings.features.attendance.logChannelId;
        if (!logChannelId) {
            // استخدام القناة الافتراضية إذا لم تكن قناة التقارير محددة
            logChannelId = guildSettings.features.attendance.channelId;
        }
        
        if (!logChannelId) {
            logger.warn(`لا توجد قناة مخصصة لتقارير الحضور في سيرفر ${guild.name}`);
            return;
        }
        
        const logChannel = await guild.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) {
            logger.warn(`تعذر العثور على قناة تقارير الحضور في سيرفر ${guild.name}`);
            return;
        }
        
        // تحديد نطاق التاريخ (الأسبوع الماضي)
        const today = moment().tz('Asia/Riyadh');
        const lastWeekStart = moment(today).subtract(7, 'days').startOf('day');
        const lastWeekEnd = moment(today).subtract(1, 'day').endOf('day');
        
        // جلب سجلات الحضور للأسبوع الماضي
        const weeklyRecords = await Attendance.find({
            guildId: guild.id,
            date: {
                $gte: lastWeekStart.toDate(),
                $lte: lastWeekEnd.toDate()
            }
        });
        
        if (!weeklyRecords || weeklyRecords.length === 0) {
            // إرسال رسالة بعدم وجود سجلات حضور للأسبوع الماضي
            const noRecordsEmbed = new EmbedBuilder()
                .setTitle('📊 التقرير الأسبوعي للحضور')
                .setDescription(`لا توجد سجلات حضور للأسبوع الماضي (${lastWeekStart.format('YYYY/MM/DD')} - ${lastWeekEnd.format('YYYY/MM/DD')})`)
                .setColor('#FFA500')
                .setTimestamp()
                .setFooter({ text: 'نظام الحضور الأسبوعي | توقيت' });
                
            await logChannel.send({ embeds: [noRecordsEmbed] });
            return;
        }
        
        // تجميع البيانات حسب المستخدم
        const userStats = {};
        
        for (const record of weeklyRecords) {
            if (!userStats[record.userId]) {
                userStats[record.userId] = {
                    totalDuration: 0,
                    daysAttended: 0,
                    sessions: 0,
                    userId: record.userId
                };
            }
            
            // حساب الإحصائيات
            userStats[record.userId].totalDuration += record.totalDuration || 0;
            userStats[record.userId].sessions += record.sessionsCount || 0;
            userStats[record.userId].daysAttended += 1;
        }
        
        // تحويل البيانات إلى مصفوفة وترتيبها حسب المدة الإجمالية
        const sortedStats = Object.values(userStats)
            .filter(stat => stat.totalDuration > 0)
            .sort((a, b) => b.totalDuration - a.totalDuration);
        
        if (sortedStats.length === 0) {
            // إرسال رسالة بعدم وجود سجلات حضور فعالة
            const noActiveRecordsEmbed = new EmbedBuilder()
                .setTitle('📊 التقرير الأسبوعي للحضور')
                .setDescription(`لا توجد سجلات حضور فعالة للأسبوع الماضي (${lastWeekStart.format('YYYY/MM/DD')} - ${lastWeekEnd.format('YYYY/MM/DD')})`)
                .setColor('#FFA500')
                .setTimestamp()
                .setFooter({ text: 'نظام الحضور الأسبوعي | توقيت' });
                
            await logChannel.send({ embeds: [noActiveRecordsEmbed] });
            return;
        }
        
        // إنشاء وإرسال التقرير
        await sendWeeklyReportEmbeds(sortedStats, logChannel, lastWeekStart, lastWeekEnd, guild);
        
        logger.info(`تم إرسال التقرير الأسبوعي للحضور بنجاح لسيرفر ${guild.name}`);
    } catch (error) {
        logger.error(`خطأ في إرسال التقرير الأسبوعي لسيرفر ${guild.name}:`, error);
        throw error;
    }
}

/**
 * إرسال التقرير الأسبوعي للحضور كـ embeds
 * @param {Array} sortedStats - إحصائيات المستخدمين مرتبة
 * @param {TextChannel} channel - قناة التقارير
 * @param {moment.Moment} startDate - تاريخ بداية الأسبوع
 * @param {moment.Moment} endDate - تاريخ نهاية الأسبوع
 * @param {Guild} guild - السيرفر
 * @returns {Promise<void>}
 */
async function sendWeeklyReportEmbeds(sortedStats, channel, startDate, endDate, guild) {
    // إنشاء Embed الرئيسي للتقرير
    const mainEmbed = new EmbedBuilder()
        .setTitle('📊 التقرير الأسبوعي للحضور')
        .setDescription(`إحصائيات الحضور للأسبوع من ${startDate.format('YYYY/MM/DD')} إلى ${endDate.format('YYYY/MM/DD')}`)
        .setColor('#00A3FF')
        .setTimestamp()
        .setFooter({ text: 'نظام الحضور الأسبوعي | توقيت' });
    
    // إضافة حقل لإجمالي عدد المستخدمين
    mainEmbed.addFields({ 
        name: '👥 إجمالي المستخدمين',
        value: `${sortedStats.length} مستخدم`,
        inline: true
    });
    
    // حساب إجمالي ساعات الحضور
    const totalMinutes = sortedStats.reduce((sum, stat) => sum + stat.totalDuration, 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    
    mainEmbed.addFields({ 
        name: '⏱️ إجمالي ساعات الحضور',
        value: `${totalHours} ساعة و ${remainingMinutes} دقيقة`,
        inline: true
    });
    
    // حساب متوسط عدد أيام الحضور
    const avgDays = sortedStats.reduce((sum, stat) => sum + stat.daysAttended, 0) / sortedStats.length;
    
    mainEmbed.addFields({ 
        name: '📅 متوسط أيام الحضور',
        value: `${avgDays.toFixed(1)} يوم`,
        inline: true
    });
    
    // إرسال الـ Embed الرئيسي
    await channel.send({ embeds: [mainEmbed] });
    
    // إنشاء Embed لأفضل 10 مستخدمين
    const topUsersEmbed = new EmbedBuilder()
        .setTitle('🏆 أفضل المستخدمين حضوراً هذا الأسبوع')
        .setColor('#00A3FF')
        .setTimestamp()
        .setFooter({ text: 'نظام الحضور الأسبوعي | توقيت' });
    
    // إضافة أفضل 10 مستخدمين (أو أقل إذا كان العدد أقل من 10)
    const topUsers = sortedStats.slice(0, Math.min(10, sortedStats.length));
    
    let userDetailsList = '';
    
    for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const member = await guild.members.fetch(user.userId).catch(() => null);
        const username = member ? member.user.username : 'مستخدم غير معروف';
        
        const hours = Math.floor(user.totalDuration / 60);
        const minutes = user.totalDuration % 60;
        
        userDetailsList += `**${i + 1}.** <@${user.userId}> (${username})\n`;
        userDetailsList += `⏱️ مدة الحضور: ${hours} ساعة و ${minutes} دقيقة\n`;
        userDetailsList += `📅 أيام الحضور: ${user.daysAttended} يوم\n`;
        userDetailsList += `🔄 عدد الجلسات: ${user.sessions}\n\n`;
    }
    
    topUsersEmbed.setDescription(userDetailsList || 'لا توجد بيانات متاحة');
    
    // إرسال Embed أفضل المستخدمين
    await channel.send({ embeds: [topUsersEmbed] });
}

module.exports = {
    setupDailyReset,
    forceCheckOutAll,
    sendDailyReport,
    generateWeeklyAttendanceLog
};