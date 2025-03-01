const logger = require('./logger');

/**
 * تحديث حالة البوت
 * @param {Client} client - كائن البوت
 * @returns {Promise<void>}
 */
async function updateBotPresence(client) {
    try {
        // التحقق من وجود client
        if (!client) {
            logger.error('كائن client غير معرف في updateBotPresence');
            return;
        }

        // التحقق من وجود client.user
        if (!client.user) {
            logger.warn('client.user غير معرف بعد، يتم تأجيل تحديث الحالة');
            return;
        }

        // التحقق من جاهزية البوت
        if (!client.isReady()) {
            logger.warn('البوت غير جاهز بعد، يتم تأجيل تحديث الحالة');
            return;
        }

        // تحديث حالة البوت
        await client.user.setPresence({
            activities: [{
                name: `${client.guilds.cache.size} servers`,
                type: 3 // WATCHING
            }],
            status: 'online'
        });

        logger.info('تم تحديث حالة البوت بنجاح', {
            guildsCount: client.guilds.cache.size,
            status: 'online'
        });

    } catch (error) {
        logger.error('خطأ في تحديث حالة البوت:', {
            error: error.message,
            stack: error.stack
        });
    }
}

module.exports = { updateBotPresence }; 