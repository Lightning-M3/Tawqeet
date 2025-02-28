const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Attendance = require('../models/Attendance'); // تأكد من مسار النموذج
const logger = require('../utils/logger'); // تأكد من مسار السجل
const moment = require('moment-timezone');

// خريطة لتخزين أوقات التبريد
const cooldowns = new Map();
const COOLDOWN_DURATION = 30000; // 30 ثانية

module.exports = {
    data: new SlashCommandBuilder()
        .setName('open-sessions')
        .setDescription('عرض الأشخاص الذين لديهم جلسات حضور مفتوحة')
        .addBooleanOption(option =>
            option
                .setName('details')
                .setDescription('عرض تفاصيل إضافية عن كل جلسة')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            // التحقق من فترة التبريد
            const cooldownTime = checkCooldown(interaction.user.id);
            if (cooldownTime > 0) {
                return await interaction.reply({
                    content: `⏳ الرجاء الانتظار ${cooldownTime} ثانية قبل استخدام الأمر مرة أخرى`,
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const showDetails = interaction.options.getBoolean('details') ?? false;
            const guildId = interaction.guild.id;
            const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');

            if (!attendanceRole) {
                return await interaction.followUp({
                    content: '❌ لم يتم العثور على رتبة "مسجل حضوره"',
                    ephemeral: true
                });
            }

            // البحث عن جميع سجلات الحضور المفتوحة
            const startOfDay = moment().tz('Asia/Riyadh').startOf('day').toDate();
            const attendanceRecords = await Attendance.find({
                guildId: guildId,
                date: { $gte: startOfDay }
            });

            // تصفية السجلات التي تحتوي على جلسات مفتوحة
            const recordsWithOpenSessions = attendanceRecords.filter(record => {
                return record.sessions.some(session => !session.checkOut);
            });

            if (!recordsWithOpenSessions || recordsWithOpenSessions.length === 0) {
                return await interaction.followUp({
                    content: '✅ لا توجد جلسات حضور مفتوحة حالياً',
                    ephemeral: true
                });
            }

            // تجميع معلومات الجلسات المفتوحة
            const openSessions = [];
            let totalOpenSessions = 0;

            for (const record of recordsWithOpenSessions) {
                const member = await interaction.guild.members.fetch(record.userId).catch(() => null);
                if (!member) {
                    logger.warn(`لم يتم العثور على العضو ${record.userId} في السيرفر`);
                    continue;
                }
                
                // التحقق من وجود رتبة الحضور (اختياري)
                if (attendanceRole && !member.roles.cache.has(attendanceRole.id)) {
                    logger.info(`العضو ${member.user.username} ليس لديه رتبة الحضور رغم وجود جلسة مفتوحة`);
                }

                const openSessionsForUser = record.sessions.filter(session => !session.checkOut);
                if (openSessionsForUser.length === 0) continue;

                totalOpenSessions += openSessionsForUser.length;
                
                openSessions.push({
                    member,
                    sessions: openSessionsForUser.map(session => ({
                        checkIn: session.checkIn,
                        duration: moment.duration(moment().diff(moment(session.checkIn))).asMinutes()
                    }))
                });
            }

            // إنشاء Embed للرد
            const embed = new EmbedBuilder()
                .setTitle('🕒 الجلسات المفتوحة')
                .setColor(0x00ff00)
                .setDescription(`إجمالي الجلسات المفتوحة: ${totalOpenSessions}`)
                .setTimestamp();

            if (showDetails) {
                // عرض تفاصيل كل جلسة
                openSessions.forEach(({ member, sessions }) => {
                    const sessionDetails = sessions.map((session, index) => {
                        const duration = Math.floor(session.duration);
                        const hours = Math.floor(duration / 60);
                        const minutes = Math.floor(duration % 60);
                        return `جلسة ${index + 1}: منذ ${hours}:${minutes.toString().padStart(2, '0')} ساعة`;
                    }).join('\n');

                    embed.addFields({
                        name: `👤 ${member.user.username}`,
                        value: sessionDetails || 'لا توجد تفاصيل',
                        inline: false
                    });
                });
            } else {
                // عرض ملخص فقط
                const summary = openSessions.map(({ member, sessions }) => 
                    `👤 ${member.user.username} - ${sessions.length} ${sessions.length === 1 ? 'جلسة' : 'جلسات'}`
                ).join('\n');

                embed.addFields({
                    name: 'الأعضاء',
                    value: summary || 'لا يوجد أعضاء',
                    inline: false
                });
            }

            await interaction.followUp({ embeds: [embed] });

            // تسجيل الاستخدام
            logger.info('تم تنفيذ أمر open-sessions', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                totalSessions: totalOpenSessions,
                showDetails
            });

        } catch (error) {
            logger.error('خطأ في أمر open-sessions:', error);
            const errorMessage = '❌ حدث خطأ أثناء محاولة عرض الجلسات المفتوحة';
            
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
 * التحقق من فترة التبريد للأمر
 * @param {string} userId - معرف المستخدم
 * @returns {number} الوقت المتبقي بالثواني، 0 إذا لم يكن هناك تبريد
 */
function checkCooldown(userId) {
    const key = `opensessions-${userId}`;
    const now = Date.now();
    const cooldownTime = cooldowns.get(key);
    
    if (cooldownTime && now < cooldownTime) {
        return Math.ceil((cooldownTime - now) / 1000);
    }
    
    cooldowns.set(key, now + COOLDOWN_DURATION);
    return 0;
} 