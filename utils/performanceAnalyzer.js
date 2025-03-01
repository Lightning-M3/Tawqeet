const Performance = require('../models/Performance');
const Attendance = require('../models/Attendance');
const Ticket = require('../models/Ticket');
const logger = require('./logger');
const NodeCache = require('node-cache');

// إنشاء تخزين مؤقت للبيانات مع فترة صلاحية (TTL) 5 دقائق
const metricsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const ticketStatsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

class PerformanceAnalyzer {
    static async updateUserPerformance(userId, guildId) {
        try {
            const { week, year } = Performance.getWeekNumber(new Date());
            
            // استخدام مفتاح التخزين المؤقت
            const cacheKey = `${userId}-${guildId}-${week}-${year}`;
            
            // التحقق من وجود البيانات في التخزين المؤقت
            if (metricsCache.has(cacheKey)) {
                return metricsCache.get(cacheKey);
            }
            
            // جمع بيانات الحضور باستخدام مؤشر زمني أكثر دقة
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            
            // تحسين استعلام قاعدة البيانات باختيار الحقول المطلوبة فقط
            const attendance = await Attendance.find({
                userId,
                guildId,
                date: { $gte: weekStart }
            }).select('sessions date').lean();

            // حساب المقاييس
            const metrics = await this.calculateMetrics(userId, guildId, attendance);

            // تحديث أو إنشاء سجل الأداء باستخدام updateOne بدلاً من findOneAndUpdate
            // وهو أكثر كفاءة عندما لا نحتاج إلى البيانات المحدثة
            await Performance.updateOne(
                { userId, guildId, weekNumber: week, year },
                { metrics, lastUpdated: new Date() },
                { upsert: true }
            );
            
            // تخزين النتائج في التخزين المؤقت
            metricsCache.set(cacheKey, metrics);
            
            return metrics;
        } catch (error) {
            logger.error('Error updating performance:', { error: error.message, userId, guildId });
            return null;
        }
    }

    static async calculateMetrics(userId, guildId, attendance) {
        // استخدام مفتاح التخزين المؤقت
        const cacheKey = `metrics-${userId}-${guildId}`;
        
        // التحقق من وجود البيانات في التخزين المؤقت
        const cachedMetrics = metricsCache.get(cacheKey);
        if (cachedMetrics) {
            return cachedMetrics;
        }
        
        // تحسين معالجة البيانات باستخدام الوظائف المضمنة في JavaScript
        // حساب إجمالي الساعات
        const totalHours = attendance.reduce((total, record) => {
            const sessionHours = (record.sessions || []).reduce((sessionTotal, session) => {
                if (session.checkOut) {
                    return sessionTotal + (session.checkOut - session.checkIn) / (1000 * 60 * 60);
                }
                return sessionTotal;
            }, 0);
            return total + sessionHours;
        }, 0);

        // جمع كل الجلسات المكتملة
        const allSessions = attendance.flatMap(record => 
            (record.sessions || []).filter(s => s.checkOut));
        
        // حساب متوسط مدة الجلسة
        const averageSessionDuration = allSessions.length ? 
            (allSessions.reduce((total, session) => 
                total + (session.checkOut - session.checkIn), 0) / allSessions.length / (1000 * 60)) : 0;

        // حساب درجة الانتظام
        const consistencyScore = this.calculateConsistencyScore(attendance);

        // حساب حضور أوقات الذروة
        const peakTimeScore = this.calculatePeakTimeScore(attendance);

        // جمع إحصائيات التذاكر
        const ticketStats = await this.getTicketStats(userId, guildId);

        // إنشاء كائن النتائج
        const metrics = {
            totalHours: Math.round(totalHours * 100) / 100,
            averageSessionDuration: Math.round(averageSessionDuration),
            sessionsCount: allSessions.length,
            consistencyScore,
            peakTimeAttendance: peakTimeScore,
            ...ticketStats
        };
        
        // تخزين النتائج في التخزين المؤقت
        metricsCache.set(cacheKey, metrics);

        return metrics;
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
        // استخدام مفتاح التخزين المؤقت
        const cacheKey = `tickets-${userId}-${guildId}`;
        
        // التحقق من وجود البيانات في التخزين المؤقت
        const cachedStats = ticketStatsCache.get(cacheKey);
        if (cachedStats) {
            return cachedStats;
        }
        
        // حساب بداية الأسبوع
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        
        try {
            // استعلام أكثر كفاءة باختيار الحقول المطلوبة فقط
            const tickets = await Ticket.find({
                guildId,
                $or: [
                    { userId },
                    { handledBy: userId }
                ],
                createdAt: { $gte: weekStart }
            }).select('createdAt closedAt satisfaction').lean();
            
            // حساب متوسط وقت الاستجابة ودرجة الرضا
            let avgResponseTime = 30; // قيمة افتراضية
            let avgSatisfaction = 95; // قيمة افتراضية
            
            // يمكن تنفيذ الحساب الفعلي هنا بناءً على بيانات التذاكر
            
            const stats = {
                ticketsHandled: tickets.length,
                responseTime: avgResponseTime,
                satisfactionScore: avgSatisfaction
            };
            
            // تخزين النتائج في التخزين المؤقت
            ticketStatsCache.set(cacheKey, stats);
            
            return stats;
        } catch (error) {
            logger.error('Error getting ticket stats:', { error: error.message, userId, guildId });
            return {
                ticketsHandled: 0,
                responseTime: 0,
                satisfactionScore: 0
            };
        }
    }
    
    // مسح التخزين المؤقت لمستخدم محدد
    static clearUserCache(userId, guildId) {
        const { week, year } = Performance.getWeekNumber(new Date());
        const cacheKey = `${userId}-${guildId}-${week}-${year}`;
        const metricsKey = `metrics-${userId}-${guildId}`;
        const ticketsKey = `tickets-${userId}-${guildId}`;
        
        metricsCache.del(cacheKey);
        metricsCache.del(metricsKey);
        ticketStatsCache.del(ticketsKey);
        
        return true;
    }
}

module.exports = PerformanceAnalyzer;