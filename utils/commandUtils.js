/**
 * @file commandUtils.js
 * @description أدوات مساعدة لإدارة أوامر البوت
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * تحميل جميع الأوامر من مجلد الأوامر
 * @returns {Array} مصفوفة من الأوامر بتنسيق JSON
 */
async function loadCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.warn(`[تحذير] الأمر في ${filePath} يفتقد إلى خاصية 'data' أو 'execute' المطلوبة`);
            }
        } catch (error) {
            console.error(`[خطأ] فشل في تحميل الأمر من ${filePath}:`, error);
        }
    }

    return commands;
}

module.exports = {
    loadCommands
};
