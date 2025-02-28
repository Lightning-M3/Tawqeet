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
});

attendanceSchema.methods.calculateTime = function() {
  let totalMinutes = 0;
  let completedSessions = 0;
  
  // حساب مدة كل جلسة وجمع الأوقات
  this.sessions.forEach(session => {
    if (session.checkOut) {
      const duration = Math.floor((session.checkOut - session.checkIn) / (1000 * 60));
      session.duration = duration;
      totalMinutes += duration;
      completedSessions++;

      // تحديث مدة آخر جلسة
      if (completedSessions === this.sessions.length) {
        this.lastSessionDuration = duration;
      }
    }
  });

  // تحديث إحصائيات الوقت
  this.totalDuration = totalMinutes;
  this.totalHours = Math.floor(totalMinutes / 60);
  this.totalMinutes = totalMinutes % 60;
  this.sessionsCount = completedSessions;
};

// دالة مساعدة لحساب متوسط وقت الجلسات
attendanceSchema.methods.getAverageSessionDuration = function() {
  if (this.sessionsCount === 0) return 0;
  return Math.floor(this.totalDuration / this.sessionsCount);
};

// دالة مساعدة للحصول على تفاصيل الجلسات
attendanceSchema.methods.getSessionsDetails = function() {
  return this.sessions.map((session, index) => {
    if (!session.checkOut) return null;
    return {
      sessionNumber: index + 1,
      startTime: session.checkIn,
      endTime: session.checkOut,
      duration: session.duration
    };
  }).filter(session => session !== null);
};

module.exports = mongoose.model('Attendance', attendanceSchema); 