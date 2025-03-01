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
    // إضافة كائن لتخزين معلومات مفصلة عن القنوات المستخدمة
    channels: {
        type: Map,
        of: {
            id: { type: String, required: true },
            name: { type: String },
            type: { type: String },
            createdAt: { type: Date, default: Date.now }
        },
        default: {}
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
            staffRoleId: String,
            messageId: String // إضافة معرف الرسالة
        },
        attendance: {
            enabled: { type: Boolean, default: false },
            channelId: String,
            logChannelId: String,
            roleId: String,
            messageId: String // إضافة معرف الرسالة
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

/**
 * طريقة ساكنة للتعامل مع حذف القنوات المهمة وتحديث الإعدادات بأمان
 * @param {String} guildId معرف السيرفر 
 * @param {String} channelId معرف القناة المحذوفة
 * @returns {Promise} نتيجة العملية
 */
guildSettingsSchema.statics.handleChannelDelete = async function(guildId, channelId) {
    try {
        if (!guildId || !channelId) {
            throw new Error('يجب توفير معرف السيرفر ومعرف القناة');
        }
        
        // جلب إعدادات السيرفر
        const guildSettings = await this.findOne({ guildId });
        if (!guildSettings) {
            return null; // لا يوجد إعدادات للسيرفر
        }
        
        // تهيئة كائن التحديث
        const updateData = {};
        let wasUpdated = false;
        
        // البحث في features عن القناة المحذوفة
        const features = guildSettings.features || {};
        
        // القنوات المخزنة في كائن channels
        const storedChannels = guildSettings.channels || new Map();
        let channelsToRemove = [];
        
        // فحص وإزالة معرفات القناة من كائن القنوات المخزنة
        for (const [key, channel] of Object.entries(storedChannels)) {
            if (channel && channel.id === channelId) {
                channelsToRemove.push(key);
                console.log(`تم العثور على قناة محذوفة في كائن القنوات: ${key}`);
                wasUpdated = true;
            }
        }
        
        // نمر على كل القنوات التي يجب إزالتها
        channelsToRemove.forEach(key => {
            updateData[`channels.${key}`] = null;
        });
        
        // التحقق من القنوات في نظام التذاكر
        if (features.tickets) {
            if (features.tickets.categoryId === channelId) {
                updateData['features.tickets.categoryId'] = null;
                updateData['features.tickets.enabled'] = false;
                wasUpdated = true;
            }
            if (features.tickets.logChannelId === channelId) {
                updateData['features.tickets.logChannelId'] = null;
                wasUpdated = true;
            }
        }
        
        // التحقق من القنوات في نظام الترحيب
        if (features.welcome && features.welcome.channelId === channelId) {
            updateData['features.welcome.channelId'] = null;
            updateData['features.welcome.enabled'] = false;
            wasUpdated = true;
        }
        
        // التحقق من القنوات في نظام التقديم
        if (features.apply) {
            if (features.apply.channelId === channelId) {
                updateData['features.apply.channelId'] = null;
                updateData['features.apply.enabled'] = false;
                wasUpdated = true;
            }
            if (features.apply.logChannelId === channelId) {
                updateData['features.apply.logChannelId'] = null;
                wasUpdated = true;
            }
        }
        
        // التحقق من القنوات في نظام الحضور
        if (features.attendance) {
            if (features.attendance.channelId === channelId) {
                updateData['features.attendance.channelId'] = null;
                updateData['features.attendance.enabled'] = false;
                wasUpdated = true;
            }
            if (features.attendance.logChannelId === channelId) {
                updateData['features.attendance.logChannelId'] = null;
                wasUpdated = true;
            }
        }
        
        // التحقق من القنوات في الإعدادات الرئيسية
        if (guildSettings.welcomeChannelId === channelId) {
            updateData.welcomeChannelId = null;
            wasUpdated = true;
        }
        
        if (guildSettings.logsChannelId === channelId) {
            updateData.logsChannelId = null;
            wasUpdated = true;
        }
        
        // تحديث إعدادات السيرفر إذا وجدنا قنوات تم حذفها
        if (wasUpdated) {
            console.log(`تحديث إعدادات السيرفر ${guildId} بعد حذف قناة: ${channelId}`);
            const updateResult = await this.updateOne(
                { guildId },
                { $set: updateData }
            );
            return updateResult;
        }
        
        // لم يتم العثور على القناة في الإعدادات
        return null;
    } catch (error) {
        console.error(`Error in handleChannelDelete for guildId ${guildId}:`, error);
        throw new Error(`فشل تحديث الإعدادات بعد حذف القناة: ${error.message}`);
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
