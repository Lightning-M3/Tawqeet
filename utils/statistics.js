const Attendance = require('../models/Attendance');
const Ticket = require('../models/Ticket');

class Statistics {
    async generateServerStats(guildId, startDate, endDate) {
        const [attendance, tickets] = await Promise.all([
            this.getAttendanceStats(guildId, startDate, endDate),
            this.getTicketStats(guildId, startDate, endDate)
        ]);

        return {
            attendance,
            tickets,
            period: {
                start: startDate,
                end: endDate,
                days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
            }
        };
    }

    async getAttendanceStats(guildId, startDate, endDate) {
        const records = await Attendance.find({
            guildId,
            date: { $gte: startDate, $lte: endDate }
        });

        return {
            totalAttendance: records.length,
            uniqueUsers: new Set(records.map(r => r.userId)).size,
            averageHours: this.calculateAverageHours(records),
            mostActiveUsers: this.getMostActiveUsers(records),
            attendanceByDay: this.groupByDay(records),
            trends: this.analyzeTrends(records)
        };
    }

    async getTicketStats(guildId, startDate, endDate) {
        const tickets = await Ticket.find({
            guildId,
            createdAt: { $gte: startDate, $lte: endDate }
        });

        return {
            totalTickets: tickets.length,
            openTickets: tickets.filter(t => t.status === 'open').length,
            closedTickets: tickets.filter(t => t.status === 'closed').length,
            averageResolutionTime: this.calculateAverageResolutionTime(tickets),
            ticketsByUser: this.groupByUser(tickets)
        };
    }

    calculateAverageHours(records) {
        if (!records || records.length === 0) return 0;
        const totalHours = records.reduce((sum, record) => sum + (record.totalHours || 0), 0);
        return Math.round((totalHours / records.length) * 100) / 100;
    }

    getMostActiveUsers(records) {
        const userHours = {};
        records.forEach(record => {
            userHours[record.userId] = (userHours[record.userId] || 0) + record.totalHours;
        });
        return Object.entries(userHours)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
    }

    groupByDay(records) {
        const byDay = {};
        records.forEach(record => {
            const day = record.date.toISOString().split('T')[0];
            byDay[day] = (byDay[day] || 0) + 1;
        });
        return byDay;
    }

    analyzeTrends(records) {
        // تحليل الاتجاهات والأنماط
        return {
            weeklyTrend: this.calculateWeeklyTrend(records),
            peakHours: this.findPeakHours(records)
        };
    }

    calculateWeeklyTrend(records) {
        const weeklyStats = {};
        records.forEach(record => {
            const weekDay = record.date.getDay();
            weeklyStats[weekDay] = (weeklyStats[weekDay] || 0) + 1;
        });
        return weeklyStats;
    }

    findPeakHours(records) {
        const hourlyStats = {};
        records.forEach(record => {
            const hour = record.checkIn.getHours();
            hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
        });
        return Object.entries(hourlyStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([hour]) => hour);
    }

    calculateAverageResolutionTime(tickets) {
        const closedTickets = tickets.filter(t => t.status === 'closed');
        if (closedTickets.length === 0) return 0;
        
        const totalTime = closedTickets.reduce((sum, ticket) => {
            const closeTime = ticket.updatedAt || ticket.createdAt;
            return sum + (closeTime - ticket.createdAt);
        }, 0);
        
        return totalTime / closedTickets.length / (1000 * 60 * 60); // تحويل إلى ساعات
    }

    groupByUser(tickets) {
        const userStats = {};
        tickets.forEach(ticket => {
            userStats[ticket.userId] = (userStats[ticket.userId] || 0) + 1;
        });
        return userStats;
    }
}

module.exports = new Statistics(); 