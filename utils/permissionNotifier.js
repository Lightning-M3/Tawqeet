const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

/**
 * نظام إشعارات الصلاحيات
 * يقوم بإرسال إشعارات لمالكي السيرفرات عندما يفتقد البوت للصلاحيات اللازمة
 */
class PermissionNotifier {
    constructor(client) {
        this.client = client;
        this.notificationCache = new Map(); // لتجنب إرسال إشعارات متكررة
        this.notificationCooldown = 24 * 60 * 60 * 1000; // 24 ساعة
    }

    /**
     * معالجة خطأ الصلاحيات وإرسال إشعار لمالك السيرفر
     * @param {string} guildId - معرف السيرفر
     * @param {string} channelId - معرف القناة
     * @param {string} channelName - اسم القناة
     * @param {string} permission - الصلاحية المفقودة
     */
    async handlePermissionError(guildId, channelId, channelName, permission) {
        try {
            // التحقق من وجود السيرفر
            const guild = await this.client.guilds.fetch(guildId).catch(() => null);
            if (!guild) {
                logger.warn(`لا يمكن العثور على السيرفر: ${guildId}`);
                return;
            }

            // التحقق من الكاش لتجنب الإشعارات المتكررة
            const cacheKey = `${guildId}-${channelId}-${permission}`;
            const lastNotification = this.notificationCache.get(cacheKey);
            const now = Date.now();

            if (lastNotification && now - lastNotification < this.notificationCooldown) {
                logger.debug(`تم تجاهل إشعار الصلاحيات (في فترة الانتظار): ${cacheKey}`);
                return;
            }

            // تحديث الكاش
            this.notificationCache.set(cacheKey, now);

            // الحصول على مالك السيرفر
            const owner = await guild.fetchOwner().catch(() => null);
            if (!owner) {
                logger.warn(`لا يمكن العثور على مالك السيرفر: ${guild.name} (${guildId})`);
                return;
            }

            // ترجمة اسم الصلاحية إلى العربية
            const permissionTranslation = this.translatePermission(permission);

            // إنشاء رسالة الإشعار
            const embed = new EmbedBuilder()
                .setTitle('⚠️ تنبيه: نقص في صلاحيات البوت')
                .setDescription(`البوت يفتقد لصلاحيات مهمة في سيرفر **${guild.name}**`)
                .addFields([
                    {
                        name: '🔍 المشكلة',
                        value: `البوت لا يملك صلاحية **${permissionTranslation}** في قناة **${channelName}**`
                    },
                    {
                        name: '❓ لماذا هذا مهم',
                        value: 'هذه الصلاحية ضرورية لعمل البوت بشكل صحيح وتقديم جميع الخدمات المطلوبة.'
                    },
                    {
                        name: '🛠️ كيفية الإصلاح',
                        value: `1. اذهب إلى إعدادات السيرفر > الأدوار\n2. اختر دور البوت\n3. تأكد من منح صلاحية **${permissionTranslation}**\n4. أو قم بإعطاء البوت صلاحية **Administrator** لحل جميع مشاكل الصلاحيات`
                    }
                ])
                .setColor(0xffcc00)
                .setTimestamp();

            // إرسال الإشعار لمالك السيرفر
            await owner.send({ embeds: [embed] }).catch(error => {
                logger.error(`فشل في إرسال إشعار الصلاحيات لمالك السيرفر:`, {
                    guildId,
                    ownerId: owner.id,
                    error: error.message
                });
            });

            logger.info(`تم إرسال إشعار الصلاحيات لمالك السيرفر:`, {
                guildId,
                guildName: guild.name,
                ownerId: owner.id,
                channelName,
                permission
            });

        } catch (error) {
            logger.error(`خطأ في معالجة إشعار الصلاحيات:`, {
                error: error.message,
                stack: error.stack,
                guildId,
                channelId,
                permission
            });
        }
    }

    /**
     * ترجمة اسم الصلاحية إلى العربية
     * @param {string} permission - اسم الصلاحية
     * @returns {string} الاسم المترجم
     */
    translatePermission(permission) {
        const translations = {
            'SendMessages': 'إرسال الرسائل',
            'ViewChannel': 'عرض القناة',
            'ManageChannels': 'إدارة القنوات',
            'ManageRoles': 'إدارة الأدوار',
            'EmbedLinks': 'تضمين الروابط',
            'AttachFiles': 'إرفاق الملفات',
            'ReadMessageHistory': 'قراءة سجل الرسائل',
            'Administrator': 'مسؤول'
        };

        return translations[permission] || permission;
    }
}

module.exports = PermissionNotifier;