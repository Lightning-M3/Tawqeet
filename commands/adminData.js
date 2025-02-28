const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Attendance = require('../models/Attendance');
const XLSX = require('xlsx');
const moment = require('moment-timezone');
const logger = require('../utils/logger');
const { retryOperation } = require('../utils/helpers');

// تكوين التنسيق الموحد
const DATE_FORMAT = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Riyadh'
};

const TIME_FORMAT = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Riyadh'
};

// خريطة لتخزين أوقات التبريد
const cooldowns = new Map();
const COOLDOWN_DURATION = 60000; // دقيقة واحدة

/**
 * التحقق من فترة التبريد للأمر
 * @param {string} userId - معرف المستخدم
 * @returns {Object} نتيجة التحقق من التبريد
 */
function checkCooldown(userId) {
    const key = `admindata-${userId}`;
    const now = Date.now();
    const cooldownTime = cooldowns.get(key);
    
    if (cooldownTime && now < cooldownTime) {
        const remainingTime = Math.ceil((cooldownTime - now) / 1000);
        const timeText = formatRemainingTime(remainingTime);
        return {
            onCooldown: true,
            remainingTime,
            message: `⏳ الرجاء الانتظار ${timeText} قبل استخدام الأمر مرة أخرى`
        };
    }
    
    cooldowns.set(key, now + COOLDOWN_DURATION);
    return { onCooldown: false };
}

/**
 * تنسيق الوقت المتبقي بالعربية
 * @param {number} seconds - الثواني المتبقية
 * @returns {string} النص المنسق
 */
function formatRemainingTime(seconds) {
    if (seconds < 60) {
        if (seconds === 1) return 'ثانية واحدة';
        if (seconds === 2) return 'ثانيتين';
        if (seconds >= 3 && seconds <= 10) return `${seconds} ثوانٍ`;
        return `${seconds} ثانية`;
    }
    
    const minutes = Math.ceil(seconds / 60);
    if (minutes === 1) return 'دقيقة واحدة';
    if (minutes === 2) return 'دقيقتين';
    if (minutes >= 3 && minutes <= 10) return `${minutes} دقائق`;
    return `${minutes} دقيقة`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-data')
        .setDescription('عرض بيانات الحضور للمستخدم المحدد')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('المستخدم المستهدف')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('days')
                .setDescription('عدد الأيام للعرض (الافتراضي: 30)')
                .setMinValue(1)
                .setMaxValue(90)
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('format')
                .setDescription('تنسيق التقرير')
                .setRequired(false)
                .addChoices(
                    { name: 'عرض مباشر', value: 'display' },
                    { name: 'ملف Excel', value: 'excel' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // التحقق من فترة التبريد
            const cooldownResult = checkCooldown(interaction.user.id);
            if (cooldownResult.onCooldown) {
                return await interaction.reply({
                    content: cooldownResult.message,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const days = interaction.options.getInteger('days') || 30;
            const format = interaction.options.getString('format') || 'display';

            const startDate = moment().tz('Asia/Riyadh').subtract(days, 'days').startOf('day').toDate();
            
            // استخدام retryOperation للعمليات المهمة
            const attendanceRecords = await retryOperation(async () => {
                return await Attendance.find({
                    userId: targetUser.id,
                    guildId: interaction.guildId,
                    date: { $gte: startDate }
                }).sort({ date: -1 });
            });

            if (!attendanceRecords || attendanceRecords.length === 0) {
                return await interaction.followUp({
                    content: `لا توجد سجلات حضور لـ ${targetUser.username} خلال آخر ${days} يوم`,
                    ephemeral: true
                });
            }

            // تجميع الإحصائيات
            const stats = calculateStats(attendanceRecords, days);

            try {
                if (format === 'excel') {
                    const excelBuffer = await generateExcelReport(stats, targetUser, days);
                    const attachment = new AttachmentBuilder(excelBuffer, {
                        name: `attendance_report_${targetUser.username}_${moment().format('YYYY-MM-DD')}.xlsx`
                    });

                    await interaction.followUp({
                        content: `📊 تقرير الحضور لـ ${targetUser.username}`,
                        files: [attachment],
                        ephemeral: true
                    });
                } else {
                    const embed = generateEmbed(stats, targetUser, interaction, days);
                    await interaction.followUp({
                        embeds: [embed],
                        ephemeral: true
                    });
                }
            } catch (formatError) {
                logger.error('خطأ في تنسيق التقرير:', formatError);
                throw new Error('حدث خطأ أثناء تنسيق التقرير. الرجاء المحاولة مرة أخرى.');
            }

        } catch (error) {
            logger.error('خطأ في أمر admin-data:', error);
            const errorMessage = error.message || '❌ حدث خطأ أثناء معالجة الطلب. الرجاء المحاولة مرة أخرى لاحقاً.';
            
            if (interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    }
};

/**
 * حساب الإحصائيات من سجلات الحضور
 * @param {Array} records - سجلات الحضور
 * @param {number} days - عدد الأيام
 * @returns {Object} الإحصائيات المحسوبة
 */
function calculateStats(records, days) {
    let stats = {
        totalMinutes: 0,
        daysAttended: 0,
        totalSessions: 0,
        longestSession: 0,
        shortestSession: Infinity,
        dailyDetails: [],
        lastWeekMinutes: 0,
        averageDaily: 0,
        averageSession: 0,
        attendancePercentage: 0
    };

    const lastWeekDate = moment().subtract(7, 'days').startOf('day');

    records.forEach(record => {
        let dailyMinutes = 0;
        record.sessions.forEach(session => {
            if (session.checkOut) {
                const duration = session.duration;
                dailyMinutes += duration;
                stats.totalSessions++;
                stats.longestSession = Math.max(stats.longestSession, duration);
                stats.shortestSession = Math.min(stats.shortestSession, duration);
            }
        });

        if (dailyMinutes > 0) {
            stats.totalMinutes += dailyMinutes;
            if (moment(record.date).isAfter(lastWeekDate)) {
                stats.lastWeekMinutes += dailyMinutes;
            }
            stats.daysAttended++;
            stats.dailyDetails.push({
                date: moment(record.date).format('DD/MM/YYYY'),
                minutes: dailyMinutes,
                sessions: record.sessions.length
            });
        }
    });

    stats.averageDaily = stats.daysAttended > 0 ? stats.totalMinutes / stats.daysAttended : 0;
    stats.averageSession = stats.totalSessions > 0 ? stats.totalMinutes / stats.totalSessions : 0;
    stats.attendancePercentage = (stats.daysAttended / days) * 100;
    
    if (stats.shortestSession === Infinity) {
        stats.shortestSession = 0;
    }

    return stats;
}

/**
 * إنشاء تقرير Excel
 * @param {Object} stats - الإحصائيات
 * @param {User} user - المستخدم
 * @param {number} days - عدد الأيام
 * @returns {Buffer} ملف Excel كـ buffer
 */
async function generateExcelReport(stats, user, days) {
    const workbook = XLSX.utils.book_new();
    
    // صفحة الملخص
    const summaryData = [
        ['تقرير الحضور', user.username],
        ['الفترة', `آخر ${days} يوم`],
        [''],
        ['إحصائيات الوقت'],
        ['إجمالي وقت العمل', `${Math.floor(stats.totalMinutes / 60)}:${(stats.totalMinutes % 60).toString().padStart(2, '0')}`],
        ['متوسط الوقت اليومي', `${Math.floor(stats.averageDaily / 60)}:${Math.floor(stats.averageDaily % 60).toString().padStart(2, '0')}`],
        ['وقت العمل (آخر 7 أيام)', `${Math.floor(stats.lastWeekMinutes / 60)}:${(stats.lastWeekMinutes % 60).toString().padStart(2, '0')}`],
        [''],
        ['إحصائيات الحضور'],
        ['أيام الحضور', stats.daysAttended],
        ['عدد الجلسات', stats.totalSessions],
        ['نسبة الحضور', `${Math.round(stats.attendancePercentage)}%`]
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'ملخص');

    // صفحة التفاصيل اليومية
    const detailsData = [
        ['التاريخ', 'عدد الساعات', 'عدد الدقائق', 'عدد الجلسات']
    ];

    stats.dailyDetails.forEach(day => {
        detailsData.push([
            day.date,
            Math.floor(day.minutes / 60),
            day.minutes % 60,
            day.sessions
        ]);
    });

    const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
    XLSX.utils.book_append_sheet(workbook, detailsSheet, 'التفاصيل اليومية');

    // تحويل الملف إلى buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
}

/**
 * إنشاء Embed للعرض المباشر
 * @param {Object} stats - الإحصائيات
 * @param {User} user - المستخدم
 * @param {Interaction} interaction - التفاعل
 * @param {number} days - عدد الأيام
 * @returns {EmbedBuilder} Embed للعرض
 */
function generateEmbed(stats, user, interaction, days) {
    return new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📊 تقرير الحضور | ${user.username}`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`تقرير تفصيلي لآخر ${days} يوم`)
        .addFields(
            { 
                name: '⏰ إحصائيات الوقت',
                value: [
                    `• إجمالي وقت العمل: **${Math.floor(stats.totalMinutes / 60)}:${(stats.totalMinutes % 60).toString().padStart(2, '0')}** ساعة`,
                    `• متوسط الوقت اليومي: **${Math.floor(stats.averageDaily / 60)}:${Math.floor(stats.averageDaily % 60).toString().padStart(2, '0')}** ساعة`,
                    `• وقت العمل (آخر 7 أيام): **${Math.floor(stats.lastWeekMinutes / 60)}:${(stats.lastWeekMinutes % 60).toString().padStart(2, '0')}** ساعة`
                ].join('\n')
            },
            {
                name: '📅 إحصائيات الحضور',
                value: [
                    `• أيام الحضور: **${stats.daysAttended}** يوم`,
                    `• عدد الجلسات: **${stats.totalSessions}** جلسة`,
                    `• نسبة الحضور: **${Math.round(stats.attendancePercentage)}%**`
                ].join('\n')
            }
        )
        .setTimestamp()
        .setFooter({ 
            text: `طلب بواسطة ${interaction.user.username}`,
            iconURL: interaction.user.displayAvatarURL()
        });
}