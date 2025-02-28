const { MessageEmbed } = require('discord.js');
const Attendance = require('../models/Attendance');

class ReportGenerator {
    async generateWeeklyReport(guild) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        
        const records = await Attendance.find({
            guildId: guild.id,
            date: { $gte: weekStart }
        });

        // تحليل البيانات
        const stats = this.analyzeAttendance(records);
        
        // إنشاء تقرير مفصل
        return this.createReportEmbed('التقرير الأسبوعي', stats);
    }

    async generateMonthlyReport(guild) {
        const monthStart = new Date();
        monthStart.setMonth(monthStart.getMonth() - 1);
        
        const records = await Attendance.find({
            guildId: guild.id,
            date: { $gte: monthStart }
        });

        const stats = this.analyzeAttendance(records);
        return this.createReportEmbed('التقرير الشهري', stats);
    }

    analyzeAttendance(records) {
        // تحليل متقدم للبيانات
        return {
            totalHours: records.reduce((sum, r) => sum + r.totalHours, 0),
            averageDaily: records.length / 30,
            mostActive: this.getMostActiveUsers(records),
            trends: this.analyzeTrends(records)
        };
    }

    createReportEmbed(title, stats) {
        return new MessageEmbed()
            .setTitle(title)
            .setColor('#00ff00')
            .addFields([
                { name: 'إجمالي ساعات العمل', value: `${stats.totalHours.toFixed(2)} ساعة` },
                { name: 'متوسط الحضور اليومي', value: `${stats.averageDaily.toFixed(2)} شخص` },
                { name: 'الأعضاء الأكثر نشاطاً', value: stats.mostActive.join('\n') }
            ])
            .setTimestamp();
    }
}

module.exports = new ReportGenerator(); 