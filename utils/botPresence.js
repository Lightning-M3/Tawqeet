const logger = require('./logger');

// تخزين آخر تحديث للحالة وعدد السيرفرات
let lastPresenceUpdate = 0;
let lastGuildCount = 0;

/**
 * تحديث حالة البوت
 * @param {Client} client - كائن البوت
 * @returns {Promise<void>}
 */
async function updateBotPresence(client) {
    try {
        // التحقق من وجود client
        if (!client) {
            logger.error('Client object not found in updateBotPresence');
            return;
        }

        // التحقق من وجود client.user
        if (!client.user) {
            logger.warn('client.user not found after, skipping update');
            return;
        }

        // التحقق من جاهزية البوت
        if (!client.isReady()) {
            logger.warn('Bot is not ready yet, deferring update');
            return;
        }

        const now = Date.now();
        const currentGuildCount = client.guilds.cache.size;
        
        // تحديث فقط إذا مر وقت كافٍ (10 دقائق) أو تغير عدد السيرفرات
        if (now - lastPresenceUpdate < 600000 && currentGuildCount === lastGuildCount) {
            return;
        }
        
        // تحديث حالة البوت
        await client.user.setPresence({
            activities: [{
                name: `${currentGuildCount} servers`,
                type: 3 // WATCHING
            }],
            status: 'online'
        });
        
        // تحديث المتغيرات المخزنة
        lastPresenceUpdate = now;
        lastGuildCount = currentGuildCount;

        logger.info(`Bot is now online on ${currentGuildCount} servers`);

    } catch (error) {
        logger.error('Error updating bot presence:', {
            error: error.message,
            stack: error.stack
        });
    }
}

module.exports = { updateBotPresence };