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

// إضافة الفهارس لتحسين الأداء
guildSettingsSchema.index({ guildId: 1 });
// إضافة مؤشر مركب للبحث السريع عن الإعدادات مع ميزات محددة
guildSettingsSchema.index({ guildId: 1, 'features.tickets.enabled': 1 });
guildSettingsSchema.index({ guildId: 1, 'features.attendance.enabled': 1 });

// تحديث التاريخ عند تعديل الإعدادات (تم تحسينه باستخدام pre-hook مع تجنب التحديث إذا لم يتم تغيير البيانات)
guildSettingsSchema.pre('save', function(next) {
    // تحديث الوقت فقط إذا تم تعديل الوثيقة
    if (this.isModified()) {
        this.updatedAt = new Date();
    }
    next();
});

// إضافة طريقة ساكنة للحصول على الإعدادات مع استخدام التخزين المؤقت الداخلي لمونغوس
guildSettingsSchema.statics.getSettings = async function(guildId, fields) {
    const projection = fields ? fields.split(' ').reduce((obj, field) => {
        obj[field] = 1;
        return obj;
    }, {}) : null;
    
    return this.findOne({ guildId }, projection).lean();
};

// إضافة طريقة للتحديث المباشر بدلاً من findOne ثم save
guildSettingsSchema.statics.updateSettings = async function(guildId, updateData) {
    const result = await this.updateOne(
        { guildId }, 
        { 
            $set: { ...updateData, updatedAt: new Date() }
        },
        { upsert: true }
    );
    
    return result;
};

const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema);

module.exports = GuildSettings;
