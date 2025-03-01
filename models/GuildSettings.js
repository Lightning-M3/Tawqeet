const mongoose = require('mongoose');

const guildSettingsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    attendanceRoleId: {
        type: String,
        required: true
    },
    welcomeChannelId: {
        type: String,
        required: true
    },
    logsChannelId: {
        type: String,
        required: true
    },
    setupComplete: {
        type: Boolean,
        default: false
    },
    prefix: {
        type: String,
        default: '/'
    },
    language: {
        type: String,
        default: 'ar'
    },
    timezone: {
        type: String,
        default: 'Asia/Riyadh'
    },
    features: {
        tickets: {
            enabled: { type: Boolean, default: false },
            categoryId: String,
            logChannelId: String
        },
        welcome: {
            enabled: { type: Boolean, default: false },
            message: String,
            channelId: String
        },
        apply: {
            enabled: { type: Boolean, default: false },
            channelId: String,
            logChannelId: String,
            staffRoleId: String
        },
        attendance: {
            enabled: { type: Boolean, default: false },
            roleId: String,
            channelId: String,
            schedule: {
                start: String,
                end: String,
                timezone: String
            }
        }
    },
    errorChannelId: {
        type: String,
        default: null
    },
    logChannelId: {
        type: String,
        default: null
    },
    attendanceChannelId: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// تحديث التاريخ عند تعديل الإعدادات
guildSettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema);

module.exports = GuildSettings;
