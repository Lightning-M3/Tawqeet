const { EmbedBuilder } = require('discord.js');
const { getErrorChannel, setupErrorChannel, retryOperation } = require('./helpers');
const logger = require('./logger');

/**
 * معالجة أخطاء التفاعل بشكل موحد
 * @param {Interaction} interaction - كائن التفاعل
 * @param {Error} error - كائن الخطأ
 * @param {Object} context - معلومات إضافية عن سياق الخطأ
 */
async function handleInteractionError(interaction, error, context = {}) {
    try {
        // تحديد نوع الخطأ ورسالة مناسبة للمستخدم
        const errorInfo = getErrorInfo(error);
        
        // إرسال رسالة الخطأ للمستخدم
        await sendUserErrorMessage(interaction, errorInfo.userMessage);

        // تسجيل الخطأ بالتفاصيل
        logger.error('خطأ في معالجة التفاعل', {
            error: error.message,
            errorType: error.name,
            stack: error.stack,
            severity: errorInfo.severity,
            interactionType: interaction.type,
            commandName: interaction.commandName,
            customId: interaction.customId,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            context
        });

        // تسجيل في قناة الأخطاء إذا كان الخطأ في سيرفر
        if (interaction.guild) {
            await logErrorToChannel(interaction, error, errorInfo, context);
        }
    } catch (secondaryError) {
        logger.error('خطأ في معالجة الخطأ الأصلي', { 
            originalError: error.message,
            secondaryError: secondaryError.message,
            stack: secondaryError.stack
        });
    }
}

/**
 * تحديد نوع الخطأ ورسالة مناسبة
 * @param {Error} error - كائن الخطأ
 * @returns {Object} معلومات الخطأ
 */
function getErrorInfo(error) {
    // التعرف على أنواع الأخطاء المختلفة
    switch (true) {
        case error instanceof TypeError:
            return {
                type: 'TypeError',
                userMessage: '❌ حدث خطأ في معالجة البيانات. الرجاء التأكد من صحة المدخلات.',
                severity: 'high'
            };
        case error.code === 50013:
            return {
                type: 'MissingPermissions',
                userMessage: '❌ البوت يحتاج إلى صلاحيات إضافية لتنفيذ هذا الأمر.',
                severity: 'high'
            };
        case error.code === 'INTERACTION_ALREADY_REPLIED':
            return {
                type: 'InteractionError',
                userMessage: '❌ تم معالجة هذا الطلب مسبقاً.',
                severity: 'low'
            };
        case error.message.includes('permissions'):
            return {
                type: 'PermissionError',
                userMessage: '❌ لا تملك الصلاحيات الكافية لتنفيذ هذا الأمر.',
                severity: 'medium'
            };
        case error.message.includes('customId'):
            return {
                type: 'InvalidInteraction',
                userMessage: '❌ تفاعل غير صالح. الرجاء المحاولة مرة أخرى.',
                severity: 'medium'
            };
        case error.message.includes('rate limit'):
            return {
                type: 'RateLimit',
                userMessage: '❌ الرجاء الانتظار قليلاً قبل المحاولة مرة أخرى.',
                severity: 'low'
            };
        default:
            return {
                type: 'UnknownError',
                userMessage: '❌ عذراً، حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى لاحقاً.',
                severity: 'medium'
            };
    }
}

/**
 * إرسال رسالة الخطأ للمستخدم
 * @param {Interaction} interaction - كائن التفاعل
 * @param {string} message - رسالة الخطأ
 */
async function sendUserErrorMessage(interaction, message) {
    const errorMessage = {
        content: message,
        ephemeral: true
    };

    try {
        if (interaction.deferred && !interaction.replied) {
            await interaction.followUp(errorMessage);
        } else if (!interaction.replied) {
            await interaction.reply(errorMessage);
        }
    } catch (error) {
        logger.error('فشل في إرسال رسالة الخطأ للمستخدم:', {
            error: error.message,
            interactionId: interaction.id,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id
        });
    }
}

/**
 * تسجيل الخطأ في قناة الأخطاء
 * @param {Interaction} interaction - كائن التفاعل
 * @param {Error} error - كائن الخطأ
 * @param {Object} errorInfo - معلومات الخطأ
 * @param {Object} context - معلومات السياق
 */
async function logErrorToChannel(interaction, error, errorInfo, context) {
    await retryOperation(async () => {
        const errorChannel = await getErrorChannel(interaction.guild);
        if (!errorChannel) return;

        const errorEmbed = new EmbedBuilder()
            .setTitle(`🚨 تقرير خطأ | ${errorInfo.type}`)
            .setDescription(`حدث خطأ أثناء معالجة طلب من ${interaction.user}`)
            .addFields([
                { 
                    name: '🔍 معلومات التفاعل',
                    value: [
                        `نوع التفاعل: ${interaction.type}`,
                        `الأمر: ${interaction.commandName || interaction.customId || 'غير متوفر'}`,
                        `القناة: ${interaction.channel || 'غير متوفر'}`
                    ].join('\n'),
                    inline: false 
                },
                { 
                    name: '❌ معلومات الخطأ',
                    value: [
                        `النوع: ${errorInfo.type}`,
                        `الرسالة: ${error.message}`,
                        `الخطورة: ${errorInfo.severity}`
                    ].join('\n'),
                    inline: false 
                },
                {
                    name: '👤 معلومات المستخدم',
                    value: [
                        `المستخدم: ${interaction.user.tag}`,
                        `المعرف: ${interaction.user.id}`,
                        `السيرفر: ${interaction.guild.name}`,
                        `معرف السيرفر: ${interaction.guild.id}`
                    ].join('\n'),
                    inline: false
                }
            ])
            .setColor(getErrorColor(errorInfo.severity))
            .setTimestamp();

        if (error.stack) {
            const stackTrace = error.stack.split('\n').slice(0, 3).join('\n');
            errorEmbed.addFields({
                name: '📚 Stack Trace',
                value: `\`\`\`${stackTrace}\`\`\``,
                inline: false
            });
        }

        if (Object.keys(context).length > 0) {
            errorEmbed.addFields({
                name: '📝 معلومات إضافية',
                value: `\`\`\`json\n${JSON.stringify(context, null, 2)}\`\`\``,
                inline: false
            });
        }

        await errorChannel.send({ embeds: [errorEmbed] });
    }, 3);
}

/**
 * تحديد لون التقرير بناءً على خطورة الخطأ
 * @param {string} severity - مستوى خطورة الخطأ
 * @returns {number} لون التقرير
 */
function getErrorColor(severity) {
    switch (severity) {
        case 'high':
            return 0xff0000; // أحمر
        case 'medium':
            return 0xffa500; // برتقالي
        case 'low':
            return 0xffff00; // أصفر
        default:
            return 0x808080; // رمادي
    }
}

module.exports = {
    handleInteractionError
}; 