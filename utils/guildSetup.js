const { PermissionFlagsBits, ChannelType } = require('discord.js');
const GuildSettings = require('../models/GuildSettings');
const logger = require('./logger');
const { checkRequiredChannels, checkBotPermissions } = require('./helpers');

/**
 * دالة إعداد السيرفر
 * تقوم بإنشاء القنوات والأدوار المطلوبة وتكوين الإعدادات الأساسية
 * تدعم إعادة تهيئة السيرفر في حالة إعادة إضافة البوت
 * @param {Object} guild كائن السيرفر من discord.js
 * @param {Object} options خيارات إضافية للإعداد
 * @param {boolean} [options.forceReset=false] إجبار إعادة الإعداد حتى لو كان الإعداد مكتمل سابقًا
 * @param {boolean} [options.cleanExisting=false] حذف قنوات/أدوار الإعداد السابق موجودة
 * @returns {Promise<Object>} نتيجة عملية الإعداد
 * @throws {Error} في حالة فشل عملية الإعداد
 */
async function setupGuild(guild, options = {}) {
    const { forceReset = false, cleanExisting = false } = options;
    logger.info(`بدء إعداد السيرفر ${guild.name}${forceReset ? ' (إعادة إعداد إجبارية)' : ''}`);
    
    try {
        // التحقق من وجود إعداد سابق في قاعدة البيانات
        let guildConfig = await GuildSettings.findOne({ guildId: guild.id });
        
        // التحقق مما إذا كان الإعداد مكتمل سابقًا وعدم وجود طلب لإعادة الإعداد
        if (guildConfig && guildConfig.setupComplete && !forceReset) {
            logger.info(`تم إعداد السيرفر ${guild.name} سابقًا. استخدم forceReset لإعادة الإعداد.`);
            return { 
                success: true, 
                message: "تم إعداد السيرفر سابقًا", 
                wasSetupBefore: true 
            };
        }
        
        // حذف الإعداد السابق من قاعدة البيانات إذا تم تحديد cleanExisting
        if (guildConfig && cleanExisting) {
            logger.info(`حذف الإعداد السابق للسيرفر ${guild.name}`);
            await GuildSettings.deleteOne({ guildId: guild.id });
            guildConfig = null;
        }
        
        // التحقق من صلاحيات البوت
        const missingPermissions = await checkBotPermissions(guild, guild.client);
        if (missingPermissions.length > 0) {
            logger.warn(`البوت يفتقد الصلاحيات المطلوبة في السيرفر ${guild.name}`, { missingPermissions });
            return { 
                success: false, 
                message: "البوت يفتقد الصلاحيات المطلوبة", 
                missingPermissions 
            };
        }
        
        // إنشاء أو الحصول على القنوات والأدوار المطلوبة
        const setupResults = await setupRequiredResources(guild, cleanExisting);
        
        // تحديث أو إنشاء إعدادات السيرفر في قاعدة البيانات
        guildConfig = await updateGuildSettings(guild, setupResults, guildConfig);
        
        logger.info(`تم إكمال إعداد السيرفر ${guild.name} بنجاح`);
        return { 
            success: true, 
            message: "تم إكمال الإعداد بنجاح", 
            setupResults 
        };
    } catch (error) {
        logger.error(`خطأ أثناء إعداد السيرفر ${guild.name}`, { error });
        throw error; // إعادة رمي الخطأ للمعالجة في المستدعي
    }
}

/**
 * دالة لإعداد الموارد المطلوبة (قنوات وأدوار)
 * @param {Object} guild كائن السيرفر
 * @param {boolean} cleanExisting حذف الموارد الموجودة قبل إنشائها من جديد
 * @returns {Promise<Object>} نتائج الإعداد
 */
async function setupRequiredResources(guild, cleanExisting = false) {
    const results = {
        channels: { created: [], existing: [], failed: [] },
        roles: { created: [], existing: [], failed: [] }
    };
    
    // قائمة القنوات المطلوبة مع إعداداتها
    const requiredChannels = [
        { 
            name: 'سجل-التذاكر', 
            type: ChannelType.GuildText,
            permissions: [
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
        },
        { 
            name: 'سجل-الحضور', 
            type: ChannelType.GuildText,
            permissions: [
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
        },
        { 
            name: 'سجل-الأخطاء', 
            type: ChannelType.GuildText,
            permissions: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: guild.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels,
                        PermissionFlagsBits.EmbedLinks
                    ]
                }
            ]
        }
    ];
    
    // إعداد القنوات المطلوبة
    for (const channelConfig of requiredChannels) {
        try {
            // البحث عن القناة الموجودة
            let channel = guild.channels.cache.find(c => c.name === channelConfig.name);
            
            // حذف القناة إذا كانت موجودة وتم تحديد cleanExisting
            if (channel && cleanExisting) {
                await channel.delete().catch(err => {
                    logger.warn(`فشل في حذف القناة ${channelConfig.name}:`, err);
                });
                channel = null;
            }
            
            // إنشاء القناة إذا لم تكن موجودة
            if (!channel) {
                channel = await guild.channels.create({
                    name: channelConfig.name,
                    type: channelConfig.type,
                    permissionOverwrites: channelConfig.permissions
                });
                
                results.channels.created.push({
                    name: channelConfig.name,
                    id: channel.id
                });
                
                logger.info(`تم إنشاء قناة ${channelConfig.name} في السيرفر ${guild.name}`);
            } else {
                results.channels.existing.push({
                    name: channelConfig.name,
                    id: channel.id
                });
                
                logger.info(`قناة ${channelConfig.name} موجودة بالفعل في السيرفر ${guild.name}`);
                
                // تحديث أذونات القناة الموجودة
                await channel.permissionOverwrites.set(channelConfig.permissions);
            }
        } catch (error) {
            logger.error(`فشل في إنشاء/تحديث قناة ${channelConfig.name} في السيرفر ${guild.name}`, { error });
            results.channels.failed.push({
                name: channelConfig.name,
                error: error.message
            });
        }
    }
    
    // إضافة منطق مشابه للأدوار إذا لزم الأمر
    // TODO: إضافة إعداد الأدوار المطلوبة
    
    return results;
}

/**
 * تحديث أو إنشاء إعدادات السيرفر في قاعدة البيانات
 * @param {Object} guild كائن السيرفر
 * @param {Object} setupResults نتائج الإعداد
 * @param {Object|null} guildConfig إعدادات السيرفر الموجودة (إن وجدت)
 * @returns {Promise<Object>} إعدادات السيرفر المحدثة
 */
async function updateGuildSettings(guild, setupResults, guildConfig = null) {
    // دمج القنوات التي تم إنشاؤها والموجودة مسبقًا
    const allChannels = [...setupResults.channels.created, ...setupResults.channels.existing];
    
    // البحث عن القنوات المحددة بالاسم
    const findChannelId = (name) => {
        const channel = allChannels.find(c => c.name === name);
        return channel ? channel.id : null;
    };
    
    // إنشاء كائن الإعدادات الجديد أو تحديث الموجود
    if (!guildConfig) {
        guildConfig = new GuildSettings({
            guildId: guild.id,
            guildName: guild.name,
            setupComplete: true,
            setupDate: new Date(),
            errorChannelId: findChannelId('سجل-الأخطاء'),
            logChannelId: findChannelId('سجل-التذاكر'),
            attendanceChannelId: findChannelId('سجل-الحضور'),
            features: {
                attendance: {
                    enabled: true,
                    channelId: findChannelId('سجل-الحضور')
                },
                tickets: {
                    enabled: true,
                    logChannelId: findChannelId('سجل-التذاكر')
                },
                welcome: {
                    enabled: true
                }
            }
        });
        
        await guildConfig.save();
        logger.info(`تم إنشاء إعدادات جديدة للسيرفر ${guild.name}`);
    } else {
        // تحديث الإعدادات الموجودة
        guildConfig.setupComplete = true;
        guildConfig.guildName = guild.name;
        guildConfig.updatedAt = new Date();
        
        // تحديث القنوات إذا تم إنشاؤها
        if (findChannelId('سجل-الأخطاء')) {
            guildConfig.errorChannelId = findChannelId('سجل-الأخطاء');
        }
        
        if (findChannelId('سجل-التذاكر')) {
            guildConfig.logChannelId = findChannelId('سجل-التذاكر');
            if (guildConfig.features && guildConfig.features.tickets) {
                guildConfig.features.tickets.logChannelId = findChannelId('سجل-التذاكر');
                guildConfig.features.tickets.enabled = true;
            }
        }
        
        if (findChannelId('سجل-الحضور')) {
            guildConfig.attendanceChannelId = findChannelId('سجل-الحضور');
            if (guildConfig.features && guildConfig.features.attendance) {
                guildConfig.features.attendance.channelId = findChannelId('سجل-الحضور');
                guildConfig.features.attendance.enabled = true;
            }
        }
        
        await guildConfig.save();
        logger.info(`تم تحديث إعدادات السيرفر ${guild.name}`);
    }
    
    return guildConfig;
}

// تصدير الدالة بشكل واضح
module.exports = { setupGuild };
