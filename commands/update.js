const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// استخدام مسار مطلق للتأكد من تحميل الملف بشكل صحيح
const commandUtilsPath = path.join(__dirname, '..', 'utils', 'commandUtils.js');

let loadCommands;
try {
    const commandUtils = require(commandUtilsPath);
    loadCommands = commandUtils.loadCommands;
    
    if (!loadCommands) {
        console.error(`[خطأ] دالة loadCommands غير موجودة في الملف: ${commandUtilsPath}`);
        // تعريف نسخة احتياطية من الدالة في حالة الفشل
        loadCommands = async function() {
            const commands = [];
            const commandsPath = path.join(__dirname, '..');
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    const command = require(filePath);
                    if ('data' in command && 'execute' in command) {
                        commands.push(command.data.toJSON());
                    }
                } catch (error) {
                    console.error(`[خطأ] فشل في تحميل الأمر من ${filePath}:`, error);
                }
            }
            
            return commands;
        };
    }
} catch (error) {
    console.error(`[خطأ] فشل في استيراد ملف commandUtils:`, error);
    // تعريف نسخة احتياطية من الدالة في حالة الفشل
    loadCommands = async function() {
        const commands = [];
        const commandsPath = path.join(__dirname, '..');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            try {
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                }
            } catch (error) {
                console.error(`[خطأ] فشل في تحميل الأمر من ${filePath}:`, error);
            }
        }
        
        return commands;
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('تحديث أوامر البوت')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const rest = new REST().setToken(process.env.TOKEN);
            
            // تحديث الأوامر
            console.log('[معلومات] جاري تحميل الأوامر...');
            const commands = await loadCommands();
            console.log(`[معلومات] تم تحميل ${commands.length} أمر بنجاح`);
            
            console.log('[معلومات] جاري تحديث الأوامر على Discord API...');
            await rest.put(
                Routes.applicationCommands(interaction.client.user.id),
                { body: commands }
            );
            
            console.log('[معلومات] تم تحديث الأوامر بنجاح');
            await interaction.editReply({
                content: `✅ تم تحديث ${commands.length} أمر بنجاح`,
                ephemeral: true
            });
        } catch (error) {
            console.error('[خطأ] فشل في تحديث الأوامر:', error);
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: '❌ حدث خطأ أثناء تحديث الأوامر. يرجى التحقق من سجلات الخطأ.',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ حدث خطأ أثناء تحديث الأوامر. يرجى التحقق من سجلات الخطأ.',
                    ephemeral: true
                });
            }
        }
    }
};