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

        // تحديث حالة البوت
        await client.user.setPresence({
            activities: [{
                name: `${client.guilds.cache.size} servers`,
                type: 3 // WATCHING
            }],
            status: 'online'
        });

        logger.info('Bot is now online on ${client.guilds.cache.size} servers');

    } catch (error) {
        logger.error('Error updating bot presence:', {
            error: error.message,
            stack: error.stack
        });
    }
}

module.exports = { updateBotPresence }; 