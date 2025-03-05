const { Events } = require('discord.js');
const Leave = require('../models/Leave');
const logger = require('../utils/logger');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            if (!interaction.isButton()) return;

            // التحقق من وجود customId قبل استخدامه
            if (!interaction.customId) {
                logger.warn('تفاعل بدون customId', {
                    type: interaction.type,
                    userId: interaction.user?.id,
                    guildId: interaction.guild?.id
                });
                return;
            }

            if (interaction.customId.startsWith('approve_leave_')) {
                await handleApproveLeave(interaction);
            } else if (interaction.customId.startsWith('reject_leave_')) {
                await handleRejectLeave(interaction);
            }
        } catch (error) {
            logger.error('خطأ في معالجة التفاعل في interactionCreate:', {
                error: error.message,
                stack: error.stack,
                type: interaction.type,
                customId: interaction.customId,
                userId: interaction.user?.id,
                guildId: interaction.guild?.id
            });

            try {
                const errorMessage = {
                    content: '❌ حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى لاحقاً.',
                    ephemeral: true
                };

                if (interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply(errorMessage);
                }
            } catch (secondaryError) {
                logger.error('خطأ في إرسال رسالة الخطأ:', {
                    error: secondaryError.message,
                    originalError: error.message
                });
            }
        }
    }
};

async function handleApproveLeave(interaction) {
    try {
        // التحقق من صلاحيات البوت قبل إجراء العملية
        if (!interaction.guild.members.me.permissions.has('SendMessages')) {
            return await interaction.reply({
                content: '❌ البوت لا يملك الصلاحيات الكافية لإرسال الرسائل',
                ephemeral: true
            });
        }
        const leaveId = interaction.customId.replace('approve_leave_', '');
        const leave = await Leave.findById(leaveId);
        
        if (!leave) {
            return await interaction.reply({
                content: '❌ لم يتم العثور على طلب الإجازة',
                ephemeral: true
            });
        }

        // تحديث حالة الإجازة
        leave.status = 'approved';
        leave.startDate = new Date();
        leave.endDate = new Date();
        leave.endDate.setDate(leave.endDate.getDate() + calculateDuration(leave.startDate, leave.endDate) - 1);
        await leave.save();

        // إضافة رتبة الإجازة
        const vacationRole = await getOrCreateVacationRole(interaction.guild);
        const member = await interaction.guild.members.fetch(leave.adminId);
        await member.roles.add(vacationRole);

        // جدولة إزالة الرتبة
        setTimeout(async () => {
            try {
                await member.roles.remove(vacationRole);
                leave.status = 'completed';
                await leave.save();
            } catch (error) {
                console.error('Error removing vacation role:', error);
            }
        }, calculateDuration(leave.startDate, leave.endDate) * 24 * 60 * 60 * 1000);

        // إشعار المستخدم
        const user = await interaction.client.users.fetch(leave.adminId);
        await user.send({
            content: `✅ تم قبول طلب إجازتك!\nالمدة: ${calculateDuration(leave.startDate, leave.endDate)} يوم\nتم إضافة رتبة الإجازة.`
        });

        await interaction.update({
            components: [],
            embeds: [interaction.message.embeds[0].setColor(0x00FF00).spliceFields(-1, 1, { name: 'الحالة', value: 'مقبولة' })]
        });

    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: '❌ حدث خطأ أثناء معالجة الطلب',
            ephemeral: true
        });
    }
}

async function handleRejectLeave(interaction) {
    try {
        // التحقق من صلاحيات البوت قبل إجراء العملية
        if (!interaction.guild.members.me.permissions.has('SendMessages')) {
            return await interaction.reply({
                content: '❌ البوت لا يملك الصلاحيات الكافية لإرسال الرسائل',
                ephemeral: true
            });
        }
        const leaveId = interaction.customId.replace('reject_leave_', '');
        const leave = await Leave.findById(leaveId);
        
        if (!leave) {
            return await interaction.reply({
                content: '❌ لم يتم العثور على طلب الإجازة',
                ephemeral: true
            });
        }

        // تحديث حالة الإجازة
        leave.status = 'rejected';
        await leave.save();

        // إشعار المستخدم
        const user = await interaction.client.users.fetch(leave.adminId);
        await user.send({
            content: '❌ تم رفض طلب إجازتك.'
        });

        await interaction.update({
            components: [],
            embeds: [interaction.message.embeds[0].setColor(0xFF0000).spliceFields(-1, 1, { name: 'الحالة', value: 'مرفوضة' })]
        });

    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: '❌ حدث خطأ أثناء معالجة الطلب',
            ephemeral: true
        });
    }
}

async function getOrCreateVacationRole(guild) {
    let role = guild.roles.cache.find(r => r.name === 'إجازة');
    
    if (!role) {
        role = await guild.roles.create({
            name: 'إجازة',
            color: 0xFFA500,
            reason: 'رتبة للأعضاء في إجازة'
        });
    }
    
    return role;
}