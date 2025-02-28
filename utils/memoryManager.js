class MemoryManager {
    constructor() {
        this.maxCacheSize = 1000; // الحد الأقصى لعدد العناصر في الذاكرة المؤقتة
        this.cleanupInterval = 3600000; // تنظيف كل ساعة
    }

    startCleanup() {
        setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }

    cleanup() {
        // تنظيف rateLimits
        if (global.rateLimits && global.rateLimits.size > this.maxCacheSize) {
            const now = Date.now();
            global.rateLimits.forEach((timestamp, key) => {
                if (now - timestamp > this.cleanupInterval) {
                    global.rateLimits.delete(key);
                }
            });
        }

        // تنظيف commandCooldowns
        if (global.commandCooldowns && global.commandCooldowns.size > this.maxCacheSize) {
            const now = Date.now();
            global.commandCooldowns.forEach((timestamp, key) => {
                if (now - timestamp > this.cleanupInterval) {
                    global.commandCooldowns.delete(key);
                }
            });
        }

        // تنظيف الذاكرة
        if (global.gc) {
            global.gc();
        }
    }
}

module.exports = new MemoryManager(); 