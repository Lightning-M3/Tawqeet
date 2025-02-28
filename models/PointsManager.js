const Points = require('./Points');
const logger = require('../utils/logger');

class PointsManager {
    static POINTS_CONFIG = {
        ATTENDANCE: {
            CHECK_IN: 10,
            FULL_DAY: 30,
            PEAK_TIME: 15,
            STREAK_BONUS: 5,
        },
        TICKETS: {
            RESOLUTION: 20,
            QUICK_RESOLUTION: 10,
            SATISFACTION_BONUS: 15,
        },
        LEVELS: {
            THRESHOLD: 100, // النقاط المطلوبة للمستوى التالي
            MULTIPLIER: 1.5, // مضاعف النقاط للمستوى التالي
        },
    };

    static async addPoints(userId, guildId, amount, reason) {
        try {
            let userPoints = await Points.findOne({ userId, guildId }) || new Points({ userId, guildId });

            userPoints.points += amount;
            userPoints.weeklyPoints += amount;
            userPoints.monthlyPoints += amount;

            // التحقق من الترقية
            const newLevel = this.calculateLevel(userPoints.points);
            if (newLevel > userPoints.level) {
                userPoints.level = newLevel;
                await this.handleLevelUp(userId, guildId, newLevel);
            }

            userPoints.lastUpdated = new Date();
            await userPoints.save();

            return {
                newPoints: userPoints.points,
                level: userPoints.level,
                leveledUp: newLevel > userPoints.level,
            };
        } catch (error) {
            logger.error('Error adding points:', error);
            throw error; // إعادة الخطأ ليتعامل معه المستدعي
        }
    }

    static calculateLevel(points) {
        return Math.floor(1 + Math.sqrt(points / this.POINTS_CONFIG.LEVELS.THRESHOLD));
    }

    static async handleLevelUp(userId, guildId, newLevel) {
        try {
            await this.awardBadge(userId, guildId, {
                name: `مستوى ${newLevel}`,
                description: `وصل إلى المستوى ${newLevel}`,
                icon: '⭐',
            });
        } catch (error) {
            logger.error('Error handling level up:', error);
        }
    }

    static async awardBadge(userId, guildId, badgeData) {
        try {
            await Points.findOneAndUpdate(
                { userId, guildId },
                {
                    $push: {
                        badges: {
                            ...badgeData,
                            earnedAt: new Date(),
                        },
                    },
                }
            );
        } catch (error) {
            logger.error('Error awarding badge:', error);
        }
    }

    static async getLeaderboard(guildId, type = 'total') {
        try {
            const sortField = this.getSortField(type);
            const leaderboard = await Points.find({ guildId })
                .sort({ [sortField]: -1 })
                .limit(10)
                .lean(); // استخدم lean لتحسين الأداء عند عدم الحاجة إلى كائنات Mongoose

            return leaderboard;
        } catch (error) {
            logger.error('Error fetching leaderboard:', error);
            throw error; // إعادة الخطأ ليتعامل معه المستدعي
        }
    }

    static getSortField(type) {
        switch (type) {
            case 'weekly':
                return 'weeklyPoints';
            case 'monthly':
                return 'monthlyPoints';
            default:
                return 'points';
        }
    }
}

module.exports = PointsManager;