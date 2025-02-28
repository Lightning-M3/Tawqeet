const mongoose = require('mongoose');

const statisticsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    type: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        required: true
    },
    metrics: {
        attendance: {
            totalUsers: Number,
            uniqueUsers: Number,
            averageHours: Number,
            peakHour: {
                hour: Number,
                count: Number
            },
            totalHours: Number
        },
        tickets: {
            created: Number,
            resolved: Number,
            averageResolutionTime: Number,
            categoryCounts: {
                دعم_فني: Number,
                شكوى: Number,
                اقتراح: Number,
                استفسار: Number,
                أخرى: Number
            },
            priorityCounts: {
                منخفض: Number,
                متوسط: Number,
                عالي: Number,
                عاجل: Number
            },
            satisfactionAverage: Number,
            topHandlers: [{
                userId: String,
                count: Number,
                averageRating: Number
            }]
        },
        points: {
            totalAwarded: Number,
            averagePerUser: Number,
            topEarners: [{
                userId: String,
                points: Number
            }]
        }
    }
});

module.exports = mongoose.model('Statistics', statisticsSchema); 