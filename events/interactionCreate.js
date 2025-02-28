const { Events } = require('discord.js');
const Leave = require('../models/Leave');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isButton()) return;

        if (interaction.customId.startsWith('approve_leave_')) {
            await handleApproveLeave(interaction);
        } else if (interaction.customId.startsWith('reject_leave_')) {
            await handleRejectLeave(interaction);
        }
    }
};

async function handleApproveLeave(interaction) {
    try {
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