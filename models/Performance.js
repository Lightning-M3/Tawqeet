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
});

// دالة لحساب أسبوع السنة
performanceSchema.statics.getWeekNumber = function(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return {
        week: weekNo,
        year: d.getFullYear()
    };
};

const Performance = mongoose.model('Performance', performanceSchema);
module.exports = Performance; 