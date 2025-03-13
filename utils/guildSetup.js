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
            guildConfig = new GuildSettings({ 
                guildId: guild.id,
                setupComplete: false // تعيين الإعداد كغير مكتمل حتى يقوم المستخدم بإعداده يدوياً
            });
            
            // حفظ الإعدادات الأساسية فقط دون إنشاء قنوات أو أدوار
            await guildConfig.save();
            logger.info(`تم إنشاء إعدادات أساسية للسيرفر ${guild.name} - يرجى استخدام أمر /setup لإكمال الإعداد`);
            return;
        }
        
        // إذا كانت الإعدادات موجودة بالفعل، نتحقق فقط من صحتها
        logger.info(`تم التحقق من إعدادات السيرفر ${guild.name}`);


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