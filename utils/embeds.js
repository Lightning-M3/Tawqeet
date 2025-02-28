const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class EmbedCreator {
    static createTicketEmbed(user, ticketNumber) {
        return new EmbedBuilder()
            .setTitle('🎫 تذكرة جديدة')
            .setDescription(`مرحباً ${user}!\nالرجاء وصف مشكلتك وسيقوم فريق الدعم بالرد عليك قريباً.`)
            .setColor(0x00ff00)
            .addFields([
                { name: 'رقم التذكرة', value: ticketNumber },
                { name: 'الحالة', value: '🟢 مفتوحة' }
            ])
            .setTimestamp()
            .setFooter({ text: 'نظام التذاكر' });
    }

    static createAttendanceEmbed() {
        return new EmbedBuilder()
            .setTitle('📋 نظام الحضور')
            .setDescription('سجل حضورك وانصرافك باستخدام الأزرار أدناه')
            .setColor(0x00ff00)
            .addFields([
                { 
                    name: '📝 تعليمات',
                    value: '• يتم حساب الوقت بالدقائق إذا كان أقل من ساعة\n' +
                           '• يتم التسجيل التلقائي للخروج عند 11:59 مساءً\n' +
                           '• يمكنك تسجيل الحضور في أي وقت'
                }
            ])
            .setTimestamp();
    }

    static createAttendanceButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('check_in')
                    .setLabel('تسجيل حضور')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('check_out')
                    .setLabel('تسجيل انصراف')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('👋')
            );
    }
}

module.exports = EmbedCreator; 