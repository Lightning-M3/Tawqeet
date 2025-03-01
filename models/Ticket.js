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
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

ticketSchema.index({ guildId: 1, ticketNumber: 1 }, { unique: true });
ticketSchema.index({ guildId: 1, status: 1 });
ticketSchema.index({ guildId: 1, userId: 1 });
ticketSchema.index({ guildId: 1, assignedTo: 1, status: 1 });
ticketSchema.index({ guildId: 1, category: 1, priority: 1 });

ticketSchema.virtual('responseTime').get(function() {
  if (!this.responses || this.responses.length === 0) return null;
  const firstResponse = this.responses[0];
  return (firstResponse.timestamp - this.createdAt) / (1000 * 60); 
});

ticketSchema.statics.createTicketNumber = async function(guildId) {
  try {
    const lastTicket = await this.findOne({ guildId })
      .sort({ ticketNumber: -1 })
      .select('ticketNumber')
      .lean();

    const nextNumber = (lastTicket?.ticketNumber || 0) + 1;
    const ticketId = `TICKET-${nextNumber.toString().padStart(4, '0')}`;

    const existingTicket = await this.findOne({
      guildId,
      $or: [
        { ticketNumber: nextNumber },
        { ticketId }
      ]
    }).select('_id').lean();

    if (existingTicket) {
      throw new Error(`رقم التذكرة ${ticketId} موجود بالفعل`);
    }

    return { ticketNumber: nextNumber, ticketId };
  } catch (error) {
    throw error;
  }
};

ticketSchema.statics.calculateEstimatedTime = function(category, content) {
  const baseTime = {
    'دعم_فني': 60,
    'شكوى': 45,
    'اقتراح': 30,
    'استفسار': 15,
    'أخرى': 30
  };

  let estimatedTime = baseTime[category] || 30;
  
  const contentLength = content?.length || 0;
  if (contentLength > 1000) {
    estimatedTime *= 2;
  } else if (contentLength > 500) {
    estimatedTime *= 1.5;
  }

  return Math.round(estimatedTime);
};

ticketSchema.statics.autoClassify = function(content) {
    if (!content) return 'أخرى';
    
    const lowerContent = content.toLowerCase();
    
    const patterns = {
        'دعم_فني': /خطأ|مشكلة|لا يعمل|عطل|توقف|خربان|معلق|ما يشتغل|واقف|مهنق|مو شغال|مب شغال|خرب|باظ|مش شغال|واقع|مبيشتغلش|عطلان|باگ|مشاكل|صعوبة|صعب/i,
        'شكوى': /شكوى|سيء|غير راضي|مستاء|زفت|خايس|ما عجبني|مو حلو|تعبان|مب زين|وحش|مش حلو|زبالة|مش عاجبني|مضايق|زعلان|معصب|متضايق|مخرب/i,
        'اقتراح': /اقتراح|فكرة|تحسين|تطوير|ودي|ابغى|يليت|ياليت|لو تسوون|عندي فكرة|عايز|نفسي|ياريت|لو تعملوا|ممكن|اذا ممكن|حلو لو/i,
        'استفسار': /كيف|متى|أين|ما هو|هل|وش|متى|وين|كيفية|ليه|ليش|ازاي|امتى|فين|ليه|محتاج اعرف|عندي سؤال|استفسار/i
    };

    const categoryMatch = Object.entries(patterns).find(
        ([_, pattern]) => pattern.test(lowerContent)
    );
    
    return categoryMatch ? categoryMatch[0] : 'أخرى';
};

ticketSchema.statics.getOpenTickets = function(guildId, options = {}) {
  const query = { guildId, status: 'open' };
  
  if (options.category) query.category = options.category;
  if (options.priority) query.priority = options.priority;
  if (options.assignedTo) query.assignedTo = options.assignedTo;
  
  const projection = options.fields ? options.fields : 
    'ticketId ticketNumber userId category priority assignedTo createdAt';
  
  return this.find(query)
    .select(projection)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 50)
    .lean();
};

ticketSchema.statics.closeTicket = function(ticketId, closedBy) {
  return this.updateOne(
    { ticketId },
    { 
      $set: { 
        status: 'closed',
        closedAt: new Date(),
        closedBy
      }
    }
  );
};

ticketSchema.statics.addResponse = function(ticketId, responseData) {
  return this.updateOne(
    { ticketId },
    { 
      $push: { 
        responses: {
          ...responseData,
          timestamp: new Date()
        }
      }
    }
  );
};

ticketSchema.statics.assignTicket = function(ticketId, adminId) {
  return this.updateOne(
    { ticketId },
    { $set: { assignedTo: adminId } }
  );
};

ticketSchema.statics.getStats = async function(guildId, period = 30) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);
  
  const pipeline = [
    {
      $match: {
        guildId,
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalTickets: { $sum: 1 },
        openTickets: {
          $sum: {
            $cond: [{ $eq: ["$status", "open"] }, 1, 0]
          }
        },
        closedTickets: {
          $sum: {
            $cond: [{ $eq: ["$status", "closed"] }, 1, 0]
          }
        },
        averageResponseTime: { $avg: "$estimatedTime" },
        categoryBreakdown: {
          $push: "$category"
        },
        priorityBreakdown: {
          $push: "$priority"
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalTickets: 1,
        openTickets: 1,
        closedTickets: 1,
        averageResponseTime: 1,
        categoryBreakdown: 1,
        priorityBreakdown: 1
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalTickets: 0,
    openTickets: 0,
    closedTickets: 0,
    averageResponseTime: 0,
    categoryBreakdown: [],
    priorityBreakdown: []
  };
};

module.exports = mongoose.model('Ticket', ticketSchema);