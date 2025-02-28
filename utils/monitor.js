const { EmbedBuilder } = require('discord.js');
const logger = require('./logger');

class SystemMonitor {
    constructor(client) {
        this.client = client;
        this.metrics = {
            commands: new Map(),
            errors: new Map(),
            performance: new Map()
        };
    }

    trackCommand(commandName, userId) {
        const count = this.metrics.commands.get(commandName) || 0;
        this.metrics.commands.set(commandName, count + 1);
    }

    trackError(error, context) {
        logger.log('error', error.message, context);
        const count = this.metrics.errors.get(error.message) || 0;
        this.metrics.errors.set(error.message, count + 1);

        if (count >= 5) { // إذا تكرر نفس الخطأ 5 مرات
            this.sendAlert('تحذير: خطأ متكرر', error.message);
        }
    }

    trackPerformance(operation, duration) {
        const metrics = this.metrics.performance.get(operation) || { count: 0, total: 0 };
        metrics.count++;
        metrics.total += duration;
        this.metrics.performance.set(operation, metrics);

        if (duration > 1000) { // إذا استغرقت العملية أكثر من ثانية
            this.sendAlert('تحذير: أداء بطيء', `العملية ${operation} استغرقت ${duration}ms`);
        }
    }

    async sendAlert(title, message, severity = 'warning') {
        const colors = {
            info: 0x00ff00,
            warning: 0xffff00,
            error: 0xff0000
        };

        const embed = new EmbedBuilder()
            .setTitle(`⚠️ ${title}`)
            .setDescription(message)
            .setColor(colors[severity])
            .setTimestamp();

        // إرسال التنبيه للمشرفين
        try {
            const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
            const adminRole = guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.Administrator));
            
            if (adminRole) {
                const logChannel = guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
                if (logChannel) {
                    await logChannel.send({
                        content: `<@&${adminRole.id}>`,
                        embeds: [embed]
                    });
                }
            }
        } catch (error) {
            console.error('فشل في إرسال التنبيه:', error);
        }
    }

    generateReport() {
        return {
            commands: Object.fromEntries(this.metrics.commands),
            errors: Object.fromEntries(this.metrics.errors),
            performance: Object.fromEntries(this.metrics.performance)
        };
    }

    reset() {
        this.metrics.commands.clear();
        this.metrics.errors.clear();
        this.metrics.performance.clear();
    }
}

module.exports = SystemMonitor; 