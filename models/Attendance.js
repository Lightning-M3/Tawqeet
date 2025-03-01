const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  date: { type: Date, required: true },
  sessions: [{
    checkIn: { type: Date, required: true },
    checkOut: { type: Date },
    duration: { type: Number, default: 0 } // بالدقائق
  }],
  totalDuration: { type: Number, default: 0 }, // إجمالي الوقت بالدقائق
  totalHours: { type: Number, default: 0 },
  totalMinutes: { type: Number, default: 0 },
  sessionsCount: { type: Number, default: 0 }, // عدد الجلسات المكتملة
  lastSessionDuration: { type: Number, default: 0 } // مدة آخر جلسة بالدقائق
}, 
// إضافة طوابع الوقت وإنشاء مستند رقيق
{ 
  timestamps: true,
  // منع تحويل _id إلى كائن ObjectId داخل المصفوفات الفرعية للتقليل من استهلاك الذاكرة
  _id: false,
  id: false
});

// إضافة مؤشرات للبحث السريع
attendanceSchema.index({ userId: 1, guildId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ guildId: 1, date: 1 });
attendanceSchema.index({ userId: 1, date: -1 });

// تحسين دالة حساب الوقت
attendanceSchema.methods.calculateTime = function() {
  // استخدام كائنات الجلسات المكتملة فقط
  const completedSessions = this.sessions.filter(session => session.checkOut);
  
  // استخدام reduce بدلاً من forEach للتحسين
  const { totalMinutes, lastSessionDuration } = completedSessions.reduce((acc, session, index, array) => {
    // حساب المدة مرة واحدة فقط
    const duration = Math.floor((session.checkOut - session.checkIn) / (1000 * 60));
    
    // تحديث مدة الجلسة
    session.duration = duration;
    
    // تراكم إجمالي الدقائق
    acc.totalMinutes += duration;
    
    // تحديث مدة آخر جلسة إذا كانت هذه هي الأخيرة
    if (index === array.length - 1) {
      acc.lastSessionDuration = duration;
    }
    
    return acc;
  }, { totalMinutes: 0, lastSessionDuration: 0 });

  // تحديث إحصائيات الوقت
  this.totalDuration = totalMinutes;
  this.totalHours = Math.floor(totalMinutes / 60);
  this.totalMinutes = totalMinutes % 60;
  this.sessionsCount = completedSessions.length;
  this.lastSessionDuration = completedSessions.length ? lastSessionDuration : 0;
};

// دالة مساعدة لحساب متوسط وقت الجلسات - محسنة
attendanceSchema.methods.getAverageSessionDuration = function() {
  if (this.sessionsCount === 0) return 0;
  return Math.floor(this.totalDuration / this.sessionsCount);
};

// دالة مساعدة للحصول على تفاصيل الجلسات - محسنة لتصفية النتائج مباشرة
attendanceSchema.methods.getSessionsDetails = function() {
  return this.sessions
    .filter(session => session.checkOut)
    .map((session, index) => ({
      sessionNumber: index + 1,
      startTime: session.checkIn,
      endTime: session.checkOut,
      duration: session.duration
    }));
};

// إضافة طريقة ساكنة للتحديث المباشر للكفاءة
attendanceSchema.statics.updateAttendance = async function(userId, guildId, date, sessionData) {
  const result = await this.updateOne(
    { userId, guildId, date },
    { 
      $push: { sessions: sessionData }
    },
    { upsert: true }
  );
  
  return result;
};

// إضافة طريقة لتحديث معلومات تسجيل الخروج بكفاءة (بدون قراءة ثم كتابة)
attendanceSchema.statics.updateCheckOut = async function(userId, guildId, date, checkOutTime) {
  return this.updateOne(
    {
      userId,
      guildId,
      date,
      'sessions.checkOut': { $exists: false }
    },
    {
      $set: { 'sessions.$.checkOut': checkOutTime }
    }
  );
};

// إضافة طريقة للحصول على تقرير الحضور مع التحسين
attendanceSchema.statics.getReport = async function(userId, guildId, startDate, endDate) {
  return this.find({ 
    userId, 
    guildId, 
    date: { $gte: startDate, $lte: endDate } 
  })
  .sort({ date: 1 })
  .select('date totalDuration totalHours totalMinutes sessionsCount')
  .lean();
};

module.exports = mongoose.model('Attendance', attendanceSchema);