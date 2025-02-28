const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('يختبر استجابة البوت ويعرض معلومات الاتصال'),
  async execute(interaction) {
    try {
      // إرسال رد أولي
      const sent = await interaction.reply({ 
        content: '🔄 جاري قياس زمن الاستجابة...', 
        fetchReply: true 
      });

      // حساب أزمنة الاستجابة
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = Math.round(interaction.client.ws.ping);

      // إنشاء Embed للرد
      const embed = new EmbedBuilder()
        .setColor(getLatencyColor(latency))
        .setTitle('🏓 نتائج فحص الاتصال')
        .addFields(
          { 
            name: '⚡ زمن استجابة البوت',
            value: `${latency}ms`,
            inline: true
          },
          {
            name: '📡 زمن استجابة Discord API',
            value: `${apiLatency}ms`,
            inline: true
          }
        )
        .setFooter({ 
          text: getLatencyStatus(latency),
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      // تحديث الرد
      await interaction.editReply({ 
        content: null,
        embeds: [embed]
      });

      // تسجيل المعلومات
      logger.info('تم تنفيذ أمر ping', {
        latency,
        apiLatency,
        userId: interaction.user.id,
        guildId: interaction.guildId
      });

    } catch (error) {
      logger.error('خطأ في أمر ping:', error);
      await interaction.reply({
        content: '❌ حدث خطأ أثناء قياس زمن الاستجابة',
        ephemeral: true
      });
    }
  }
};

/**
 * تحديد لون الـ Embed بناءً على زمن الاستجابة
 * @param {number} latency - زمن الاستجابة بالمللي ثانية
 * @returns {number} لون الـ Embed
 */
function getLatencyColor(latency) {
  if (latency < 100) return 0x00ff00; // أخضر
  if (latency < 200) return 0xffff00; // أصفر
  return 0xff0000; // أحمر
}

/**
 * تحديد حالة الاتصال بناءً على زمن الاستجابة
 * @param {number} latency - زمن الاستجابة بالمللي ثانية
 * @returns {string} وصف حالة الاتصال
 */
function getLatencyStatus(latency) {
  if (latency < 100) return 'الاتصال ممتاز 🟢';
  if (latency < 200) return 'الاتصال جيد 🟡';
  return 'الاتصال ضعيف 🔴';
} 