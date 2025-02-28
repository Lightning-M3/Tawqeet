const { PermissionFlagsBits, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const GuildSettings = require('../models/GuildSettings');
const logger = require('./logger');

// دالة للتحقق من وجود القنوات المطلوبة
async function checkRequiredChannels(guild) {
  const requiredChannels = ['سجل-التذاكر', 'سجل-الحضور'];
  const missingChannels = [];

  for (const channelName of requiredChannels) {
    if (!guild.channels.cache.find(c => c.name === channelName)) {
      missingChannels.push(channelName);
    }
  }

  return missingChannels;
}

// دالة للتحقق من صلاحيات البوت
async function checkBotPermissions(guild, client) {
  const botMember = guild.members.cache.get(client.user.id);
  const requiredPermissions = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.EmbedLinks
  ];

  return requiredPermissions.filter(perm => !botMember.permissions.has(perm));
}

// دالة لإعادة محاولة العمليات
async function retryOperation(operation, maxRetries = 5, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      logger.warn(`Retry attempt ${i + 1}/${maxRetries}`, { error: error.message });
      
      // انتظار متزايد بين المحاولات
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      
      // التحقق من حالة الاتصال
      if (mongoose.connection.readyState !== 1) {
        try {
          await mongoose.connect(process.env.MONGO_URI);
        } catch (connError) {
          logger.error('Failed to reconnect:', connError);
        }
      }
    }
  }
}

// دالة لمعالجة الأخطاء
async function handleError(interaction, error, customMessage = null) {
  console.error('Error:', error);
  
  let errorMessage = customMessage || 'حدث خطأ أثناء تنفيذ العملية';
  
  if (error.name === 'MongoNetworkError') {
    errorMessage = 'حدث خطأ في الاتصال بقاعدة البيانات. الرجاء المحاولة لاحقاً.';
  } else if (error.code === 50013) {
    errorMessage = 'البوت لا يملك الصلاحيات الكافية.';
  } else if (error.code === 50001) {
    errorMessage = 'لا يمكن الوصول إلى القناة المطلوبة.';
  }

  try {
    if (interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  } catch (e) {
    console.error('فشل في إرسال رسالة الخطأ:', e);
  }
}

// دالة إنشاء وإدارة قناة الأخطاء
async function setupErrorChannel(guild) {
    try {
        let guildSettings = await GuildSettings.findOne({ guildId: guild.id });
        
        if (!guildSettings) {
            guildSettings = new GuildSettings({ guildId: guild.id });
        }

        let errorChannel;
        
        if (guildSettings.errorChannelId) {
            errorChannel = await guild.channels.fetch(guildSettings.errorChannelId).catch(() => null);
        }

        if (!errorChannel) {
            errorChannel = await guild.channels.create({
                name: 'سجل-الأخطاء',
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: ['ViewChannel']
                    },
                    {
                        id: guild.roles.highest.id,
                        allow: ['ViewChannel', 'ReadMessageHistory']
                    }
                ],
                reason: 'إنشاء قناة سجل الأخطاء'
            });

            guildSettings.errorChannelId = errorChannel.id;
            await guildSettings.save();
            
            logger.info(`تم إنشاء قناة سجل الأخطاء في السيرفر ${guild.name} (${guild.id})`);
        }

        return errorChannel;
    } catch (error) {
        logger.error('خطأ في إعداد قناة الأخطاء:', error);
        return null;
    }
}

// دالة للحصول على قناة الأخطاء
async function getErrorChannel(guild) {
    try {
        const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
        if (!guildSettings?.errorChannelId) {
            return await setupErrorChannel(guild);
        }

        const channel = await guild.channels.fetch(guildSettings.errorChannelId).catch(() => null);
        if (!channel) {
            return await setupErrorChannel(guild);
        }

        return channel;
    } catch (error) {
        logger.error('خطأ في الحصول على قناة الأخطاء:', error);
        return null;
    }
}

/**
 * دالة مساعدة لتنسيق صيغ الوقت بالعربية (مفرد، مثنى، جمع)
 * @param {number} number الرقم الذي سيتم تنسيقه
 * @param {string} singular صيغة المفرد (ساعة/دقيقة)
 * @param {string} dual صيغة المثنى (ساعتان/دقيقتان)
 * @param {string} plural صيغة الجمع (ساعات/دقائق)
 * @returns {string} النص المنسق بالعربية
 */
function formatArabicTime(number, singular, dual, plural) {
    if (number === 0) return '';
    if (number === 1) return `${number} ${singular}`;
    if (number === 2) return `${dual}`;
    if (number >= 3 && number <= 10) return `${number} ${plural}`;
    return `${number} ${singular}`;
}

module.exports = {
  checkRequiredChannels,
  checkBotPermissions,
  retryOperation,
  handleError,
  setupErrorChannel,
  getErrorChannel,
  formatArabicTime
}; 