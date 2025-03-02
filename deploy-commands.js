const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

// التحقق من المتغيرات البيئية
if (!process.env.TOKEN || !process.env.DISCORD_CLIENT_ID) {
    console.error('❌ يجب توفير TOKEN و DISCORD_CLIENT_ID في ملف .env');
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// قائمة الأوامر التي يجب أن تكون محظورة من الرسائل الخاصة
const serverOnlyCommands = ['setup', 'adminData', 'open-sessions'];

// تحميل الأوامر
console.log('📝 جاري تحميل الأوامر...');
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        const commandData = command.data.toJSON();
        
        // إضافة خاصية dmPermission: false فقط للأوامر المحددة
        if (serverOnlyCommands.includes(commandData.name)) {
            commandData.dm_permission = false;
            console.log(`✅ تم تحميل الأمر: ${commandData.name} (متاح فقط في السيرفرات)`);
        } else {
            console.log(`✅ تم تحميل الأمر: ${commandData.name}`);
        }
        
        commands.push(commandData);
    } else {
        console.log(`⚠️ الأمر في ${file} يفتقد إلى خصائص مطلوبة`);
    }
}

const rest = new REST().setToken(process.env.TOKEN);

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
        data.forEach(cmd => {
            const isServerOnly = serverOnlyCommands.includes(cmd.name);
            console.log(`- ${cmd.name}${isServerOnly ? ' (متاح فقط في السيرفرات)' : ''}`);
        });

    } catch (error) {
        console.error('❌ حدث خطأ أثناء تحديث الأوامر:');
        if (error.code === 50035) {
            console.error('تأكد من صحة DISCORD_CLIENT_ID في ملف .env');
        }
        console.error(error);
    }
})(); 