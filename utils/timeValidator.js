class TimeValidator {
    static validateCheckIn(date) {
        const now = new Date();
        if (date > now) {
            throw new Error('لا يمكن تسجيل وقت في المستقبل');
        }
    }

    static validateCheckOut(checkIn, checkOut) {
        if (checkOut <= checkIn) {
            throw new Error('وقت الخروج يجب أن يكون بعد وقت الدخول');
        }
    }

    static getNextDay() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
    }

    static isEndOfDay() {
        const now = new Date();
        return now.getHours() === 23 && now.getMinutes() === 59;
    }
}

module.exports = TimeValidator; 