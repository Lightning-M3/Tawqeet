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
// إضافة طوابع الوقت
{ 
  timestamps: true
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
  
  // تحديث البيانات الإجمالية
  this.totalDuration = totalMinutes;
  this.totalHours = Math.floor(totalMinutes / 60);
  this.totalMinutes = totalMinutes % 60;
  this.sessionsCount = completedSessions.length;
  this.lastSessionDuration = lastSessionDuration;
  
  return {
    totalHours: this.totalHours,
    totalMinutes: this.totalMinutes,
    totalDuration: this.totalDuration,
    sessionsCount: this.sessionsCount
  };
};

// دالة مساعدة لحساب متوسط وقت الجلسات - محسنة
attendanceSchema.methods.getAverageSessionDuration = function() {
  return this.sessionsCount > 0 ? Math.round(this.totalDuration / this.sessionsCount) : 0;
};

// دالة مساعدة للحصول على تفاصيل الجلسات - محسنة لتصفية النتائج مباشرة
attendanceSchema.methods.getSessionsDetails = function() {
  return this.sessions.map(session => ({
    checkIn: session.checkIn,
    checkOut: session.checkOut,
    duration: session.duration,
    isCompleted: Boolean(session.checkOut),
    // مختصر بوقت محلي لتسهيل العرض
    localCheckIn: session.checkIn ? session.checkIn.toLocaleString() : null,
    localCheckOut: session.checkOut ? session.checkOut.toLocaleString() : null
  }));
};

// إضافة طريقة ساكنة لإنشاء سجل حضور جديد
attendanceSchema.statics.createAttendance = async function(userId, guildId, checkInTime) {
  try {
    const today = new Date(checkInTime);
    today.setUTCHours(0, 0, 0, 0);
    
    const newAttendance = new this({
      userId,
      guildId,
      date: today,
      sessions: [{
        checkIn: checkInTime,
        duration: 0
      }]
    });
    
    return await newAttendance.save();
  } catch (error) {
    // إعادة رمي الخطأ مع معلومات إضافية للتشخيص
    throw new Error(`فشل إنشاء سجل حضور جديد: ${error.message}`);
  }
};

// إضافة طريقة ساكنة للتحديث المباشر للكفاءة
attendanceSchema.statics.updateAttendance = async function(userId, guildId, date, sessionData) {
  // تحديث سجل الحضور باستخدام جلسة جديدة
  const result = await this.findOneAndUpdate(
    { userId, guildId, date },
    { 
      $push: { sessions: sessionData },
      $set: { lastUpdated: new Date() }
    },
    { new: true, upsert: true }
  );
  
  return result;
};

// إضافة طريقة لتحديث معلومات تسجيل الخروج بكفاءة (بدون قراءة ثم كتابة)
attendanceSchema.statics.updateCheckOut = async function(userId, guildId, date, checkOutTime) {
  // البحث عن السجل وآخر جلسة غير مكتملة
  const record = await this.findOne({ userId, guildId, date });
  
  if (!record || !record.sessions || record.sessions.length === 0) {
    throw new Error('لم يتم العثور على سجل حضور أو جلسات');
  }
  
  // العثور على آخر جلسة غير مكتملة
  const lastSessionIndex = record.sessions.findIndex(session => !session.checkOut);
  
  if (lastSessionIndex === -1) {
    throw new Error('جميع الجلسات مكتملة بالفعل');
  }
  
  // تحديث وقت تسجيل الخروج
  record.sessions[lastSessionIndex].checkOut = checkOutTime;
  
  // حساب الإحصائيات المحدثة
  record.calculateTime();
  
  // حفظ التغييرات
  await record.save();
  
  return record;
};

// إضافة طريقة للحصول على تقرير الحضور مع التحسين
attendanceSchema.statics.getReport = async function(userId, guildId, startDate, endDate) {
  return this.find({
    userId,
    guildId,
    date: { $gte: startDate, $lte: endDate }
  })
  .select('date sessions totalDuration totalHours totalMinutes sessionsCount')
  .sort({ date: 1 })
  .lean();
};

module.exports = mongoose.model('Attendance', attendanceSchema);