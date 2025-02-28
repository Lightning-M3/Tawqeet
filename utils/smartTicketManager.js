const Ticket = require('../models/Ticket');
const logger = require('./logger');

class SmartTicketManager {
    static async createSmartTicket(interaction, content) {
        try {
            // تصنيف تلقائي للتذكرة
            const category = await Ticket.autoClassify(content);
            
            // حساب الوقت المتوقع
            const estimatedTime = await Ticket.calculateEstimatedTime(category, content);

            // إنشاء التذكرة مع المعلومات الإضافية
            const ticketData = {
                // ... البيانات الأساسية ...
                category,
                estimatedTime,
                autoCategory: true,
                priority: this.calculatePriority(content),
                tags: this.extractTags(content)
            };

            // البحث عن تذاكر مشابهة
            const relatedTickets = await this.findRelatedTickets(interaction.guild.id, content);
            if (relatedTickets.length > 0) {
                ticketData.relatedTickets = relatedTickets.map(t => t.ticketId);
            }

            return ticketData;
        } catch (error) {
            logger.error('Error creating smart ticket:', error);
            throw error;
        }
    }

    static calculatePriority(content) {
        const urgentWords = [
            // فصحى
            'عاجل', 'طارئ', 'مهم جداً', 'فوري', 'ضروري',
            // سعودي
            'ضروري مرة', 'عجلة', 'مستعجل', 'ابغاه الحين', 'الحين الحين',
            'مستعيجل', 'بسرعة', 'على السريع',
            // مصري
            'ضروري خالص', 'عايزه دلوقتي', 'حالاً', 'فوراً',
            // عام
            'urgent', 'asap', 'مش مستحمل'
        ];

        const highWords = [
            // فصحى
            'مهم', 'سريع', 'مطلوب',
            // سعودي
            'ياليت بسرعة', 'اذا ممكن اليوم', 'محتاجه ضروري',
            // مصري
            'مهم قوي', 'محتاجه بسرعة', 'لو سمحت بسرعة',
            // عام
            'important', 'high priority'
        ];

        const lowWords = [
            // فصحى
            'استفسار بسيط', 'سؤال عام',
            // سعودي
            'مو مستعجل', 'على راحتكم', 'اذا فاضين',
            // مصري
            'مش مستعجل', 'براحتكم', 'وقت فراغكم',
            // عام
            'low priority', 'when possible'
        ];

        const lowerContent = content.toLowerCase();

        if (urgentWords.some(word => lowerContent.includes(word))) return 'عاجل';
        if (highWords.some(word => lowerContent.includes(word))) return 'عالي';
        if (lowWords.some(word => lowerContent.includes(word))) return 'منخفض';
        return 'متوسط';
    }

    static extractTags(content) {
        const tags = [];
        
        // استخراج الهاشتاغات
        const hashtags = content.match(/#[\w-]+/g);
        if (hashtags) tags.push(...hashtags);

        // الكلمات المفتاحية بمختلف اللهجات
        const keywordPatterns = [
            // فصحى
            'مشكلة', 'خطأ', 'طلب', 'اقتراح',
            // سعودي
            'خربان', 'مهنق', 'ودي', 'ابغى',
            // مصري
            'عايز', 'باظ', 'عطلان',
            // تقني
            'باگ', 'بج', 'error', 'bug'
        ];

        const keywords = content.match(
            new RegExp(`\\b(${keywordPatterns.join('|')})\\b`, 'gi')
        );
        if (keywords) tags.push(...keywords);

        return [...new Set(tags)]; // إزالة التكرار
    }

    static async findRelatedTickets(guildId, content) {
        // البحث عن تذاكر مشابهة باستخدام الكلمات المفتاحية
        const keywords = content.split(' ')
            .filter(word => word.length > 3)
            .slice(0, 5);

        return await Ticket.find({
            guildId,
            $or: [
                { 'responses.content': { $regex: keywords.join('|'), $options: 'i' } },
                { tags: { $in: this.extractTags(content) } }
            ]
        }).limit(3);
    }

    static async suggestSolution(ticket) {
        try {
            // البحث عن حلول من تذاكر مشابهة
            const similarTickets = await Ticket.find({
                guildId: ticket.guildId,
                category: ticket.category,
                status: 'closed',
                'satisfaction.rating': { $gte: 4 }
            }).limit(5);

            if (similarTickets.length > 0) {
                return similarTickets.map(t => ({
                    ticketId: t.ticketId,
                    solution: t.responses[t.responses.length - 1]?.content,
                    satisfaction: t.satisfaction.rating
                }));
            }

            return null;
        } catch (error) {
            logger.error('Error suggesting solution:', error);
            return null;
        }
    }
}

module.exports = SmartTicketManager; 