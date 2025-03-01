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
            // استخدام Array.from بدلاً من الوصول المباشر للكاش
            const guilds = Array.from(interaction.client.guilds.cache.values());
            const totalMembers = guilds.reduce((acc, guild) => acc + guild.memberCount, 0);
            
            // إنشاء Embed رئيسي
            const mainEmbed = new EmbedBuilder()
                .setTitle('📊 إحصائيات البوت')
                .setColor(0x0099FF)
                .addFields(
                    { name: 'عدد السيرفرات', value: `${guilds.length}`, inline: true },
                    { name: 'إجمالي الأعضاء', value: `${totalMembers}`, inline: true }
                )
                .setTimestamp();

            // إنشاء Embeds للسيرفرات
            const serverEmbeds = [];
            let currentEmbed = new EmbedBuilder()
                .setTitle('🔍 قائمة السيرفرات')
                .setColor(0x0099FF);
            
            let fieldCount = 0;

            for (const guild of guilds) {
                try {
                    // استخدام طرق آمنة للوصول إلى البيانات
                    const botMember = guild.members.cache.get(interaction.client.user.id);
                    const botJoinDate = botMember ? botMember.joinedAt : new Date();
                    
                    // الحصول على معلومات المالك بشكل آمن
                    const owner = await guild.fetchOwner().catch(() => null);
                    const ownerTag = owner ? owner.user.tag : 'غير معروف';
                    
                    // إنشاء حقل للسيرفر
                    const fieldValue = [
                        `👑 المالك: ${ownerTag}`,
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
                } catch (guildError) {
                    console.error(`Error processing guild ${guild.id || 'unknown'}:`, guildError);
                    // استمرار المعالجة رغم الخطأ في هذا السيرفر
                }
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
                content: `❌ حدث خطأ أثناء جلب قائمة السيرفرات: ${error.message}`,
                ephemeral: true
            });
        }
    },
};