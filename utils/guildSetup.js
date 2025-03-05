const logger = require('./logger');
const GuildSettings = require('../models/GuildSettings');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

/**
 * إعداد السيرفر وتهيئة القنوات والأدوار المطلوبة
 * @param {Guild} guild - كائن السيرفر
 * @returns {Promise<void>}
 */
async function setupGuild(guild) {
    try {
        // التحقق من وجود إعدادات السيرفر
        let guildConfig = await GuildSettings.findOne({ guildId: guild.id });
        
        // إنشاء إعدادات جديدة إذا لم تكن موجودة
        if (!guildConfig) {
            guildConfig = new GuildSettings({ guildId: guild.id });
        }

        // التحقق من صلاحيات البوت
        if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels | 
            PermissionFlagsBits.ManageRoles | 
            PermissionFlagsBits.ViewChannel | 
            PermissionFlagsBits.SendMessages)) {
            throw new Error('البوت لا يملك الصلاحيات الكافية لإعداد السيرفر');
        }

        // إنشاء قناة سجل-الحضور إذا لم تكن موجودة
        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور') ||
            await guild.channels.create({
                name: 'سجل-الحضور',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.SendMessages],
                        allow: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: guild.members.me.id,
                        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel]
                    }
                ]
            });

        // إنشاء رتبة مسجل حضوره إذا لم تكن موجودة
        const attendanceRole = guild.roles.cache.find(r => r.name === 'مسجل حضوره') ||
            await guild.roles.create({
                name: 'مسجل حضوره',
                color: 'GREEN',
                reason: 'رتبة تمييز الأعضاء المسجلين حضورهم'
            });

        // تحديث إعدادات السيرفر
        guildConfig.logChannelId = logChannel.id;
        guildConfig.attendanceRoleId = attendanceRole.id;
        guildConfig.setupComplete = true;
        await guildConfig.save();

        logger.info(`تم إعداد السيرفر ${guild.name} بنجاح`);

    } catch (error) {
        logger.error(`خطأ في إعداد السيرفر ${guild.name}:`, {
            error: error.message,
            stack: error.stack,
            guildId: guild.id
        });
        throw error; // إعادة رمي الخطأ للتعامل معه في المستوى الأعلى
    }
}

module.exports = setupGuild;