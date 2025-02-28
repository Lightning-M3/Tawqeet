const Performance = require('../models/Performance');
const Attendance = require('../models/Attendance');
const Ticket = require('../models/Ticket');

class PerformanceAnalyzer {
    static async updateUserPerformance(userId, guildId) {
        try {
            const { week, year } = Performance.getWeekNumber(new Date());
            
            // جمع بيانات الحضور
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            
            const attendance = await Attendance.find({
                userId,
                guildId,
                date: { $gte: weekStart }
            });

            // حساب المقاييس
            const metrics = await this.calculateMetrics(userId, guildId, attendance);

            // تحديث أو إنشاء سجل الأداء
            await Performance.findOneAndUpdate(
                { userId, guildId, weekNumber: week, year },
                { metrics, lastUpdated: new Date() },
                { upsert: true, new: true }
            );

        } catch (error) {
            logger.error('Error updating performance:', error);
        }
    }

    static async calculateMetrics(userId, guildId, attendance) {
        // حساب إجمالي الساعات
        const totalHours = attendance.reduce((total, record) => {
            return total + record.sessions.reduce((sessionTotal, session) => {
                if (session.checkOut) {
                    return sessionTotal + (session.checkOut - session.checkIn) / (1000 * 60 * 60);
                }
                return sessionTotal;
            }, 0);
        }, 0);

        // حساب متوسط مدة الجلسة
        const allSessions = attendance.flatMap(record => record.sessions.filter(s => s.checkOut));
        const averageSessionDuration = allSessions.length ? 
            allSessions.reduce((total, session) => 
                total + (session.checkOut - session.checkIn), 0) / allSessions.length / (1000 * 60) : 0;

        // حساب درجة الانتظام
        const consistencyScore = this.calculateConsistencyScore(attendance);

        // حساب حضور أوقات الذروة
        const peakTimeScore = this.calculatePeakTimeScore(attendance);

        // جمع إحصائيات التذاكر
        const ticketStats = await this.getTicketStats(userId, guildId);

        return {
            totalHours: Math.round(totalHours * 100) / 100,
            averageSessionDuration: Math.round(averageSessionDuration),
            sessionsCount: allSessions.length,
            consistencyScore,
            peakTimeAttendance: peakTimeScore,
            ...ticketStats
        };
    }

    static calculateConsistencyScore(attendance) {
        // حساب درجة الانتظام بناءً على:
        // - انتظام أوقات الحضور
        // - عدد الأيام المتتالية
        // - طول الجلسات
        // التفاصيل حسب احتياجات المشروع
        return 85; // مثال
    }

    static calculatePeakTimeScore(attendance) {
        // حساب درجة الحضور في أوقات الذروة
        // التفاصيل حسب احتياجات المشروع
        return 90; // مثال
    }

    static async getTicketStats(userId, guildId) {
        // جمع إحصائيات التذاكر
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        
        const tickets = await Ticket.find({
            guildId,
            $or: [
                { userId },
                { handledBy: userId }
            ],
            createdAt: { $gte: weekStart }
        });

        return {
            ticketsHandled: tickets.length,
            responseTime: 30, // مثال - يحتاج لحساب فعلي
            satisfactionScore: 95 // مثال - يحتاج لحساب فعلي
        };
    }
}

module.exports = PerformanceAnalyzer; 