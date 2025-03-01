const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    guildId: {
        type: String,
        required: true
    },
    weekNumber: {
        type: Number,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    metrics: {
        totalHours: Number,
        averageSessionDuration: Number,
        sessionsCount: Number,
        consistencyScore: Number, // 0-100
        peakTimeAttendance: Number, // 0-100
        ticketsHandled: Number,
        responseTime: Number, // بالدقائق
        satisfactionScore: Number // 0-100
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    // تفعيل طوابع الوقت التلقائية
    timestamps: true
});

// إضافة مؤشرات للاستعلامات المستخدمة بكثرة 
performanceSchema.index({ userId: 1, guildId: 1, weekNumber: 1, year: 1 }, { unique: true });
performanceSchema.index({ guildId: 1, weekNumber: 1, year: 1 });
performanceSchema.index({ guildId: 1, userId: 1 });
performanceSchema.index({ userId: 1, year: 1 });

// إضافة خاصية افتراضية لحساب الأداء الكلي
performanceSchema.virtual('overallScore').get(function() {
    const { consistencyScore, peakTimeAttendance, satisfactionScore } = this.metrics;
    
    // حساب مرجح لدرجة الأداء الإجمالية
    const weights = {
        consistency: 0.4,
        peakTime: 0.3,
        satisfaction: 0.3
    };
    
    const score = (
        (consistencyScore || 0) * weights.consistency +
        (peakTimeAttendance || 0) * weights.peakTime +
        (satisfactionScore || 0) * weights.satisfaction
    );
    
    return Math.round(score);
});

// دالة لحساب أسبوع السنة - محسنة ومتوافقة مع ISO
performanceSchema.statics.getWeekNumber = function(date) {
    const d = new Date(date);
    
    // نسخ التاريخ لتجنب تعديل الكائن الأصلي
    const targetDate = new Date(d.valueOf());
    
    // تعيين اليوم إلى الخميس في نفس الأسبوع
    const dayNum = d.getUTCDay() || 7;
    targetDate.setUTCDate(targetDate.getUTCDate() + 4 - dayNum);
    
    // الحصول على اليوم الأول من نفس العام
    const yearStart = new Date(Date.UTC(targetDate.getUTCFullYear(), 0, 1));
    
    // حساب عدد الأيام بين التاريخ المستهدف وبداية العام
    const weekNum = Math.ceil((((targetDate - yearStart) / 86400000) + 1) / 7);
    
    return {
        week: weekNum,
        year: targetDate.getUTCFullYear()
    };
};

// إضافة طريقة ساكنة لتحديث أو إنشاء سجل أداء
performanceSchema.statics.updatePerformance = async function(userId, guildId, metrics) {
    // حساب الأسبوع الحالي
    const now = new Date();
    const { week, year } = this.getWeekNumber(now);
    
    // استخدام updateOne بدلاً من findOneAndUpdate لتحسين الأداء
    const result = await this.updateOne(
        { userId, guildId, weekNumber: week, year },
        { 
            $set: { 
                metrics,
                lastUpdated: now
            }
        },
        { upsert: true }
    );
    
    return result;
};

// إضافة طريقة للحصول على أداء المستخدم في فترة محددة
performanceSchema.statics.getUserPerformanceTrend = async function(userId, guildId, weeksCount = 8) {
    // حساب الأسبوع الحالي
    const now = new Date();
    const currentWeekInfo = this.getWeekNumber(now);
    
    // استعلام يجلب بيانات الأداء في الفترة المحددة
    return this.find({
        userId,
        guildId,
        $or: [
            // الحالة 1: نفس السنة، أسابيع سابقة
            {
                year: currentWeekInfo.year,
                weekNumber: { $gte: Math.max(1, currentWeekInfo.week - weeksCount), $lte: currentWeekInfo.week }
            },
            // الحالة 2: السنة السابقة، للأسابيع التي لم تكتمل في الحالة الأولى
            {
                year: currentWeekInfo.year - 1,
                weekNumber: { $gte: 52 - (weeksCount - currentWeekInfo.week), $lte: 52 }
            }
        ]
    })
    .sort({ year: 1, weekNumber: 1 })
    .select('weekNumber year metrics')
    .lean();
};

// طريقة لمقارنة أداء المستخدم مع المتوسط العام
performanceSchema.statics.compareWithAverage = async function(userId, guildId) {
    // الحصول على أحدث بيانات للمستخدم
    const now = new Date();
    const { week, year } = this.getWeekNumber(now);
    
    const userPerformance = await this.findOne({
        userId,
        guildId,
        weekNumber: week,
        year
    }).lean();
    
    if (!userPerformance) return null;
    
    // الحصول على متوسط أداء جميع المستخدمين في نفس الأسبوع
    const aggregateResult = await this.aggregate([
        {
            $match: {
                guildId,
                weekNumber: week,
                year
            }
        },
        {
            $group: {
                _id: null,
                avgTotalHours: { $avg: "$metrics.totalHours" },
                avgSessionDuration: { $avg: "$metrics.averageSessionDuration" },
                avgTicketsHandled: { $avg: "$metrics.ticketsHandled" },
                avgConsistencyScore: { $avg: "$metrics.consistencyScore" },
                avgResponseTime: { $avg: "$metrics.responseTime" },
                avgSatisfactionScore: { $avg: "$metrics.satisfactionScore" },
                totalUsers: { $sum: 1 }
            }
        }
    ]);
    
    const average = aggregateResult[0] || null;
    
    // مقارنة أداء المستخدم مع المتوسط
    return {
        user: userPerformance.metrics,
        average,
        comparison: average ? {
            totalHours: userPerformance.metrics.totalHours - average.avgTotalHours,
            averageSessionDuration: userPerformance.metrics.averageSessionDuration - average.avgSessionDuration,
            ticketsHandled: userPerformance.metrics.ticketsHandled - average.avgTicketsHandled,
            consistencyScore: userPerformance.metrics.consistencyScore - average.avgConsistencyScore,
            responseTime: userPerformance.metrics.responseTime - average.avgResponseTime,
            satisfactionScore: userPerformance.metrics.satisfactionScore - average.avgSatisfactionScore
        } : null
    };
};

const Performance = mongoose.model('Performance', performanceSchema);
module.exports = Performance;