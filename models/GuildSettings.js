const mongoose = require('mongoose');

const guildSettingsSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    attendanceRoleId: {
        type: String,
        required: function() { return this.setupComplete === true; }
    },
    welcomeChannelId: {
        type: String,
        required: function() { return this.setupComplete === true; }
    },
    logsChannelId: {
        type: String,
        required: function() { return this.setupComplete === true; }
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
            formTitle: {
                type: String,
                default: 'نموذج التقديم'
            },
            formQuestions: [{
                question: String,
                type: {
                    type: String,
                    enum: ['text', 'number', 'date', 'choice'],
                    default: 'text'
                },
                required: {
                    type: Boolean,
                    default: true
                },
                options: [String] // للأسئلة من نوع "choice"
            }],
            staffRoleId: String
        },
        attendance: {
            enabled: { type: Boolean, default: false },
            channelId: String,
            roleId: String,
            logChannelId: String,
            reportChannelId: String
        }
    },
    name: String,
    icon: String,
    memberCount: Number,
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

// إضافة مؤشرات للبحث السريع
guildSettingsSchema.index({ guildId: 1 });
guildSettingsSchema.index({ 'features.tickets.enabled': 1 });
guildSettingsSchema.index({ 'features.welcome.enabled': 1 });
guildSettingsSchema.index({ 'features.apply.enabled': 1 });
guildSettingsSchema.index({ 'features.attendance.enabled': 1 });

// إضافة طريقة ساكنة للحصول على الإعدادات مع استخدام التخزين المؤقت الداخلي لمونغوس
guildSettingsSchema.statics.getSettings = async function(guildId, fields = '') {
    try {
        return await this.findOne({ guildId }, fields).lean();
    } catch (error) {
        console.error(`Error getting guild settings for ${guildId}:`, error);
        throw new Error(`فشل الحصول على إعدادات السيرفر: ${error.message}`);
    }
};

// إضافة طريقة للتحديث المباشر بدلاً من findOne ثم save
guildSettingsSchema.statics.updateSettings = async function(guildId, updateData) {
    try {
        return await this.findOneAndUpdate(
            { guildId },
            { $set: updateData },
            { new: true, upsert: true, runValidators: false }
        );
    } catch (error) {
        console.error(`Error updating guild settings for ${guildId}:`, error);
        throw new Error(`فشل تحديث إعدادات السيرفر: ${error.message}`);
    }
};

// إضافة طريقة ساكنة للتحديث الآمن بدون عمليات التحقق من الحقول
guildSettingsSchema.statics.updateGuildInfo = async function(guildId, updateData) {
    try {
        return await this.updateOne(
            { guildId },
            { $set: updateData },
            { runValidators: false }
        );
    } catch (error) {
        console.error(`Error updating guild info for ${guildId}:`, error);
        throw new Error(`فشل تحديث معلومات السيرفر: ${error.message}`);
    }
};

// تحديث التاريخ عند تعديل الإعدادات (تم تحسينه باستخدام pre-hook مع تجنب التحديث إذا لم يتم تغيير البيانات)
guildSettingsSchema.pre('save', function(next) {
    // تحديث الوقت فقط إذا تم تعديل الوثيقة
    if (this.isModified()) {
        this.updatedAt = new Date();
    }
    next();
});

const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema);

module.exports = GuildSettings;
