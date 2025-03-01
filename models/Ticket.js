const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    required: true,
    unique: true
  },
  ticketNumber: {
    type: Number,
    required: true
  },
  guildId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date
  },
  closedBy: {
    type: String
  },
  category: {
    type: String,
    enum: ['دعم_فني', 'شكوى', 'اقتراح', 'استفسار', 'أخرى'],
    default: 'أخرى'
  },
  priority: {
    type: String,
    enum: ['منخفض', 'متوسط', 'عالي', 'عاجل'],
    default: 'متوسط'
  },
  assignedTo: {
    type: String
  },
  tags: [String],
  responses: [{
    userId: String,
    content: String,
    timestamp: Date
  }],
  satisfaction: {
    rating: Number,
    feedback: String,
    timestamp: Date
  },
  estimatedTime: Number,
  actualTime: Number,
  autoCategory: Boolean,
  relatedTickets: [String]
});

// إضافة مؤشرات مركبة
ticketSchema.index({ guildId: 1, ticketNumber: 1 }, { unique: true });
ticketSchema.index({ guildId: 1, status: 1 });

// دالة لإنشاء رقم تذكرة جديد
ticketSchema.statics.createTicketNumber = async function(guildId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // البحث عن آخر تذكرة في هذا السيرفر
    const lastTicket = await this.findOne({ guildId })
      .sort({ ticketNumber: -1 })
      .session(session);

    const nextNumber = (lastTicket?.ticketNumber || 0) + 1;
    const ticketId = `TICKET-${nextNumber.toString().padStart(4, '0')}`;

    // التحقق من عدم وجود تكرار
    const existingTicket = await this.findOne({
      guildId,
      $or: [
        { ticketNumber: nextNumber },
        { ticketId }
      ]
    }).session(session);

    if (existingTicket) {
      await session.abortTransaction();
      session.endSession();
      throw new Error(`رقم التذكرة ${ticketId} موجود بالفعل`);
    }

    await session.commitTransaction();
    session.endSession();

    return { ticketNumber: nextNumber, ticketId };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// دالة لحساب الوقت المتوقع
ticketSchema.statics.calculateEstimatedTime = async function(category, content) {
  // حساب بسيط للوقت المتوقع بناءً على التصنيف والمحتوى
  const baseTime = {
    'دعم_فني': 60,
    'شكوى': 45,
    'اقتراح': 30,
    'استفسار': 15,
    'أخرى': 30
  };

  let estimatedTime = baseTime[category] || 30;
  
  // تعديل الوقت بناءً على طول المحتوى
  if (content.length > 500) estimatedTime *= 1.5;
  if (content.length > 1000) estimatedTime *= 2;

  return Math.round(estimatedTime);
};

// دالة للتصنيف التلقائي
ticketSchema.statics.autoClassify = async function(content) {
    const keywords = {
        'دعم_فني': [
            // فصحى
            'خطأ', 'مشكلة', 'لا يعمل', 'عطل', 'توقف',
            // سعودي
            'خربان', 'معلق', 'ما يشتغل', 'واقف', 'مهنق', 'مو شغال', 'مب شغال', 'خرب',
            // مصري
            'باظ', 'مش شغال', 'واقع', 'مبيشتغلش', 'عطلان',
            // عام
            'باگ', 'مشاكل', 'صعوبة', 'صعب'
        ],
        'شكوى': [
            // فصحى
            'شكوى', 'سيء', 'غير راضي', 'مستاء',
            // سعودي
            'زفت', 'خايس', 'ما عجبني', 'مو حلو', 'تعبان', 'مب زين',
            // مصري
            'وحش', 'مش حلو', 'زبالة', 'مش عاجبني', 'مضايق',
            // عام
            'زعلان', 'معصب', 'متضايق', 'مخرب'
        ],
        'اقتراح': [
            // فصحى
            'اقتراح', 'فكرة', 'تحسين', 'تطوير',
            // سعودي
            'ودي', 'ابغى', 'يليت', 'ياليت', 'لو تسوون', 'عندي فكرة',
            // مصري
            'عايز', 'نفسي', 'ياريت', 'لو تعملوا',
            // عام
            'ممكن', 'اذا ممكن', 'حلو لو'
        ],
        'استفسار': [
            // فصحى
            'كيف', 'متى', 'أين', 'ما هو', 'هل',
            // سعودي
            'وش', 'متى', 'وين', 'كيفية', 'ليه', 'ليش',
            // مصري
            'ازاي', 'امتى', 'فين', 'ليه',
            // عام
            'محتاج اعرف', 'عندي سؤال', 'استفسار'
        ]
    };

    // تحويل النص للحروف الصغيرة للمقارنة
    const lowerContent = content.toLowerCase();

    for (const [category, words] of Object.entries(keywords)) {
        if (words.some(word => lowerContent.includes(word))) {
            return category;
        }
    }

    return 'أخرى';
};

module.exports = mongoose.model('Ticket', ticketSchema);