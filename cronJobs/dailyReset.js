const cron = require('node-cron');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
const Attendance = require('../models/Attendance');
const GuildSettings = require('../models/GuildSettings');
const moment = require('moment-timezone');
const { retryOperation } = require('../utils/helpers');

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
        
        // التحقق من وجود البوت في السيرفر
        if (!guild.members.me) {
            logger.warn(`البوت غير موجود في السيرفر ${guild.name} (${guild.id})`);
            return;
        }
        
        const today = moment().tz('Asia/Riyadh').startOf('day').toDate();
        const tomorrow = moment(today).add(1, 'day').toDate();

        const records = await retryOperation(async () => {
            return await Attendance.find({
                guildId: guild.id,
                date: { $gte: today, $lt: tomorrow },
                'sessions.checkOut': { $exists: false }
            });
        });

        // البحث عن قناة السجل مع التحقق من وجودها
        // Get log channel from GuildSettings
const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
const logChannel = guildSettings?.attendanceLogChannelId
  ? await guild.channels.fetch(guildSettings.attendanceLogChannelId).catch(() => null)
  : guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        
        // التحقق من وجود قناة السجل
        if (!logChannel?.permissionsFor(guild.members.me)?.has('SendMessages')) {
  logger.warn('Missing SendMessages permission for attendance log channel', {
    guildId: guild.id,
    channelId: logChannel?.id
  });
  
  // إرسال إشعار لمالك السيرفر عن نقص الصلاحيات
  if (global.permissionNotifier) {
    await global.permissionNotifier.handlePermissionError(
      guild.id,
      logChannel?.id,
      'سجل-الحضور',
      'SendMessages'
    );
  }
  
  return;
}

if (!logChannel) {
            logger.warn(`قناة سجل-الحضور غير موجودة في السيرفر ${guild.name} (${guild.id})`);
        }
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

                const member = await guild.members.fetch(record.userId).catch((error) => {
                    logger.warn(`تعذر العثور على العضو ${record.userId} في السيرفر ${guild.name}: ${error.message}`);
                    return null;
                });
                
                if (member) {
                    const attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
                    if (attendanceRole?.id && member.roles.cache.has(attendanceRole.id)) {
                        // التحقق من صلاحيات البوت قبل إزالة الرتبة
                        if (!guild.members.me.permissions.has('ManageRoles')) {
                            logger.warn(`البوت لا يملك صلاحية إدارة الأدوار في سيرفر ${guild.name}`);
                            
                            // إرسال إشعار لمالك السيرفر عن نقص الصلاحيات
                            if (global.permissionNotifier) {
                                await global.permissionNotifier.handlePermissionError(
                                    guild.id,
                                    null,
                                    'إدارة الأدوار',
                                    'ManageRoles'
                                );
                            }
                        } else if (!attendanceRole.editable) {
                            logger.warn(`البوت لا يمكنه تعديل رتبة ${attendanceRole.name} في سيرفر ${guild.name}`);
                        } else {
                            try {
                                await retryOperation(async () => {
                                    await member.roles.remove(attendanceRole);
                                });
                                logger.info(`تم إزالة رتبة الحضور من ${member.user.tag} في سيرفر ${guild.name}`);
                            } catch (roleError) {
                                logger.error(`فشل في إزالة رتبة الحضور من ${member.user.tag}:`, {
                                    error: roleError.message,
                                    code: roleError.code,
                                    guildId: guild.id,
                                    userId: member.id
                                });
                            }
                        }
                    }

                    if (logChannel) {
                        try {
                            // التحقق من صلاحيات البوت قبل إرسال الرسالة
                            if (!logChannel.permissionsFor(guild.members.me).has(['SendMessages', 'ViewChannel'])) {
                                logger.warn('Missing SendMessages permission for attendance log channel', {
                                    guildId: guild.id,
                                    channelId: logChannel.id,
                                    userId: member.id,
                                    permissions: logChannel.permissionsFor(guild.members.me).serialize(),
                                    action: 'check-out'
                                });
                                continue;
                            }
                            
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
                        } catch (error) {
                            logger.error(`خطأ في إرسال رسالة الانصراف التلقائي للعضو ${member.user.tag}:`, {
                                error: error.message,
                                guildId: guild.id,
                                userId: member.id
                            });
                        }
                    }
                }
            }
        }

        // إزالة الرتبة من الأعضاء المتبقين
        const attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (attendanceRole) {
            // التحقق من صلاحيات البوت قبل إزالة الرتبة
            if (!guild.members.me.permissions.has('ManageRoles')) {
                logger.warn(`البوت لا يملك صلاحية إدارة الأدوار في سيرفر ${guild.name}`);
                
                // إرسال إشعار لمالك السيرفر عن نقص الصلاحيات
                if (global.permissionNotifier) {
                    await global.permissionNotifier.handlePermissionError(
                        guild.id,
                        null,
                        'إدارة الأدوار',
                        'ManageRoles'
                    );
                }
            } else if (!attendanceRole.editable) {
                logger.warn(`البوت لا يمكنه تعديل رتبة ${attendanceRole.name} في سيرفر ${guild.name}`);
            } else {
                for (const [memberId, member] of attendanceRole.members) {
                    if (!processedUsers.has(memberId)) {
                        try {
                            await retryOperation(async () => {
                                await member.roles.remove(attendanceRole);
                            });
                            logger.info(`تم إزالة رتبة الحضور من ${member.user.tag} في سيرفر ${guild.name}`);
                        } catch (roleError) {
                            logger.error(`فشل في إزالة رتبة الحضور من ${member.user.tag}:`, {
                                error: roleError.message,
                                code: roleError.code,
                                guildId: guild.id,
                                userId: member.id
                            });
                        }
                    }
                }
            }
        }

        if (logChannel && checkedOutCount > 0) {
            try {
                // التحقق من صلاحيات البوت قبل إرسال الرسالة
                if (!logChannel.permissionsFor(guild.members.me).has('SendMessages')) {
                    logger.warn(`البوت لا يملك صلاحيات كافية للإرسال في قناة سجل-الحضور في سيرفر ${guild.name}`);
                } else {
                    const summaryEmbed = new EmbedBuilder()
                        .setTitle('📋 ملخص الانصراف التلقائي')
                        .setDescription(`تم تسجيل انصراف ${checkedOutCount} عضو بشكل تلقائي`)
                        .setColor(0x00ff00)
                        .setTimestamp();

                    await retryOperation(async () => {
                        await logChannel.send({ embeds: [summaryEmbed] });
                    }, 3, 1000);
                }
            } catch (error) {
                logger.error(`خطأ في إرسال ملخص الانصراف التلقائي:`, {
                    error: error.message,
                    code: error.code,
                    guildId: guild.id,
                    checkedOutCount
                });
            }
        }

    } catch (error) {
        logger.error('خطأ في forceCheckOutAll:', {
            error: error.message,
            code: error.code,
            stack: error.stack,
            guildId: guild.id
        });
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
        // البحث عن قناة السجل مع التحقق من وجودها
        // Get log channel from GuildSettings
const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
const logChannel = guildSettings?.attendanceLogChannelId
  ? await guild.channels.fetch(guildSettings.attendanceLogChannelId).catch(() => null)
  : guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        
        // التحقق من وجود قناة السجل
        if (!logChannel?.permissionsFor(guild.members.me)?.has('SendMessages')) {
  logger.warn('Missing SendMessages permission for attendance log channel', {
    guildId: guild.id,
    channelId: logChannel?.id
  });
  
  // إرسال إشعار لمالك السيرفر عن نقص الصلاحيات
  if (global.permissionNotifier) {
    await global.permissionNotifier.handlePermissionError(
      guild.id,
      logChannel?.id,
      'سجل-الحضور',
      'SendMessages'
    );
  }
  
  return;
}

if (!logChannel) {
            logger.warn(`قناة سجل-الحضور غير موجودة في السيرفر ${guild.name} (${guild.id})`);
            locks.dailyReport = false;
            return;
        }
        
        // التحقق من صلاحيات البوت قبل المتابعة
        if (!logChannel.permissionsFor(guild.members.me).has('SendMessages')) {
            logger.warn(`البوت لا يملك صلاحيات كافية للإرسال في قناة سجل-الحضور في سيرفر ${guild.name}`);
            locks.dailyReport = false;
            return;
        }

        const today = moment().tz('Asia/Riyadh').startOf('day');
        const tomorrow = moment(today).add(1, 'day');

        const records = await retryOperation(async () => {
            return await Attendance.find({
                guildId: guild.id,
                date: {
                    $gte: today.toDate(),
                    $lt: tomorrow.toDate()
                }
            }).exec();
        });

        const validRecords = records.filter(record => 
            record.sessions?.some(session => session.checkIn && session.checkOut)
        );

        if (validRecords.length === 0) {
            try {
                const noRecordsEmbed = new EmbedBuilder()
                    .setTitle('📊 التقرير اليومي للحضور')
                    .setDescription(`لا توجد سجلات حضور مكتملة ليوم ${today.format('DD/MM/YYYY')}`)
                    .setColor(0xffff00)
                    .setTimestamp();

                await logChannel.send({ embeds: [noRecordsEmbed] });
            } catch (error) {
                logger.error(`خطأ في إرسال رسالة عدم وجود سجلات:`, {
                    error: error.message,
                    guildId: guild.id
                });
            }
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
    try {
        // التحقق من صلاحيات البوت قبل إرسال الرسالة
        if (!channel?.permissionsFor(channel.guild.members.me)?.has(['SendMessages', 'ViewChannel'])) {
            logger.warn(`البوت لا يملك صلاحيات كافية للإرسال في قناة سجل-الحضور في سيرفر ${channel.guild.name}`, {
                guildId: channel.guild.id,
                channelId: channel.id,
                permissions: channel.permissionsFor(channel.guild.members.me)?.serialize()
            });
            return;
        }
        
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

        await retryOperation(async () => {
            await channel.send({ embeds: [mainEmbed] });
        }, 3, 1000);
    } catch (error) {
        logger.error(`خطأ في إرسال التقرير اليومي:`, {
            error: error.message,
            code: error.code,
            stack: error.stack,
            guildId: channel.guild.id
        });
        return;
    }

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

        try {
            await retryOperation(async () => {
                await channel.send({ embeds: [detailsEmbed] });
            }, 3, 1000);
        } catch (error) {
            logger.error(`خطأ في إرسال تفاصيل الأعضاء:`, {
                error: error.message,
                code: error.code,
                chunk: i + 1,
                guildId: channel.guild.id
            });
        }
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
                // التحقق من وجود السيرفر وصلاحيات البوت
                if (!guild.available) {
                    logger.warn(`السيرفر ${guild.id} غير متاح حالياً، تخطي تسجيل الانصراف التلقائي`);
                    continue;
                }
                
                // التحقق من وجود البوت في السيرفر
                if (!guild.members.me) {
                    logger.warn(`البوت غير موجود في السيرفر ${guild.name || guild.id}، تخطي تسجيل الانصراف التلقائي`);
                    continue;
                }
                
                await forceCheckOutAll(guild);
            } catch (error) {
                logger.error('خطأ في معالجة تسجيل الانصراف التلقائي:', { 
                    guildId: guild.id, 
                    guildName: guild.name,
                    error: error.message,
                    code: error.code,
                    stack: error.stack
                });
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
                // التحقق من وجود السيرفر وصلاحيات البوت
                if (!guild.available) {
                    logger.warn(`السيرفر ${guild.id} غير متاح حالياً، تخطي إرسال التقرير اليومي`);
                    continue;
                }
                
                // التحقق من وجود البوت في السيرفر
                if (!guild.members.me) {
                    logger.warn(`البوت غير موجود في السيرفر ${guild.name || guild.id}، تخطي إرسال التقرير اليومي`);
                    continue;
                }
                
                await sendDailyReport(guild);
            } catch (error) {
                logger.error('خطأ في إرسال التقرير اليومي:', { 
                    guildId: guild.id, 
                    guildName: guild.name,
                    error: error.message,
                    code: error.code,
                    stack: error.stack
                });
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
                // التحقق من وجود السيرفر وصلاحيات البوت
                if (!guild.available) {
                    logger.warn(`السيرفر ${guild.id} غير متاح حالياً، تخطي إرسال التقرير الأسبوعي`);
                    continue;
                }
                
                // التحقق من وجود البوت في السيرفر
                if (!guild.members.me) {
                    logger.warn(`البوت غير موجود في السيرفر ${guild.name || guild.id}، تخطي إرسال التقرير الأسبوعي`);
                    continue;
                }
                
                await generateWeeklyAttendanceLog(guild);
            } catch (error) {
                logger.error('خطأ في إرسال التقرير الأسبوعي:', { 
                    guildId: guild.id, 
                    guildName: guild.name,
                    error: error.message,
                    code: error.code,
                    stack: error.stack
                });
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

module.exports = {
    setupDailyReset,
    forceCheckOutAll,
    sendDailyReport
};