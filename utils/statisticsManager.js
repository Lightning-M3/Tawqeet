const Statistics = require('../models/Statistics');
const Attendance = require('../models/Attendance');
const Ticket = require('../models/Ticket');
const Points = require('../models/Points');
const logger = require('./logger');

class StatisticsManager {
    static async generateDailyStats(guildId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // جمع إحصائيات الحضور
            const attendanceStats = await this.getAttendanceStats(guildId, today, tomorrow);
            
            // جمع إحصائيات التذاكر
            const ticketStats = await this.getTicketStats(guildId, today, tomorrow);
            
            // جمع إحصائيات النقاط
            const pointsStats = await this.getPointsStats(guildId, today, tomorrow);

            // حفظ الإحصائيات
            await Statistics.findOneAndUpdate(
                {
                    guildId,
                    date: today,
                    type: 'daily'
                },
                {
                    metrics: {
                        attendance: attendanceStats,
                        tickets: ticketStats,
                        points: pointsStats
                    }
                },
                { upsert: true }
            );

            return true;
        } catch (error) {
            logger.error('Error generating daily stats:', error);
            return false;
        }
    }

    static async getAttendanceStats(guildId, startDate, endDate) {
        const records = await Attendance.find({
            guildId,
            date: { $gte: startDate, $lt: endDate }
        });

        const hourCounts = new Array(24).fill(0);
        let totalHours = 0;
        const uniqueUsers = new Set();

        records.forEach(record => {
            uniqueUsers.add(record.userId);
            record.sessions.forEach(session => {
                if (session.checkIn && session.checkOut) {
                    const duration = (session.checkOut - session.checkIn) / (1000 * 60 * 60);
                    totalHours += duration;
                    
                    const hour = new Date(session.checkIn).getHours();
                    hourCounts[hour]++;
                }
            });
        });

        const peakHour = hourCounts.reduce(
            (max, count, hour) => count > max.count ? { hour, count } : max,
            { hour: 0, count: 0 }
        );

        return {
            totalUsers: records.length,
            uniqueUsers: uniqueUsers.size,
            averageHours: uniqueUsers.size ? totalHours / uniqueUsers.size : 0,
            peakHour,
            totalHours
        };
    }

    static async getTicketStats(guildId, startDate, endDate) {
        const tickets = await Ticket.find({
            guildId,
            createdAt: { $gte: startDate, $lt: endDate }
        });

        const categoryCounts = {
            دعم_فني: 0,
            شكوى: 0,
            اقتراح: 0,
            استفسار: 0,
            أخرى: 0
        };

        const priorityCounts = {
            منخفض: 0,
            متوسط: 0,
            عالي: 0,
            عاجل: 0
        };

        const handlers = new Map();
        let totalResolutionTime = 0;
        let resolvedCount = 0;
        let totalSatisfaction = 0;
        let satisfactionCount = 0;

        tickets.forEach(ticket => {
            categoryCounts[ticket.category]++;
            priorityCounts[ticket.priority]++;

            if (ticket.status === 'closed') {
                resolvedCount++;
                if (ticket.closedAt && ticket.createdAt) {
                    totalResolutionTime += ticket.closedAt - ticket.createdAt;
                }
            }

            if (ticket.satisfaction?.rating) {
                totalSatisfaction += ticket.satisfaction.rating;
                satisfactionCount++;
            }

            if (ticket.assignedTo) {
                const handler = handlers.get(ticket.assignedTo) || { count: 0, totalRating: 0, ratingCount: 0 };
                handler.count++;
                if (ticket.satisfaction?.rating) {
                    handler.totalRating += ticket.satisfaction.rating;
                    handler.ratingCount++;
                }
                handlers.set(ticket.assignedTo, handler);
            }
        });

        const topHandlers = Array.from(handlers.entries())
            .map(([userId, data]) => ({
                userId,
                count: data.count,
                averageRating: data.ratingCount ? data.totalRating / data.ratingCount : 0
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            created: tickets.length,
            resolved: resolvedCount,
            averageResolutionTime: resolvedCount ? totalResolutionTime / resolvedCount : 0,
            categoryCounts,
            priorityCounts,
            satisfactionAverage: satisfactionCount ? totalSatisfaction / satisfactionCount : 0,
            topHandlers
        };
    }

    static async getPointsStats(guildId, startDate, endDate) {
        const points = await Points.find({ guildId });

        const totalPoints = points.reduce((sum, p) => sum + p.points, 0);
        const topEarners = points
            .sort((a, b) => b.points - a.points)
            .slice(0, 5)
            .map(p => ({
                userId: p.userId,
                points: p.points
            }));

        return {
            totalAwarded: totalPoints,
            averagePerUser: points.length ? totalPoints / points.length : 0,
            topEarners
        };
    }

    static async generateReport(guildId, type = 'daily') {
        try {
            const date = new Date();
            date.setHours(0, 0, 0, 0);

            const stats = await Statistics.findOne({
                guildId,
                type,
                date: { $lte: date }
            }).sort({ date: -1 });

            if (!stats) {
                return null;
            }

            return {
                date: stats.date,
                metrics: stats.metrics,
                summary: this.generateSummary(stats.metrics)
            };
        } catch (error) {
            logger.error('Error generating report:', error);
            return null;
        }
    }

    static generateSummary(metrics) {
        return {
            attendanceSummary: `${metrics.attendance.uniqueUsers} مستخدم نشط | ${Math.round(metrics.attendance.totalHours)} ساعة إجمالية`,
            ticketsSummary: `${metrics.tickets.resolved}/${metrics.tickets.created} تذكرة تم حلها | معدل الرضا: ${Math.round(metrics.tickets.satisfactionAverage * 10) / 10}/5`,
            pointsSummary: `${metrics.points.totalAwarded} نقطة تم توزيعها | ${Math.round(metrics.points.averagePerUser)} متوسط النقاط لكل مستخدم`
        };
    }
}

module.exports = StatisticsManager; 