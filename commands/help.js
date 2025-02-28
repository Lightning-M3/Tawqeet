const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('عرض معلومات عن البوت وأوامره المتاحة'),
    
    async execute(interaction) {
        try {
            // إنشاء الإمبد الرئيسي
            const mainEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🤖 مساعدة البوت')
                .setDescription('مرحبًا بك في نظام المساعدة! هذا البوت يوفر مجموعة من الأدوات لإدارة السيرفر ومساعدة المستخدمين.')
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'تم تطويره بواسطة Lightning @qbr8' });

            // إنشاء إمبد نظام التحضير
            const attendanceEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📋 نظام التحضير')
                .setDescription('نظام متكامل لتسجيل الحضور والانصراف وتتبع أوقات العمل')
                .addFields(
                    { name: '✅ تسجيل الحضور', value: 'استخدم زر "تسجيل حضور" في قناة التحضير لتسجيل حضورك وبدء وقت العمل' },
                    { name: '⏹️ تسجيل الانصراف', value: 'استخدم زر "تسجيل انصراف" في قناة التحضير عند الانتهاء من العمل' },
                    { name: '📊 تقارير الحضور', value: 'يتم إنشاء تقرير يومي تلقائي في قناة سجل-الحضور يوضح إحصائيات الحضور' },
                    { name: '👤 رتبة الحضور', value: 'عند تسجيل الحضور، ستحصل على رتبة "مسجل حضوره" وستتم إزالتها عند الانصراف' },
                    { name: '🏆 نقاط الحضور', value: 'تحصل على نقاط عند تسجيل الحضور والانصراف، مما يساعدك على رفع مستواك' }
                );

            // إنشاء إمبد الأوامر المتاحة
            const commandsEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⌨️ الأوامر المتاحة')
                .setDescription('قائمة بالأوامر المتاحة حاليًا في البوت')
                .addFields(
                    { name: '/help', value: 'عرض هذه القائمة المساعدة' },
                    { name: '/setup', value: 'إعداد أنظمة البوت المختلفة (يتطلب صلاحيات إدارية)' },
                    { name: '/ping', value: 'التحقق من استجابة البوت وزمن الاتصال' },
                    { name: '/update', value: 'تحديث أوامر البوت (للمسؤولين فقط)' },
                    { name: '/adminData', value: 'إدارة بيانات المسؤولين (للمسؤولين فقط)' },
                    { name: '/open-sessions', value: 'عرض جلسات الحضور المفتوحة حاليًا' },
                    { name: '/servers-list', value: 'عرض قائمة بالسيرفرات التي يتواجد فيها البوت (للمطورين فقط)' }
                );

            // إنشاء إمبد معلومات إضافية
            const additionalInfoEmbed = new EmbedBuilder()
                .setColor(0xC0C0C0)
                .setTitle('ℹ️ معلومات إضافية')
                .setDescription('معلومات مهمة عن البوت وتطويره')
                .addFields(
                    { name: '👨‍💻 المطور', value: 'تم تطوير هذا البوت بواسطة Lightning @qbr8' },
                    { name: '🔄 التحديثات', value: 'يتم تحديث البوت بشكل دوري لإضافة ميزات جديدة وتحسين الأداء' },
                    { name: '🛠️ الدعم', value: 'للحصول على المساعدة أو الإبلاغ عن مشكلة، يرجى التواصل مع المطور' }
                );

            // إرسال الإمبدات
            await interaction.reply({ embeds: [mainEmbed], ephemeral: true });
            await interaction.followUp({ embeds: [attendanceEmbed], ephemeral: true });
            await interaction.followUp({ embeds: [commandsEmbed], ephemeral: true });
            await interaction.followUp({ embeds: [additionalInfoEmbed], ephemeral: true });

        } catch (error) {
            console.error('خطأ في أمر المساعدة:', error);
            await interaction.reply({ 
                content: '❌ حدث خطأ أثناء عرض المساعدة. يرجى المحاولة مرة أخرى لاحقًا.', 
                ephemeral: true 
            });
        }
    },
};
