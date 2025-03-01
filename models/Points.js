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
        default: 0
    },
    attendancePoints: {
        type: Number,
        default: 0
    },
    ticketsPoints: {
        type: Number,
        default: 0
    },
    participationPoints: {
        type: Number,
        default: 0
    },
    rankingPoints: {
        type: Number,
        default: 0
    },
    bonusPoints: {
        type: Number,
        default: 0
    },
    lastAttendanceDate: {
        type: Date
    },
    dailyStreak: {
        type: Number,
        default: 0
    },
    weeklyStreak: {
        type: Number,
        default: 0
    },
    monthlyGoalMet: {
        type: Boolean,
        default: false
    },
    badges: [{
        type: {
            type: String,
            enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond']
        },
        name: String,
        description: String,
        awardedAt: {
            type: Date,
            default: Date.now
        }
    }],
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true }
});

// إضافة المؤشرات للتحسين
pointsSchema.index({ userId: 1, guildId: 1 }, { unique: true });
pointsSchema.index({ guildId: 1, points: -1 });
pointsSchema.index({ guildId: 1, level: -1 });

// إضافة خاصية افتراضية لحساب عدد الشارات
pointsSchema.virtual('badgesCount').get(function() {
    return this.badges ? this.badges.length : 0;
});

// إضافة خاصية افتراضية لحساب النقاط القادمة للمستوى التالي
pointsSchema.virtual('nextLevelPoints').get(function() {
    return 100 * Math.pow(1.5, this.level);
});

// إضافة خاصية افتراضية لحساب النسبة المئوية للتقدم للمستوى التالي
pointsSchema.virtual('levelProgress').get(function() {
    const currentLevelPoints = 100 * Math.pow(1.5, this.level - 1);
    const nextLevelPoints = 100 * Math.pow(1.5, this.level);
    const requiredPoints = nextLevelPoints - currentLevelPoints;
    const userProgress = this.points - currentLevelPoints;
    
    return Math.min(100, Math.round((userProgress / requiredPoints) * 100));
});

// طريقة مساعدة للتحقق من الترقية
pointsSchema.methods.checkLevelUp = function() {
    const nextLevelPoints = 100 * Math.pow(1.5, this.level);
    return this.points >= nextLevelPoints;
};

// تحسين طريقة إضافة النقاط
pointsSchema.statics.addPoints = async function(userId, guildId, pointsData) {
    // تحويل كائن البيانات إلى عمليات تحديث مباشرة لقاعدة البيانات
    const updateObj = {
        $inc: {},
        $set: {
            lastUpdated: new Date()
        }
    };
    
    // معالجة النقاط المطلوب إضافتها
    for (const [key, value] of Object.entries(pointsData)) {
        if (key !== 'lastUpdated' && typeof value === 'number') {
            const fieldName = key === 'points' ? key : `${key}Points`;
            updateObj.$inc[fieldName] = value;
        }
    }
    
    // إضافة إجمالي النقاط إذا لم يتم تحديدها
    if (!updateObj.$inc.points && Object.keys(updateObj.$inc).length > 0) {
        updateObj.$inc.points = Object.values(updateObj.$inc).reduce((sum, val) => sum + val, 0);
    }
    
    // تحديث التاريخ إذا كانت هناك نقاط حضور
    if (pointsData.attendance) {
        updateObj.$set.lastAttendanceDate = new Date();
    }

    // تنفيذ التحديث
    const result = await this.findOneAndUpdate(
        { userId, guildId },
        updateObj,
        { 
            upsert: true, 
            new: true,
            setDefaultsOnInsert: true
        }
    );
    
    // التحقق من ترقية المستوى
    let leveledUp = false;
    while (result.checkLevelUp()) {
        result.level += 1;
        leveledUp = true;
    }
    
    // حفظ إذا كان هناك تغيير في المستوى
    if (leveledUp) {
        await result.save();
    }
    
    return { result, leveledUp };
};

// طريقة الحصول على ترتيب القمة
pointsSchema.statics.getTopUsers = async function(guildId, limit = 10, skip = 0) {
    return this.find({ guildId })
        .sort({ points: -1 })
        .skip(skip)
        .limit(limit)
        .select('userId points level badges')
        .lean();
};

// طريقة الحصول على ترتيب المستخدم
pointsSchema.statics.getUserRank = async function(userId, guildId) {
    // جلب نقاط المستخدم أولاً
    const userPoints = await this.findOne({ userId, guildId })
        .select('points')
        .lean();
    
    if (!userPoints) return null;
    
    // حساب عدد المستخدمين ذوي النقاط الأعلى
    const higherRanksCount = await this.countDocuments({
        guildId,
        points: { $gt: userPoints.points }
    });
    
    // الترتيب يبدأ من 1
    return higherRanksCount + 1;
};

// طريقة للحصول على الإحصاءات العامة على مستوى السيرفر
pointsSchema.statics.getGuildStats = async function(guildId) {
    const stats = await this.aggregate([
        {
            $match: { guildId }
        },
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                totalPoints: { $sum: '$points' },
                avgPoints: { $avg: '$points' },
                maxPoints: { $max: '$points' },
                minPoints: { $min: '$points' },
                avgLevel: { $avg: '$level' },
                maxLevel: { $max: '$level' }
            }
        },
        {
            $project: {
                _id: 0,
                totalUsers: 1,
                totalPoints: 1,
                avgPoints: { $round: ['$avgPoints', 2] },
                maxPoints: 1,
                minPoints: 1,
                avgLevel: { $round: ['$avgLevel', 2] },
                maxLevel: 1
            }
        }
    ]);
    
    return stats[0] || {
        totalUsers: 0,
        totalPoints: 0,
        avgPoints: 0,
        maxPoints: 0,
        minPoints: 0,
        avgLevel: 0,
        maxLevel: 0
    };
};

// طريقة لمنح شارة جديدة
pointsSchema.statics.awardBadge = async function(userId, guildId, badgeData) {
    // التحقق من وجود الشارة مسبقاً
    const existingUser = await this.findOne({
        userId, 
        guildId,
        'badges.name': badgeData.name
    }).select('_id');
    
    if (existingUser) {
        return { awarded: false, reason: 'Badge already awarded' };
    }
    
    // إضافة الشارة الجديدة
    const result = await this.updateOne(
        { userId, guildId },
        { 
            $push: { 
                badges: {
                    ...badgeData,
                    awardedAt: new Date()
                }
            },
            $set: { lastUpdated: new Date() }
        },
        { upsert: true }
    );
    
    return { 
        awarded: result.modifiedCount > 0 || result.upsertedCount > 0,
        badgeData
    };
};

// طريقة لإعادة تعيين النقاط أو بعض المقاييس
pointsSchema.statics.resetUserStats = async function(userId, guildId, options = {}) {
    // كائن التحديث المبدئي
    const updateObj = {
        $set: { lastUpdated: new Date() }
    };
    
    // إعادة تعيين النقاط المحددة
    if (options.resetPoints) {
        updateObj.$set.points = 0;
    }
    
    // إعادة تعيين المستوى
    if (options.resetLevel) {
        updateObj.$set.level = 0;
    }
    
    // إعادة تعيين نقاط محددة
    const pointsTypes = ['attendance', 'tickets', 'participation', 'ranking', 'bonus'];
    for (const type of pointsTypes) {
        if (options[`reset${type.charAt(0).toUpperCase() + type.slice(1)}Points`]) {
            updateObj.$set[`${type}Points`] = 0;
        }
    }
    
    // إعادة تعيين الشارات
    if (options.resetBadges) {
        updateObj.$set.badges = [];
    }
    
    // إعادة تعيين تتابع الأيام
    if (options.resetStreaks) {
        updateObj.$set.dailyStreak = 0;
        updateObj.$set.weeklyStreak = 0;
        updateObj.$set.monthlyGoalMet = false;
    }
    
    // التنفيذ فقط إذا كان هناك تغييرات
    if (Object.keys(updateObj.$set).length > 1) {
        return this.updateOne({ userId, guildId }, updateObj);
    }
    
    return { acknowledged: true, modifiedCount: 0 };
};

module.exports = mongoose.model('Points', pointsSchema);