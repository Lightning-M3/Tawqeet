const { EmbedBuilder, WebhookClient } = require('discord.js');

class NotificationSystem {
    constructor(webhookUrl) {
        this.webhook = new WebhookClient({ url: webhookUrl });
    }

    async sendAdminAlert(title, message, severity = 'info') {
        const colors = {
            info: 0x00ff00,
            warning: 0xffff00,
            error: 0xff0000
        };

        const embed = new EmbedBuilder()
            .setTitle(`🔔 ${title}`)
            .setDescription(message)
            .setColor(colors[severity])
            .setTimestamp();

        await this.webhook.send({ embeds: [embed] });
    }

    async sendDailyReport(stats) {
        const embed = new EmbedBuilder()
            .setTitle('📊 التقرير اليومي')
            .addFields([
                { name: 'إجمالي الحضور', value: stats.total.toString() },
                { name: 'في الوقت', value: stats.onTime.toString() },
                { name: 'متأخر', value: stats.late.toString() },
                { name: 'خروج مبكر', value: stats.leftEarly.toString() }
            ])
            .setColor(0x00ff00)
            .setTimestamp();

        await this.webhook.send({ embeds: [embed] });
    }
}

module.exports = NotificationSystem; 