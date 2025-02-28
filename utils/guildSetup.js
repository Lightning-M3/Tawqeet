const { PermissionFlagsBits, ChannelType } = require('discord.js');
const GuildSettings = require('../models/GuildSettings');
const logger = require('./logger');
const { checkRequiredChannels, checkBotPermissions } = require('./helpers');

/**
 * دالة إعداد السيرفر
 * تقوم بإنشاء القنوات والأدوار المطلوبة وتكوين الإعدادات الأساسية
 * @param {Guild} guild كائن السيرفر
 * @returns {Promise<void>}
 */
async function setupGuild(guild) {
    logger.info(`بدء إعداد السيرفر ${guild.name}`);
    
    try {
        // التحقق من صلاحيات البوت
        const missingPermissions = await checkBotPermissions(guild, guild.client);
        if (missingPermissions.length > 0) {
            logger.warn(`البوت يفتقد الصلاحيات المطلوبة في السيرفر ${guild.name}`, { missingPermissions });
            return;
        }
        
        // إنشاء القنوات المطلوبة إذا لم تكن موجودة
        const missingChannels = await checkRequiredChannels(guild);
        for (const channelName of missingChannels) {
            try {
                await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: [PermissionFlagsBits.SendMessages],
                            allow: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: guild.client.user.id,
                            allow: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.EmbedLinks
                            ]
                        }
                    ]
                });
                logger.info(`تم إنشاء قناة ${channelName} في السيرفر ${guild.name}`);
            } catch (error) {
                logger.error(`فشل في إنشاء قناة ${channelName} في السيرفر ${guild.name}`, { error });
            }
        }
        
        // تحديث أو إنشاء إعدادات السيرفر في قاعدة البيانات
        let guildConfig = await GuildSettings.findOne({ guildId: guild.id });
        
        if (!guildConfig) {
            guildConfig = new GuildSettings({
                guildId: guild.id,
                guildName: guild.name,
                setupComplete: true,
                setupDate: new Date(),
                features: {
                    attendance: true,
                    tickets: true,
                    welcome: true
                }
            });
            await guildConfig.save();
            logger.info(`تم إنشاء إعدادات جديدة للسيرفر ${guild.name}`);
        } else {
            guildConfig.setupComplete = true;
            guildConfig.guildName = guild.name;
            await guildConfig.save();
            logger.info(`تم تحديث إعدادات السيرفر ${guild.name}`);
        }
        
        logger.info(`تم إكمال إعداد السيرفر ${guild.name} بنجاح`);
    } catch (error) {
        logger.error(`خطأ أثناء إعداد السيرفر ${guild.name}`, { error });
        throw error; // إعادة رمي الخطأ للمعالجة في المستدعي
    }
}

module.exports = { setupGuild };
