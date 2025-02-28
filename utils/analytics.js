const Attendance = require('../models/Attendance');

class Analytics {
    static async generateUserStats(userId, guildId, startDate, endDate) {
        const records = await Attendance.find({
            userId,
            guildId,
            date: { $gte: startDate, $lte: endDate }
        });

        return {
            totalDays: records.length,
            totalHours: records.reduce((sum, record) => sum + record.totalHours, 0),
            averageHours: records.length ? (records.reduce((sum, record) => sum + record.totalHours, 0) / records.length) : 0,
            onTimePercentage: records.length ? (records.filter(r => !r.isLate).length / records.length * 100) : 0,
            mostActiveDay: this.getMostActiveDay(records),
            attendanceStreak: this.calculateStreak(records)
        };
    }

    static getMostActiveDay(records) {
        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dayCounts = records.reduce((acc, record) => {
            const day = new Date(record.date).getDay();
            acc[day] = (acc[day] || 0) + 1;
            return acc;
        }, {});

        const mostActiveDay = Object.entries(dayCounts)
            .sort(([,a], [,b]) => b - a)[0];

        return days[mostActiveDay[0]];
    }

    static calculateStreak(records) {
        let currentStreak = 0;
        let maxStreak = 0;

        records.sort((a, b) => a.date - b.date);

        for (let i = 0; i < records.length; i++) {
            if (i === 0 || 
                Math.abs(records[i].date - records[i-1].date) === 24 * 60 * 60 * 1000) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        return maxStreak;
    }
}

module.exports = Analytics; 