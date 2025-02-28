require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');

async function cleanTickets() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('متصل بقاعدة البيانات...');

        // حذف جميع التذاكر
        await Ticket.deleteMany({});
        console.log('تم حذف جميع التذاكر');

        // إعادة إنشاء المؤشرات
        await Ticket.collection.dropIndexes();
        console.log('تم حذف المؤشرات القديمة');

        await Ticket.syncIndexes();
        console.log('تم إعادة إنشاء المؤشرات');

    } catch (error) {
        console.error('حدث خطأ:', error);
    } finally {
        await mongoose.disconnect();
        console.log('تم قطع الاتصال بقاعدة البيانات');
    }
}

cleanTickets(); 