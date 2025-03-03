const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('./logger');
const GuildSettings = require('../models/GuildSettings');
const { retryOperation } = require('./helpers');

/**
 * إعداد سيرفر جديد عند انضمام البوت إليه
 * @param {Guild} guild - كائن السيرفر
 * @returns {Promise<boolean>} نجاح أو فشل العملية
 */
async function setupGuild(guild) {
    logger.info(`بدء إعداد السيرفر ${guild.name} (${guild.id})`);
    
    try {
        // التحقق من صلاحيات البوت
        const botMember = guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ];

        const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
        
        if (missingPermissions.length > 0) {
            logger.warn(`البوت يفتقد للصلاحيات التالية في سيرفر ${guild.name}: ${missingPermissions.join(', ')}`);
            return false;
        }

        // البحث عن إعدادات السيرفر أو إنشاء إعدادات جديدة
        let guildSettings = await retryOperation(async () => {
            return await GuildSettings.findOne({ guildId: guild.id });
        });

        if (!guildSettings) {
            logger.info(`إنشاء إعدادات جديدة لسيرفر ${guild.name}`);
            guildSettings = new GuildSettings({
                guildId: guild.id,
                attendanceRoleId: '',
                welcomeChannelId: '',
                logsChannelId: ''
            });
        }

        // إنشاء قنوات السجلات إذا لم تكن موجودة
        const logCategory = await createCategoryIfNotExists(guild, '📊 سجلات النظام');
        
        // إنشاء قناة سجلات النظام
        const logsChannel = await createChannelIfNotExists(guild, 'سجل-النظام', {
            type: ChannelType.GuildText,
            parent: logCategory.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: botMember.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });
        
        // إنشاء قناة سجلات الحضور
        const attendanceLogsChannel = await createChannelIfNotExists(guild, 'سجل-الحضور', {
            type: ChannelType.GuildText,
            parent: logCategory.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages]
                },
                {
                    id: botMember.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        // إنشاء قناة سجلات التذاكر
        const ticketLogsChannel = await createChannelIfNotExists(guild, 'سجل-التذاكر', {
            type: ChannelType.GuildText,
            parent: logCategory.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: botMember.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        // إنشاء رتبة الحضور إذا لم تكن موجودة
        let attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        
        if (!attendanceRole) {
            attendanceRole = await guild.roles.create({
                name: 'مسجل حضوره',
                color: 0x00FF00,
                reason: 'رتبة نظام الحضور'
            });
        }

        // إنشاء قسم نظام الحضور
        const attendanceCategory = await createCategoryIfNotExists(guild, '📋 نظام الحضور');
        
        // إنشاء قناة تسجيل الحضور
        const attendanceChannel = await createChannelIfNotExists(guild, 'تسجيل-الحضور', {
            type: ChannelType.GuildText,
            parent: attendanceCategory.id,
            permissionOverwrites: [
                {
                    id: guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages]
                },
                {
                    id: botMember.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        // إنشاء أزرار تسجيل الحضور والانصراف
        const attendanceEmbed = new EmbedBuilder()
            .setTitle('📋 نظام تسجيل الحضور')
            .setDescription('استخدم الأزرار أدناه لتسجيل حضورك وانصرافك')
            .setColor(0x0099FF)
            .setTimestamp();

        const attendanceButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('check_in')
                    .setLabel('تسجيل حضور')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('check_out')
                    .setLabel('تسجيل انصراف')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏹️')
            );

        await attendanceChannel.send({
            embeds: [attendanceEmbed],
            components: [attendanceButtons]
        });

        // تحديث إعدادات السيرفر
        guildSettings.attendanceRoleId = attendanceRole.id;
        guildSettings.welcomeChannelId = attendanceChannel.id; // مؤقتاً نستخدم قناة الحضور كقناة ترحيب
        guildSettings.logsChannelId = logsChannel.id;
        guildSettings.attendanceChannelId = attendanceChannel.id;
        guildSettings.features.attendance.enabled = true;
        guildSettings.features.attendance.roleId = attendanceRole.id;
        guildSettings.features.attendance.channelId = attendanceChannel.id;
        guildSettings.setupComplete = true;

        await guildSettings.save();

        // إرسال رسالة ترحيب للسيرفر
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('👋 شكراً لإضافة البوت')
            .setDescription(`تم إعداد السيرفر بنجاح! استخدم الأمر "/help" للحصول على قائمة بجميع الأوامر المتاحة.`)
            .setColor(0x00FF00)
            .setTimestamp();

        // محاولة إرسال رسالة ترحيب في أول قناة متاحة
        const defaultChannel = guild.channels.cache
            .filter(channel => 
                channel.type === ChannelType.GuildText && 
                channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
            )
            .sort((a, b) => a.position - b.position)
            .first();

        if (defaultChannel) {
            await defaultChannel.send({ embeds: [welcomeEmbed] });
        }

        logger.info(`تم إعداد سيرفر ${guild.name} بنجاح`);
        return true;
    } catch (error) {
        logger.error(`فشل في إعداد سيرفر ${guild.name}:`, error);
        return false;
    }
}

/**
 * إنشاء قسم إذا لم يكن موجوداً
 * @param {Guild} guild - كائن السيرفر
 * @param {string} name - اسم القسم
 * @returns {Promise<CategoryChannel>} القسم
 */
async function createCategoryIfNotExists(guild, name) {
    let category = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        c.name === name
    );

    if (!category) {
        category = await guild.channels.create({
            name: name,
            type: ChannelType.GuildCategory
        });
    }

    return category;
}

/**
 * إنشاء قناة إذا لم تكن موجودة
 * @param {Guild} guild - كائن السيرفر
 * @param {string} name - اسم القناة
 * @param {Object} options - خيارات إنشاء القناة
 * @returns {Promise<TextChannel>} القناة
 */
async function createChannelIfNotExists(guild, name, options) {
    let channel = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && 
        c.name === name
    );

    if (!channel) {
        channel = await guild.channels.create({
            name: name,
            ...options
        });
    }

    return channel;
}

module.exports = { setupGuild };