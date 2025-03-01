const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

// التحقق من المتغيرات البيئية
if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
    console.error('❌ يجب توفير DISCORD_TOKEN و DISCORD_CLIENT_ID في ملف .env');
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// تحميل الأوامر
console.log('📝 جاري تحميل الأوامر...');
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ تم تحميل الأمر: ${command.data.name}`);
    } else {
        console.log(`⚠️ الأمر في ${file} يفتقد إلى خصائص مطلوبة`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`\n🔄 جاري تحديث ${commands.length} من الأوامر...`);

        // تحديث الأوامر
        const data = await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ تم تحديث ${data.length} من الأوامر بنجاح!`);
        console.log('🔍 الأوامر المحدثة:');
        data.forEach(cmd => console.log(`- ${cmd.name}`));

    } catch (error) {
        console.error('❌ حدث خطأ أثناء تحديث الأوامر:');
        if (error.code === 50035) {
            console.error('تأكد من صحة DISCORD_CLIENT_ID في ملف .env');
        }
        console.error(error);
    }
})(); 