const { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const ApplySettings = require('../models/ApplySettings');
const GuildSettings = require('../models/GuildSettings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('إعداد أنظمة السيرفر المختلفة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('tickets')
                .setDescription('إعداد نظام التذاكر'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setDescription('إعداد نظام الترحيب'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('apply')
                .setDescription('إعداد نظام التقديم')
                .addChannelOption(option =>
                    option.setName('apply_channel')
                        .setDescription('قناة التقديم')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText))
                .addChannelOption(option =>
                    option.setName('logs_channel')
                        .setDescription('قناة سجلات التقديم')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText))
                .addRoleOption(option =>
                    option.setName('staff_role')
                        .setDescription('رتبة الإداريين')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('attendance')
                .setDescription('إعداد نظام الحضور')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('رتبة الإدارة')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('attendance_channel')
                        .setDescription('قناة تسجيل الحضور')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText))
                .addChannelOption(option =>
                    option.setName('log_channel')
                        .setDescription('قناة سجل الحضور')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText))),

    async execute(interaction) {
        if (!interaction.guild.members.me.permissions.has(['ManageChannels', 'ManageRoles'])) {
            return interaction.reply({
                content: 'البوت يحتاج إلى صلاحيات إدارة القنوات والأدوار!',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                default:
                    await interaction.reply({
                        content: 'هذا النظام قيد التطوير',
                        ephemeral: true
                    });
                    return;
                case 'attendance':
                    await setupAttendance(interaction);
                    break;
            }
        } catch (error) {
            console.error(`Error in setup command (${subcommand}):`, error);
            await interaction.reply({
                content: 'حدث خطأ أثناء إعداد النظام.',
                ephemeral: true
            });
        }
    }
};

async function setupAll(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        // جمع كل المعلومات المطلوبة أولاً
        const applyChannel = interaction.options.getChannel('apply_channel');
        const logsChannel = interaction.options.getChannel('apply_logs');
        const staffRole = interaction.options.getRole('staff_role');
        const attendanceRole = interaction.options.getRole('attendance_role');

        // التحقق من صحة المعلومات
        if (!applyChannel || !logsChannel || !staffRole || !attendanceRole) {
            throw new Error('بعض المعلومات المطلوبة غير متوفرة');
        }

        // التحقق من الصلاحيات
        const requiredPermissions = [
            'ManageChannels',
            'ManageRoles',
            'ViewChannel',
            'SendMessages',
            'EmbedLinks'
        ];

        const missingPermissions = requiredPermissions.filter(perm => 
            !interaction.guild.members.me.permissions.has(perm)
        );

        if (missingPermissions.length > 0) {
            throw new Error(`البوت يفتقد للصلاحيات التالية: ${missingPermissions.join(', ')}`);
        }

        // إعداد كل نظام مع معالجة الأخطاء لكل خطوة
        let progress = '';
        
        try {
            await setupTickets(interaction, false);
            progress += '✅ تم إعداد نظام التذاكر\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام التذاكر\n';
            console.error('Error in setupTickets:', error);
        }

        try {
            await setupWelcome(interaction, false);
            progress += '✅ تم إعداد نظام الترحيب\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام الترحيب\n';
            console.error('Error in setupWelcome:', error);
        }

        try {
            await setupApply(interaction, false);
            progress += '✅ تم إعداد نظام التقديم\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام التقديم\n';
            console.error('Error in setupApply:', error);
        }

        try {
            await setupAttendance(interaction, false, { role: attendanceRole });
            progress += '✅ تم إعداد نظام الحضور\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام الحضور\n';
            console.error('Error in setupAttendance:', error);
        }

        // إنشاء رسالة النتيجة النهائية
        const embed = new EmbedBuilder()
            .setTitle('نتيجة إعداد الأنظمة')
            .setDescription(progress)
            .setColor(progress.includes('❌') ? 'Red' : 'Green')
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in setupAll:', error);
        await interaction.editReply({
            content: `حدث خطأ أثناء الإعداد: ${error.message}`,
            ephemeral: true
        });
    }
}

async function setupTickets(interaction, shouldReply = true) {
    try {
        // التحقق من صلاحيات البوت
        const botMember = interaction.guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages
        ];

        // تحقق من جميع الصلاحيات المطلوبة مرة واحدة
        const missingPermissions = requiredPermissions.filter(permission => !botMember.permissions.has(permission));
        
        if (missingPermissions.length > 0) {
            // تحويل أرقام الصلاحيات إلى أسماء
            const permissionNames = missingPermissions.map(perm => {
                for (const [key, value] of Object.entries(PermissionFlagsBits)) {
                    if (value === perm) return key;
                }
                return 'Unknown';
            });
            
            throw new Error(`البوت يفتقد للصلاحيات التالية: ${permissionNames.join(', ')}`);
        }

        if (shouldReply && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true });
        }

        // التحقق من وجود القنوات مسبقاً
        const existingCategory = interaction.guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && 
            c.name === '🎫 نظام التذاكر'
        );

        if (existingCategory) {
            if (shouldReply) {
                await interaction.reply({
                    content: '❌ نظام التذاكر موجود بالفعل!',
                    ephemeral: true
                });
            }
            return;
        }

        // إنشاء الفئة والقنوات
        const category = await interaction.guild.channels.create({
            name: '🎫 نظام التذاكر',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages]
                },
                {
                    id: botMember.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        });

        // إنشاء القنوات
        const [logChannel, requestChannel] = await Promise.all([
            interaction.guild.channels.create({
                name: 'سجل-التذاكر',
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: botMember.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks
                        ]
                    }
                ]
            }),
            interaction.guild.channels.create({
                name: 'طلب-تذكرة',
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.SendMessages]
                    },
                    {
                        id: botMember.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.EmbedLinks
                        ]
                    }
                ]
            })
        ]);

        // إنشاء رسالة التذاكر
        const ticketEmbed = new EmbedBuilder()
            .setTitle('🎫 نظام التذاكر')
            .setDescription('اضغط على الزر أدناه لإنشاء تذكرة جديدة')
            .setColor(0x2B2D31)
            .setFooter({ 
                text: interaction.guild.name, 
                iconURL: interaction.guild.iconURL() 
            });

        const ticketButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('إنشاء تذكرة')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎫')
            );

        await requestChannel.send({
            embeds: [ticketEmbed],
            components: [ticketButton]
        });

        if (shouldReply) {
            await interaction.editReply({
                content: '✅ تم إعداد نظام التذاكر بنجاح!',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error in setupTickets:', error);
        
        const errorMessage = error.code === 50013 
            ? '❌ البوت يفتقد للصلاحيات اللازمة لإعداد نظام التذاكر'
            : '❌ حدث خطأ أثناء إعداد نظام التذاكر. الرجاء المحاولة مرة أخرى.';

        if (shouldReply) {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    }
}

async function setupWelcome(interaction, shouldReply = true) {
    // تأجيل الرد في بداية الدالة إذا لم يكن مؤجلاً بالفعل
    if (shouldReply && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    
    const guild = interaction.guild;
    
    try {
        // التحقق من صلاحيات البوت
        const botMember = interaction.guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            throw new Error('البوت لا يملك صلاحية إدارة القنوات');
        }

        // إنشاء قناة الترحيب
        const welcomeChannel = await interaction.guild.channels.create({
            name: '👋〡・الترحيب',
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    allow: [PermissionFlagsBits.ViewChannel],
                    deny: [PermissionFlagsBits.SendMessages]
                },
                {
                    id: interaction.client.user.id,
                    allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
                }
            ]
        });

        // تحديث إعدادات السيرفر
        await GuildSettings.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { welcomeChannelId: welcomeChannel.id },
            { upsert: true, new: true }
        );

        // الرد على المستخدم فقط إذا كان مطلوبًا
        if (shouldReply) {
            // استخدام editReply فقط لأن التفاعل مؤجل بالفعل
            await interaction.editReply({
                content: '✅ تم إعداد نظام الترحيب بنجاح!',
                ephemeral: true
            });
        }

        return true;
    } catch (error) {
        console.error('Error in setupWelcome:', error);
        
        if (shouldReply) {
            // استخدام editReply فقط لأن التفاعل مؤجل بالفعل
            await interaction.editReply({
                content: `❌ حدث خطأ أثناء إعداد نظام الترحيب: ${error.message}`,
                ephemeral: true
            });
        }
        
        throw error;
    }
}

async function setupApply(interaction, shouldReply = true, options = null) {
    // تأجيل الرد في بداية الدالة إذا لم يكن مؤجلاً بالفعل
    if (shouldReply && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    
    try {
        const guild = interaction.guild;
        const applyChannel = options?.applyChannel || interaction.options.getChannel('apply_channel');
        const logsChannel = options?.logsChannel || interaction.options.getChannel('apply_logs');
        const staffRole = options?.staffRole || interaction.options.getRole('staff_role');

        // التحقق من توفر المعلومات المطلوبة
        if (!applyChannel || !logsChannel || !staffRole) {
            throw new Error('القنوات أو الرتبة المطلوبة غير متوفرة');
        }

        // إنشاء قسم الطلبات إذا لم يكن موجوداً
        let applyCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '📝 نظام التقديم');
        if (!applyCategory) {
            applyCategory = await guild.channels.create({
                name: '📝 نظام التقديم',
                type: ChannelType.GuildCategory
            });
        }

        // تعيين الصلاحيات لقناة التقديم
        await applyChannel.setParent(applyCategory.id, { lockPermissions: false });
        await applyChannel.permissionOverwrites.edit(guild.id, {
            ViewChannel: true,
            SendMessages: false
        });

        // تعيين الصلاحيات لقناة السجلات
        await logsChannel.setParent(applyCategory.id, { lockPermissions: false });
        await logsChannel.permissionOverwrites.edit(guild.id, {
            ViewChannel: false
        });
        await logsChannel.permissionOverwrites.edit(staffRole.id, {
            ViewChannel: true
        });

        // تحديث الإعدادات في قاعدة البيانات
        await GuildSettings.findOneAndUpdate(
            { guildId: guild.id },
            {
                applyChannelId: applyChannel.id,
                applyLogsChannelId: logsChannel.id,
                staffRoleId: staffRole.id
            },
            { upsert: true, new: true }
        );

        // إرسال زر التقديم
        const applyButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('apply_button')
                .setLabel('تقديم طلب')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

        const applyEmbed = new EmbedBuilder()
            .setTitle('نظام التقديم')
            .setDescription('اضغط على الزر أدناه للتقديم')
            .setColor('#0099ff')
            .setTimestamp();

        await applyChannel.send({
            embeds: [applyEmbed],
            components: [applyButton]
        });

        // الرد على المستخدم فقط إذا كان مطلوبًا
        if (shouldReply) {
            // استخدام editReply فقط لأن التفاعل مؤجل بالفعل
            await interaction.editReply({
                content: '✅ تم إعداد نظام التقديم بنجاح!',
                ephemeral: true
            });
        }

        return true;
    } catch (error) {
        console.error('Error in setupApply:', error);
        
        if (shouldReply) {
            // استخدام editReply فقط لأن التفاعل مؤجل بالفعل
            await interaction.editReply({
                content: `❌ حدث خطأ أثناء إعداد نظام التقديم: ${error.message}`,
                ephemeral: true
            });
        }
        
        throw error;
    }
}

async function setupAttendance(interaction, shouldReply = true, options = null) {
    // تأجيل الرد في بداية الدالة إذا لم يكن مؤجلاً بالفعل
    if (shouldReply && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }
    
    const guild = interaction.guild;
    const selectedRole = options?.role || interaction.options.getRole('role');
    
    // الحصول على القنوات المحددة من قبل المسؤول
    const attendanceChannel = options?.attendanceChannel || interaction.options.getChannel('attendance_channel');
    const logChannel = options?.logChannel || interaction.options.getChannel('log_channel');
    
    // التحقق من وجود الرتبة والقنوات
    if (!selectedRole || !attendanceChannel || !logChannel) {
        const errorMessage = 'الرتبة أو القنوات المطلوبة غير متوفرة لإعداد نظام الحضور';
        console.error(errorMessage);
        
        if (shouldReply) {
            await interaction.editReply({
                content: `❌ ${errorMessage}`,
                ephemeral: true
            });
        }
        
        throw new Error(errorMessage);
    }
    
    // التحقق من أن القناتين مختلفتين
    if (attendanceChannel.id === logChannel.id) {
        const errorMessage = 'يجب أن تكون قناة الحضور وقناة السجل مختلفتين';
        console.error(errorMessage);
        
        if (shouldReply) {
            await interaction.editReply({
                content: `❌ ${errorMessage}`,
                ephemeral: true
            });
        }
        
        throw new Error(errorMessage);
    }
    
    // التحقق من صلاحيات البوت في القنوات
    const requiredPermissions = ['ViewChannel', 'SendMessages'];
    const botMember = guild.members.me;
    
    const attendanceChannelPerms = attendanceChannel.permissionsFor(botMember);
    const logChannelPerms = logChannel.permissionsFor(botMember);
    
    if (!attendanceChannelPerms.has(requiredPermissions) || !logChannelPerms.has(requiredPermissions)) {
        const errorMessage = 'البوت لا يملك الصلاحيات الكافية في القنوات المحددة (مطلوب: عرض القناة وإرسال الرسائل)';
        console.error(errorMessage);
        
        if (shouldReply) {
            await interaction.editReply({
                content: `❌ ${errorMessage}`,
                ephemeral: true
            });
        }
        
        throw new Error(errorMessage);
    }

    try {
        // إنشاء رتبة "مسجل حضوره" إذا لم تكن موجودة
        let attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (!attendanceRole) {
            attendanceRole = await guild.roles.create({
                name: 'مسجل حضوره',
                color: 0x00FF00,
                reason: 'رتبة تتبع الحضور'
            });
        }

        // إنشاء رسالة الحضور
        const attendanceEmbed = new EmbedBuilder()
            .setTitle('📋 نظام الحضور')
            .setDescription('سجل حضورك وانصرافك باستخدام الأزرار أدناه')
            .setColor(0x00FF00);

        const attendanceButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('check_in')
                    .setLabel('تسجيل حضور')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('check_out')
                    .setLabel('تسجيل انصراف')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('👋')
            );

        // إرسال رسالة الحضور إلى قناة الحضور
        await attendanceChannel.send({
            embeds: [attendanceEmbed],
            components: [attendanceButtons]
        });

        if (shouldReply) {
            await interaction.editReply({
                content: '✅ تم إعداد نظام الحضور بنجاح!',
                ephemeral: true
            });
        }

        // تحديث إعدادات السيرفر
        await GuildSettings.findOneAndUpdate(
            { guildId: guild.id },
            {
                attendanceChannelId: attendanceChannel.id,
                attendanceLogChannelId: logChannel.id,
                attendanceRoleId: selectedRole.id,
                attendanceTagRoleId: attendanceRole.id,
                'features.attendance.enabled': true,
                'features.attendance.channelId': attendanceChannel.id,
                'features.attendance.logChannelId': logChannel.id
            },
            { upsert: true, new: true }
        );

        return true;
    } catch (error) {
        console.error('Error in setupAttendance:', error);
        
        if (shouldReply) {
            // استخدام editReply فقط لأن التفاعل مؤجل بالفعل
            await interaction.editReply({
                content: `❌ حدث خطأ أثناء إعداد نظام الحضور: ${error.message}`,
                ephemeral: true
            });
        }
        
        throw error;
    }
}