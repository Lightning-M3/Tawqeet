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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('إعداد أنظمة السيرفر المختلفة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('all')
                .setDescription('إعداد جميع الأنظمة دفعة واحدة')
                .addRoleOption(option =>
                    option.setName('attendance_role')
                        .setDescription('رتبة الحضور')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('apply_channel')
                        .setDescription('قناة التقديم')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText))
                .addChannelOption(option =>
                    option.setName('apply_logs')
                        .setDescription('قناة سجلات التقديم')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText))
                .addRoleOption(option =>
                    option.setName('staff_role')
                        .setDescription('رتبة الإداريين المسؤولين عن مراجعة الطلبات')
                        .setRequired(true)))
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
                        .setDescription('رتبة الحضور')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        try {
            // التحقق من صلاحيات المستخدم
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({
                    content: 'يجب أن تكون مسؤولاً لاستخدام هذا الأمر.',
                    ephemeral: true
                });
                return;
            }
            
            // إرسال رسالة مؤقتة للإشارة إلى أن الإعداد قيد التقدم
            await interaction.deferReply({ ephemeral: true });
            
            // استدعاء دالة إعداد السيرفر
            switch (subcommand) {
                case 'all':
                    await setupAll(interaction);
                    break;
                case 'tickets':
                    await setupTickets(interaction);
                    break;
                case 'welcome':
                    await setupWelcome(interaction);
                    break;
                case 'apply':
                    await setupApply(interaction);
                    break;
                case 'attendance':
                    await setupAttendance(interaction);
                    break;
            }
            
            // إكمال الرد بعد الانتهاء من الإعداد
            await interaction.editReply({
                content: `✅ تم إعداد ${subcommand === 'all' ? 'جميع الأنظمة' : `نظام ${subcommand}`} بنجاح!`,
                ephemeral: true
            });
            
        } catch (error) {
            console.error(`Error in setup command (${subcommand}):`, error);
            
            // استخدام editReply بدلاً من reply لتجنب الخطأ
            try {
                await interaction.editReply({
                    content: 'حدث خطأ أثناء إعداد النظام.',
                    ephemeral: true
                });
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
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
            await setupTickets(interaction);
            progress += '✅ تم إعداد نظام التذاكر\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام التذاكر\n';
            console.error('Error in setupTickets:', error);
        }

        try {
            await setupWelcome(interaction);
            progress += '✅ تم إعداد نظام الترحيب\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام الترحيب\n';
            console.error('Error in setupWelcome:', error);
        }

        try {
            await setupApply(interaction);
            progress += '✅ تم إعداد نظام التقديم\n';
        } catch (error) {
            progress += '❌ فشل إعداد نظام التقديم\n';
            console.error('Error in setupApply:', error);
        }

        try {
            await setupAttendance(interaction);
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

async function setupTickets(interaction) {
    try {
        // التحقق من صلاحيات البوت
        const botMember = interaction.guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ];

        const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
        if (missingPermissions.length > 0) {
            await interaction.reply({
                content: `❌ البوت يفتقد للصلاحيات التالية: ${missingPermissions.join(", ")}`,
                ephemeral: true
            });
            return;
        }

        // التحقق من وجود القنوات مسبقاً
        const existingCategory = interaction.guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && 
            c.name === '🎫 نظام التذاكر'
        );

        if (existingCategory) {
            await interaction.reply({
                content: '❌ نظام التذاكر موجود بالفعل!',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

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

        await interaction.editReply({
            content: '✅ تم إعداد نظام التذاكر بنجاح!',
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in setupTickets:', error);
        
        const errorMessage = error.code === 50013 
            ? '❌ البوت يفتقد للصلاحيات اللازمة لإعداد نظام التذاكر'
            : '❌ حدث خطأ أثناء إعداد نظام التذاكر. الرجاء المحاولة مرة أخرى.';

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

async function setupWelcome(interaction, shouldReply = true) {
    const guild = interaction.guild;
    
    try {
        // التحقق من الصلاحيات المطلوبة
        const requiredPermissions = ['ManageChannels', 'ViewChannel', 'SendMessages', 'EmbedLinks'];
        const botMember = await guild.members.fetchMe();
        
        const missingPermissions = requiredPermissions.filter(perm => 
            !botMember.permissions.has(perm)
        );

        if (missingPermissions.length > 0) {
            throw new Error(`البوت يفتقد للصلاحيات التالية: ${missingPermissions.join(', ')}`);
        }

        // التحقق من وجود قناة الترحيب
        const existingChannel = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildText && 
            c.name === '👋〡・الترحيب'
        );

        if (existingChannel) {
            if (shouldReply) {
                await interaction.reply({
                    content: 'قناة الترحيب موجودة بالفعل!',
                    ephemeral: true
                });
            }
            return;
        }

        // إنشاء قناة الترحيب
        const welcomeChannel = await guild.channels.create({
            name: '👋〡・الترحيب',
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
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
        });

        // إنشاء رسالة الترحيب
        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`👋 مرحباً بكم في ${guild.name}`)
            .setDescription('نتمنى لكم وقتاً ممتعاً!')
            .setColor(0x2B2D31)
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

        await welcomeChannel.send({
            embeds: [welcomeEmbed]
        });

        if (shouldReply) {
            await interaction.reply({
                content: '✅ تم إعداد نظام الترحيب بنجاح!',
                ephemeral: true
            });
        }

        return true;
    } catch (error) {
        console.error('Error in setupWelcome:', error);
        
        if (shouldReply) {
            await interaction.reply({
                content: `❌ حدث خطأ أثناء إعداد نظام الترحيب: ${error.message}`,
                ephemeral: true
            });
        }
        
        throw error;
    }
}

async function setupApply(interaction, shouldReply = true, options = null) {
    const guild = interaction.guild;
    
    try {
        // التحقق من الصلاحيات المطلوبة
        const requiredPermissions = ['ManageChannels', 'ViewChannel', 'SendMessages', 'EmbedLinks', 'ManageRoles'];
        const botMember = await guild.members.fetchMe();
        
        const missingPermissions = requiredPermissions.filter(perm => 
            !botMember.permissions.has(perm)
        );

        if (missingPermissions.length > 0) {
            throw new Error(`البوت يفتقد للصلاحيات التالية: ${missingPermissions.join(', ')}`);
        }

        // الحصول على القنوات والأدوار المطلوبة
        const applyChannel = options?.applyChannel || interaction.options.getChannel('apply_channel');
        const logsChannel = options?.logsChannel || interaction.options.getChannel('apply_logs');
        const staffRole = options?.staffRole || interaction.options.getRole('staff_role');

        // التحقق من صحة المدخلات
        if (!applyChannel || !logsChannel || !staffRole) {
            throw new Error('بعض المعلومات المطلوبة غير متوفرة');
        }

        if (applyChannel.type !== ChannelType.GuildText || logsChannel.type !== ChannelType.GuildText) {
            throw new Error('يجب أن تكون القنوات المحددة من نوع نصي');
        }

        // التحقق من عدم وجود إعدادات سابقة
        const existingSettings = await ApplySettings.findOne({ guildId: guild.id });
        if (existingSettings) {
            if (shouldReply) {
                await safeReply(
                    interaction,
                    'نظام التقديم موجود بالفعل!',
                    { ephemeral: true }
                );
            }
            return;
        }

        // حفظ الإعدادات في قاعدة البيانات
        const settings = new ApplySettings({
            guildId: guild.id,
            applyChannelId: applyChannel.id,
            logsChannelId: logsChannel.id,
            staffRoleId: staffRole.id,
            channelNames: {
                apply: applyChannel.name,
                logs: logsChannel.name
            }
        });

        await settings.save();

        // إعداد قناة التقديم
        await applyChannel.permissionOverwrites.set([
            {
                id: guild.id,
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
        ]);

        // إعداد قناة السجلات
        await logsChannel.permissionOverwrites.set([
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: staffRole.id,
                allow: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: botMember.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks
                ]
            }
        ]);

        // إنشاء رسالة التقديم
        const applyEmbed = new EmbedBuilder()
            .setTitle('📝 نظام التقديم')
            .setDescription('اضغط على الزر أدناه لتقديم طلبك')
            .setColor(0x2B2D31)
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

        const applyButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('apply_button')
                    .setLabel('تقديم طلب')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝')
            );

        const messageResponse = await applyChannel.send({
            embeds: [applyEmbed],
            components: [applyButton]
        });

        // تحديث إعدادات السيرفر بالمعرفات المحفوظة
        await GuildSettings.updateSettings(guild.id, {
            'features.apply.enabled': true,
            'features.apply.channelId': applyChannel.id,
            'features.apply.logChannelId': logsChannel.id,
            'features.apply.staffRoleId': staffRole.id,
            'features.apply.messageId': messageResponse.id,
            'channels': {
                'apply': { id: applyChannel.id, name: applyChannel.name, type: 'apply' },
                'applyLogs': { id: logsChannel.id, name: logsChannel.name, type: 'log' }
            }
        });

        if (shouldReply) {
            await safeReply(
                interaction,
                '✅ تم إعداد نظام التقديم بنجاح!',
                { ephemeral: true }
            );
        }

        return true;
    } catch (error) {
        console.error('Error in setupApply:', error);
        
        if (shouldReply) {
            await safeReply(
                interaction,
                `❌ حدث خطأ أثناء إعداد نظام التقديم: ${error.message}`,
                { ephemeral: true }
            );
        }
        
        throw error;
    }
}

async function setupAttendance(interaction, shouldReply = true, options = null) {
    const guild = interaction.guild;
    const selectedRole = options?.role || interaction.options.getRole('role');

    try {
        // التحقق من وجود معلومات مطلوبة
        if (!selectedRole) {
            throw new Error('الرجاء تحديد رتبة للحضور');
        }
        
        // إنشاء رتبة "مسجل حضوره"
        let attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (!attendanceRole) {
            attendanceRole = await guild.roles.create({
                name: 'مسجل حضوره',
                color: 0x00FF00,
                reason: 'رتبة تتبع الحضور'
            });
        }
    
        // إنشاء القنوات
        const logChannel = await guild.channels.create({
            name: 'سجل-الحضور',
            type: 0,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: ['ViewChannel']
                },
                {
                    id: selectedRole.id,
                    allow: ['ViewChannel'],
                    deny: ['SendMessages']
                }
            ]
        });
    
        const attendanceChannel = await guild.channels.create({
            name: 'تسجيل-الحضور',
            type: 0,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: ['ViewChannel']
                },
                {
                    id: selectedRole.id,
                    allow: ['ViewChannel'],
                    deny: ['SendMessages']
                }
            ]
        });
    
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
    
        const messageResponse = await attendanceChannel.send({
            embeds: [attendanceEmbed],
            components: [attendanceButtons]
        });
    
        // تحديث إعدادات السيرفر مع معرّفات القنوات والرسائل
        const GuildSettings = require('../models/GuildSettings');
        await GuildSettings.updateSettings(guild.id, {
            attendanceRoleId: attendanceRole.id,
            logsChannelId: logChannel.id,
            welcomeChannelId: attendanceChannel.id,
            'features.attendance.enabled': true,
            'features.attendance.channelId': attendanceChannel.id,
            'features.attendance.logChannelId': logChannel.id,
            'features.attendance.roleId': attendanceRole.id,
            'features.attendance.messageId': messageResponse.id,
            'channels': {
                'attendance': { id: attendanceChannel.id, name: attendanceChannel.name, type: 'attendance' },
                'attendanceLog': { id: logChannel.id, name: logChannel.name, type: 'log' }
            },
            setupComplete: true
        });
    
        if (shouldReply) {
            await safeReply(
                interaction,
                '✅ تم إعداد نظام الحضور بنجاح!',
                { ephemeral: true }
            );
        }
    } catch (error) {
        console.error('Error in setupAttendance:', error);
        if (shouldReply) {
            await safeReply(
                interaction,
                `❌ حدث خطأ أثناء إعداد نظام الحضور: ${error.message}`,
                { ephemeral: true }
            );
        } else {
            throw error;
        }
    }
}

/**
 * تسجيل الرد بشكل آمن تجنباً لخطأ "InteractionAlreadyReplied"
 * @param {Interaction} interaction التفاعل المطلوب الرد عليه
 * @param {Object} content محتوى الرد
 * @param {Object} options خيارات إضافية للرد
 */
async function safeReply(interaction, content, options = {}) {
    try {
        if (!interaction) return;
        
        // إذا كان التفاعل قد تم الرد عليه أو تأجيله بالفعل، نستخدم followUp
        if (interaction.replied) {
            return await interaction.followUp({
                ...options,
                content
            });
        } else if (interaction.deferred) {
            return await interaction.editReply({
                ...options,
                content
            });
        } else {
            // الرد لأول مرة
            return await interaction.reply({
                ...options,
                content
            });
        }
    } catch (error) {
        console.error(`Error in safeReply: ${error.message}`);
    }
}