const mongoose = require('mongoose');

const pointsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    guildId: {
        type: String,
        required: true
    },
    points: {
        type: Number,
        default: 0
    },
    level: {
        type: Number,
        default: 1
    },
    weeklyPoints: {
        type: Number,
        default: 0
    },
    monthlyPoints: {
        type: Number,
        default: 0
    },
    badges: [{
        name: String,
        earnedAt: Date,
        description: String,
        icon: String
    }],
    statistics: {
        attendanceStreak: Number,
        perfectWeeks: Number,
        ticketsResolved: Number,
        peakTimeAttendance: Number
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const Points = mongoose.model('Points', pointsSchema);
module.exports = Points; 