/**
 * وحدة معالجة أخطاء Discord API
 * تحتوي على دوال متخصصة للتعامل مع أخطاء Discord API وإعادة المحاولة
 */

const logger = require('./logger');

/**
 * دالة لإعادة محاولة عمليات Discord API مع معالجة خاصة للأخطاء
 * @param {Function} operation - العملية المراد تنفيذها
 * @param {number} maxRetries - الحد الأقصى لعدد المحاولات
 * @param {number} initialDelay - التأخير الأولي بين المحاولات (بالمللي ثانية)
 * @returns {Promise<any>} - نتيجة العملية
 */
async function retryDiscordOperation(operation, maxRetries = 3, initialDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            // التحقق من نوع الخطأ
            const isServiceUnavailable = 
                error.message?.includes('Service Unavailable') ||
                error.code === 503 ||
                error.httpStatus === 503;

            const isRateLimited = 
                error.message?.includes('rate limit') ||
                error.code === 429 ||
                error.httpStatus === 429;

            const isInteractionError = 
                error.name === 'InteractionNotReplied' ||
                error.message?.includes('The reply to this interaction has not been sent or deferred');
                
            const isUnknownInteraction = 
                error.code === 10062 ||
                error.message?.includes('Unknown interaction');

            // تسجيل معلومات الخطأ
            logger.warn(`Discord API error (attempt ${attempt + 1}/${maxRetries}):`, {
                error: error.message,
                code: error.code,
                httpStatus: error.httpStatus,
                name: error.name,
                isServiceUnavailable,
                isRateLimited,
                isInteractionError,
                isUnknownInteraction
            });

            // إذا كانت المحاولة الأخيرة، إعادة رمي الخطأ
            if (attempt === maxRetries - 1) {
                throw error;
            }

            // إذا كان خطأ تفاعل أو تفاعل غير معروف، لا داعي لإعادة المحاولة
            if (isInteractionError || isUnknownInteraction) {
                throw error;
            }

            // حساب وقت الانتظار مع زيادة تدريجية (exponential backoff)
            const delay = initialDelay * Math.pow(2, attempt);
            
            // إذا كان الخطأ بسبب تجاوز الحد، استخدام وقت الانتظار المقترح إن وجد
            if (isRateLimited && error.retryAfter) {
                await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
            } else {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

/**
 * دالة للتعامل مع أخطاء التفاعل بشكل آمن
 * @param {Interaction} interaction - كائن التفاعل
 * @param {Function} replyFunction - دالة الرد المراد تنفيذها
 * @param {Object} options - خيارات الرد
 * @param {number} maxRetries - الحد الأقصى لعدد المحاولات
 * @returns {Promise<boolean>} - نجاح أو فشل العملية
 */
async function safeReply(interaction, replyFunction, options, maxRetries = 3) {
    try {
        // التحقق من صلاحية التفاعل قبل محاولة الرد
        if (!interaction.isRepliable()) {
            logger.warn('محاولة الرد على تفاعل غير قابل للرد:', {
                interactionId: interaction.id,
                userId: interaction.user?.id,
                guildId: interaction.guild?.id,
                customId: interaction.customId
            });
            return false;
        }
        
        await retryDiscordOperation(async () => {
            // التحقق من حالة التفاعل
            if (interaction.deferred && !interaction.replied) {
                await interaction.followUp(options);
            } else if (!interaction.replied) {
                await replyFunction.call(interaction, options);
            } else {
                // إذا كان التفاعل قد تم الرد عليه بالفعل، محاولة استخدام followUp
                await interaction.followUp(options);
            }
        }, maxRetries);
        return true;
    } catch (error) {
        // تحقق من نوع الخطأ
        const isUnknownInteraction = error.code === 10062 || error.message?.includes('Unknown interaction');
        
        logger.error('فشل في الرد على التفاعل بعد عدة محاولات:', {
            error: error.message,
            code: error.code,
            interactionId: interaction.id,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id,
            isUnknownInteraction
        });
        return false;
    }
}

/**
 * دالة للتعامل مع أخطاء Discord API
 * @param {Error} error - كائن الخطأ
 * @returns {Object} - معلومات الخطأ المعالجة
 */
function processDiscordError(error) {
    // تحديد نوع الخطأ
    const errorInfo = {
        isServiceUnavailable: false,
        isRateLimited: false,
        isInteractionError: false,
        isPermissionError: false,
        retryable: false,
        userMessage: '❌ حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى لاحقاً.',
        severity: 'medium'
    };

    // تحليل الخطأ
    if (error.message?.includes('Service Unavailable') || error.code === 503 || error.httpStatus === 503) {
        errorInfo.isServiceUnavailable = true;
        errorInfo.retryable = true;
        errorInfo.userMessage = '❌ خدمة Discord غير متاحة حالياً. الرجاء المحاولة مرة أخرى بعد قليل.';
        errorInfo.severity = 'high';
    } else if (error.message?.includes('rate limit') || error.code === 429 || error.httpStatus === 429) {
        errorInfo.isRateLimited = true;
        errorInfo.retryable = true;
        errorInfo.userMessage = '❌ تم تجاوز الحد المسموح من الطلبات. الرجاء الانتظار قليلاً قبل المحاولة مرة أخرى.';
        errorInfo.severity = 'medium';
    } else if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
        errorInfo.isInteractionError = true;
        errorInfo.retryable = false;
        errorInfo.userMessage = '❌ انتهت صلاحية التفاعل. الرجاء المحاولة مرة أخرى.';
        errorInfo.severity = 'low';
    } else if (error.name === 'InteractionNotReplied' || error.message?.includes('The reply to this interaction has not been sent or deferred')) {
        errorInfo.isInteractionError = true;
        errorInfo.retryable = false;
        errorInfo.userMessage = '❌ حدث خطأ في معالجة التفاعل. الرجاء المحاولة مرة أخرى.';
        errorInfo.severity = 'low';
    } else if (error.code === 50013 || error.message?.includes('Missing Permissions')) {
        errorInfo.isPermissionError = true;
        errorInfo.retryable = false;
        errorInfo.userMessage = '❌ البوت لا يملك الصلاحيات الكافية لتنفيذ هذا الإجراء.';
        errorInfo.severity = 'high';
    }

    return errorInfo;
}

module.exports = {
    retryDiscordOperation,
    safeReply,
    processDiscordError
};