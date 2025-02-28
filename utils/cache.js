class Cache {
    constructor() {
        this.cache = new Map();
        this.ttl = new Map();
    }

    set(key, value, ttl = 3600000) { // افتراضياً ساعة واحدة
        this.cache.set(key, value);
        this.ttl.set(key, Date.now() + ttl);
    }

    get(key) {
        if (this.has(key)) {
            const now = Date.now();
            if (now > this.ttl.get(key)) {
                this.delete(key);
                return null;
            }
            return this.cache.get(key);
        }
        return null;
    }

    has(key) {
        return this.cache.has(key);
    }

    delete(key) {
        this.cache.delete(key);
        this.ttl.delete(key);
    }

    clear() {
        this.cache.clear();
        this.ttl.clear();
    }

    cleanup() {
        const now = Date.now();
        for (const [key, expiry] of this.ttl.entries()) {
            if (now > expiry) {
                this.delete(key);
            }
        }
    }
}

module.exports = new Cache(); 