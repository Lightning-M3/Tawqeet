const mongoose = require('mongoose');

const applySettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    applyChannelId: { type: String, required: true },
    logsChannelId: { type: String, required: true },
    staffRoleId: { type: String, required: true },
    applyTitle: { type: String, default: '📝 التقديم على الإدارة' },
    applyDescription: { type: String },
    questions: [{
        question: String,
        required: { type: Boolean, default: true }
    }],
    isActive: { type: Boolean, default: true },
    cooldown: { type: Number, default: 7 * 24 * 60 * 60 * 1000 } // 7 أيام
});

module.exports = mongoose.model('ApplySettings', applySettingsSchema); 