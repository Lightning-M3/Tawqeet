const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('servers-list')
        .setDescription('عرض قائمة السيرفرات (لصاحب البوت فقط)'),

    async execute(interaction) {
        // التحقق من صاحب البوت
        if (interaction.user.id !== process.env.OWNER_ID) {
            return await interaction.reply({
                content: '❌ هذا الأمر متاح فقط لصاحب البوت',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const guilds = interaction.client.guilds.cache;
            const totalMembers = guilds.reduce((acc, guild) => acc + guild.memberCount, 0);
            
            // إنشاء Embed رئيسي
            const mainEmbed = new EmbedBuilder()
                .setTitle('📊 إحصائيات البوت')
                .setColor(0x0099FF)
                .addFields(
                    { name: 'عدد السيرفرات', value: `${guilds.size}`, inline: true },
                    { name: 'إجمالي الأعضاء', value: `${totalMembers}`, inline: true }
                )
                .setTimestamp();

            // إنشاء Embeds للسيرفرات
            const serverEmbeds = [];
            let currentEmbed = new EmbedBuilder()
                .setTitle('🔍 قائمة السيرفرات')
                .setColor(0x0099FF);
            
            let fieldCount = 0;

            for (const [, guild] of guilds) {
                // الحصول على تاريخ دخول البوت
                const botJoinDate = guild.members.cache.get(interaction.client.user.id).joinedAt;
                
                // الحصول على معلومات المالك
                const owner = await guild.fetchOwner();
                
                // إنشاء حقل للسيرفر
                const fieldValue = [
                    `👑 المالك: ${owner.user.tag}`,
                    `👥 الأعضاء: ${guild.memberCount}`,
                    `🤖 تاريخ دخول البوت: <t:${Math.floor(botJoinDate.getTime() / 1000)}:R>`,
                    `🔗 رابط الصورة: ${guild.iconURL() || 'لا يوجد'}`,
                    `🆔 معرف السيرفر: ${guild.id}`
                ].join('\n');

                // إذا وصل عدد الحقول إلى 10، نبدأ embed جديد
                if (fieldCount === 10) {
                    serverEmbeds.push(currentEmbed);
                    currentEmbed = new EmbedBuilder()
                        .setTitle('🔍 قائمة السيرفرات (تابع)')
                        .setColor(0x0099FF);
                    fieldCount = 0;
                }

                currentEmbed.addFields({
                    name: `${guild.name}`,
                    value: fieldValue,
                    inline: false
                });

                fieldCount++;
            }

            // إضافة آخر embed إذا كان يحتوي على حقول
            if (fieldCount > 0) {
                serverEmbeds.push(currentEmbed);
            }

            // إرسال جميع الـ Embeds
            await interaction.editReply({ embeds: [mainEmbed] });
            
            // إرسال باقي الـ Embeds في رسائل منفصلة
            for (const embed of serverEmbeds) {
                await interaction.followUp({ embeds: [embed], ephemeral: true });
            }

        } catch (error) {
            console.error('Error in servers-list command:', error);
            await interaction.editReply({
                content: '❌ حدث خطأ أثناء جلب قائمة السيرفرات',
                ephemeral: true
            });
        }
    },
}; 