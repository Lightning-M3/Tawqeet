const crypto = require('crypto');
const logger = require('./logger');

class SecurityManager {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.tokenKey = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32);
        this.failedAttempts = new Map();
        this.maxAttempts = 5;
        this.lockoutTime = 3600000; // ساعة واحدة
    }

    encryptToken(token) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.tokenKey, iv);
        const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return {
            iv: iv.toString('hex'),
            content: encrypted.toString('hex'),
            tag: tag.toString('hex')
        };
    }

    decryptToken(encrypted) {
        const decipher = crypto.createDecipheriv(
            this.algorithm, 
            this.tokenKey, 
            Buffer.from(encrypted.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encrypted.content, 'hex')),
            decipher.final()
        ]);
        return decrypted.toString();
    }

    checkRateLimit(userId) {
        const attempts = this.failedAttempts.get(userId) || { count: 0, timestamp: Date.now() };
        if (attempts.count >= this.maxAttempts) {
            const timePassed = Date.now() - attempts.timestamp;
            if (timePassed < this.lockoutTime) {
                return false;
            }
            this.failedAttempts.delete(userId);
        }
        return true;
    }

    recordFailedAttempt(userId) {
        const attempts = this.failedAttempts.get(userId) || { count: 0, timestamp: Date.now() };
        attempts.count++;
        attempts.timestamp = Date.now();
        this.failedAttempts.set(userId, attempts);
        logger.log('warn', `محاولة فاشلة للوصول من المستخدم: ${userId}`, { attempts: attempts.count });
    }
}

module.exports = new SecurityManager(); 