const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');
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
        .setDefaultMemberPermissions(PermissionFlagsBits.UseApplicationCommands),

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
            
            // Add null check for interaction.guild
            if (!interaction.guild) {
                return await interaction.followUp({
                    content: '❌ هذا الأمر يمكن استخدامه فقط داخل السيرفر',
                    ephemeral: true
                });
            }
            
            // البحث عن رتبة الحضور
            const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');

            if (!attendanceRole) {
                return await interaction.followUp({
                    content: '❌ لم يتم العثور على رتبة "مسجل حضوره"',
                    ephemeral: true
                });
            }

            // الحصول على جميع الأعضاء الذين لديهم رتبة الحضور
            const membersWithRole = attendanceRole.members;
            
            if (!membersWithRole || membersWithRole.size === 0) {
                return await interaction.followUp({
                    content: '✅ لا توجد جلسات حضور مفتوحة حالياً',
                    ephemeral: true
                });
            }

            // تجميع معلومات الأعضاء
            const openSessions = [];
            const totalOpenSessions = membersWithRole.size;

            // تقدير وقت تسجيل الحضور (نفترض أنه منذ آخر تغيير للرتبة أو منذ ساعة إذا لم تتوفر المعلومات)
            for (const [memberId, member] of membersWithRole) {
                // نحصل على وقت إضافة الرتبة إذا كان متاحاً، وإلا نستخدم الوقت الحالي ناقص ساعة واحدة
                const checkInTime = member.roles.cache.get(attendanceRole.id)?.joinedTimestamp || 
                                   (Date.now() - 3600000); // افتراضي: منذ ساعة واحدة
                
                const duration = moment.duration(moment().diff(moment(checkInTime))).asMinutes();
                
                openSessions.push({
                    member,
                    sessions: [{
                        checkIn: new Date(checkInTime),
                        duration: duration
                    }]
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
                const summary = openSessions.map(({ member }) => 
                    `👤 ${member.user.username} - جلسة`
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