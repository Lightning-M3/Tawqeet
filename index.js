// ============= استيراد المكتبات الأساسية =============
const { 
    Client, 
    Events, 
    GatewayIntentBits, 
    Collection, 
    PermissionFlagsBits, 
    EmbedBuilder,
    REST,
    Routes,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const NodeCache = require('node-cache');
const moment = require('moment-timezone');
require('dotenv').config();

// ============= دوال مساعدة للتعامل مع التوقيت =============
// تهيئة المنطقة الزمنية لمكة المكرمة
moment.tz.setDefault('Asia/Riyadh');

// دالة للحصول على بداية اليوم بتوقيت مكة
function getStartOfDay() {
    return moment().tz('Asia/Riyadh').startOf('day').toDate();
}

// دالة للحصول على نهاية اليوم بتوقيت مكة
function getEndOfDay() {
    return moment().tz('Asia/Riyadh').endOf('day').toDate();
}

// دالة لتنسيق التوقيت حسب توقيت مكة
function formatTimeInRiyadh(date) {
    return moment(date).tz('Asia/Riyadh').format('hh:mm A');
}

// دالة لتحويل التاريخ إلى توقيت مكة
function convertToRiyadhTime(date) {
    return moment(date).tz('Asia/Riyadh').toDate();
}

// دالة للتحقق مما إذا كان التاريخ في نفس اليوم (بتوقيت مكة)
function isSameDay(date1, date2) {
    const d1 = moment(date1).tz('Asia/Riyadh');
    const d2 = moment(date2).tz('Asia/Riyadh');
    return d1.format('YYYY-MM-DD') === d2.format('YYYY-MM-DD');
}

// ============= استيراد النماذج والأدوات =============
const Ticket = require('./models/Ticket');
const logger = require('./utils/logger');
const maintenance = require('./utils/maintenance');
const Performance = require('./models/Performance');
const PerformanceAnalyzer = require('./utils/performanceAnalyzer');
const Points = require('./models/Points');
const Statistics = require('./models/Statistics');
const Attendance = require('./models/Attendance');
const Leave = require('./models/Leave');
const PointsManager = require('./models/PointsManager');
const StatisticsManager = require('./models/StatisticsManager');
const GuildSettings = require('./models/GuildSettings'); // إضافة GuildSettings
const { setupGuild } = require('./utils/guildSetup'); // استيراد دالة setupGuild

// ============= الدوال المساعدة الأساسية =============

// دالة لإعادة محاولة العمليات على قاعدة البيانات
async function retryOperation(operation, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            logger.warn(`Retry attempt ${i + 1}/${maxRetries}`, { error: error.message });
            
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            
            if (mongoose.connection.readyState !== 1) {
                try {
                    await mongoose.connect(process.env.MONGO_URI);
                } catch (connError) {
                    logger.error('Failed to reconnect:', connError);
                }
            }
        }
    }
}

async function handleCreateTicket(interaction) {
    try {
        // التحقق من حدود التذاكر
        const limits = await checkTicketLimits(interaction.user.id, interaction.guild.id);
        if (!limits.allowed) {
            return await interaction.reply({
                content: `❌ ${limits.reason}`,
                ephemeral: true
            });
        }

        // إنشاء Modal لإدخال محتوى التذكرة
        const modal = new ModalBuilder()
            .setCustomId('ticket_modal')
            .setTitle('إنشاء تذكرة جديدة');

        const contentInput = new TextInputBuilder()
            .setCustomId('ticket_content')
            .setLabel('محتوى التذكرة')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(contentInput);
        modal.addComponents(actionRow);

        // عرض الـ Modal للمستخدم
        await interaction.showModal(modal);
    } catch (error) {
        console.error('خطأ في إنشاء التذكرة:', error);
        await handleInteractionError(interaction, error); // استخدام دالة معالجة الأخطاء
    }
}

// دالة لإنشاء قناة التذكرة
async function createTicketChannel(interaction, ticketContent) {
    const { guild, member } = interaction;
    
    try {
        // الحصول على رقم التذكرة التالي
        const ticketCount = await Ticket.countDocuments({ guildId: guild.id }) + 1;
        const ticketNumber = String(ticketCount).padStart(4, '0');
        const ticketName = `ticket-${ticketNumber}`;
        
        // إنشاء القناة باستخدام أسلوب الإصدار 14 من discord.js
        const ticketChannel = await guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: member.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                },
                {
                    id: guild.client.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        });
        
        // حفظ التذكرة في قاعدة البيانات
        const ticket = new Ticket({
            ticketId: `TICKET-${ticketNumber}`,
            userId: member.id,
            guildId: guild.id,
            channelId: ticketChannel.id,
            status: 'open',
            content: ticketContent,
            createdAt: new Date()
        });
        
        await ticket.save();
        
        // إنشاء أزرار التحكم في التذكرة
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_ticket:${ticketChannel.id}`)
                    .setLabel('إغلاق التذكرة')
                    .setStyle(ButtonStyle.Danger),
            );
            
        // إرسال رسالة ترحيبية في قناة التذكرة
        await ticketChannel.send({
            content: `<@${member.id}> مرحبًا بك في تذكرتك!`,
            embeds: [
                new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`تذكرة #${ticketNumber}`)
                    .setDescription('شكرًا لإنشاء تذكرة. سيقوم فريق الدعم بالرد عليك في أقرب وقت ممكن.')
                    .addFields({ name: 'المحتوى', value: ticketContent || 'لا يوجد محتوى' })
                    .setTimestamp()
            ],
            components: [row]
        });
        
        // تسجيل إنشاء التذكرة
        logger.info(`تم إنشاء تذكرة جديدة بواسطة ${member.user.tag} في السيرفر ${guild.name}`);
        
        return ticketChannel;
    } catch (error) {
        logger.error("Error in OpenTicket:", error);
        throw error;
    }
}

// دالة لتسجيل أحداث التذاكر
async function logTicketAction(guild, embed) {
    try {
        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        logger.error('Error logging ticket action:', error);
    }
}

// ============= إعداد المتغيرات العامة =============
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ]
});

// تحميل الأوامر
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        logger.info(`Command loaded: ${command.data.name}`);
    } else {
        logger.warn(`Command at ${filePath} is missing required data or execute properties`);
    }
}

const rateLimits = new Map();
const commandCooldowns = new Map();
const ticketAttempts = new Map();
const attendanceLocks = new Map();

// ============= استيراد الملفات المحلية =============
const { setupDailyReset, forceCheckOutAll, sendDailyReport } = require('./cronJobs/dailyReset');
const { 
    checkRequiredChannels, 
    checkBotPermissions, 
    handleError 
} = require('./utils/helpers');

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error, true);
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason, true);
});

// ============= الاتصال بقاعدة البيانات =============
mongoose.set('bufferCommands', true);

mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    waitQueueTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000
}).then(() => {
    logger.info('Connected to MongoDB database');
}).catch((err) => {
    logger.error('Error connecting to database:', err, true);
    process.exit(1);
});

// معالجة أحداث قاعدة البيانات
mongoose.connection.on('disconnected', async () => {
    console.log('Database connection lost. Attempting to reconnect...');
    let retries = 5;
    while (retries > 0) {
        try {
            await mongoose.connect(process.env.MONGO_URI);
            console.log('Successfully reconnected to database');
            break;
        } catch (error) {
            console.error(`Reconnection attempt failed. Remaining attempts: ${retries}`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    if (retries === 0) {
        console.error('Failed to reconnect after multiple attempts. Shutting down bot...');
        process.exit(1);
    }
});

mongoose.connection.on('error', async (err) => {
    console.error('Database connection error:', err);
    try {
        await mongoose.connect(process.env.MONGO_URI);
    } catch (error) {
        console.error('Failed to reconnect:', error);
    }
});

// ============= إعداد الأحداث الأساسية =============
client.once(Events.ClientReady, async () => {
    try {
        logger.info('Bot started successfully!', {
            username: client.user.tag,
            guildsCount: client.guilds.cache.size
        });

        // تحديث حالة البوت
        await updateBotPresence(client);

        // إعداد المهام الدورية
        setupDailyReset(client);
        
        // تنظيف الذاكرة المؤقتة كل ساعة
        setInterval(cleanupCache, 3600000);
        
        // تحديث حالة البوت كل 5 دقائق
        setInterval(() => updateBotPresence(client), 300000);

    } catch (error) {
        logger.error('Error in bot initialization:', {
            error: error.message,
            stack: error.stack
        });
    }
});

// معالجة التفاعلات
client.on('interactionCreate', async (interaction) => {
    try {
        // التحقق من نوع التفاعل
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                await interaction.reply({
                    content: '❌ هذا الأمر غير موجود',
                    ephemeral: true
                });
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                logger.error(`خطأ في تنفيذ الأمر ${interaction.commandName}:`, {
                    error: error.message,
                    stack: error.stack,
                    command: interaction.commandName,
                    options: interaction.options?.data
                });

                // التحقق من حالة التفاعل قبل الرد
                const errorMessage = {
                    content: '❌ حدث خطأ أثناء تنفيذ الأمر. الرجاء المحاولة مرة أخرى.',
                    ephemeral: true
                };

                if (interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else if (!interaction.replied) {
                    await interaction.reply(errorMessage);
                }
            }
            return;
        }

        // معالجة التفاعلات الأخرى (الأزرار والنماذج)
        if (interaction.isButton() || interaction.isModalSubmit()) {
            const customId = interaction.customId;
            
            // التحقق من وجود customId
            if (!customId) {
                logger.warn('تفاعل بدون customId', {
                    type: interaction.type,
                    userId: interaction.user.id
                });
                return;
            }

            // معالجة التفاعلات المختلفة
            switch (true) {
                case customId === 'check_in':
                    await handleCheckIn(interaction);
                    break;
                case customId === 'check_out':
                    await handleCheckOut(interaction);
                    break;
                case customId === 'create_ticket':
                    await handleCreateTicket(interaction);
                    break;
                case customId.startsWith('close_ticket'):
                case customId.startsWith('close_ticket_'):
                    await handleCloseTicket(interaction);
                    break;
                case customId.startsWith('delete_ticket'):
                case customId.startsWith('delete_ticket_'):
                    await handleDeleteTicket(interaction);
                    break;
                case customId.startsWith('servers-list'):
                    // معالجة زر عرض قائمة السيرفرات
                    break;
                default:
                    logger.warn('تفاعل غير معروف', {
                        customId,
                        type: interaction.type,
                        userId: interaction.user.id
                    });
                    await interaction.reply({
                        content: '❌ نوع التفاعل غير معروف',
                        ephemeral: true
                    });
            }
        }
    } catch (error) {
        logger.error('خطأ في معالجة التفاعل:', {
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
});

// ============= معالجة الأحداث والتفاعلات =============

// معالجة حدث انضمام البوت لسيرفر جديد
client.on(Events.GuildCreate, async guild => {
    try {
        // التحقق من Rate Limit لإعداد السيرفر
        const setupLimitKey = `guild_setup:${guild.id}`;
        if (!checkRateLimit(guild.id, 'setup', 1, 60000)) {
            logger.warn(`تم تجاهل محاولة إعداد السيرفر ${guild.name} بسبب التكرار السريع`);
            return;
        }

        logger.info(`تم إضافة البوت إلى سيرفر جديد: ${guild.name}`);
        
        // التحقق من وجود إعدادات سابقة
        const existingSettings = await GuildSettings.findOne({ guildId: guild.id });
        if (existingSettings && existingSettings.setupComplete) {
            logger.info(`السيرفر ${guild.name} تم إعداده مسبقاً`);
            return;
        }

        logger.info(`بدء إعداد السيرفر ${guild.name}`);
        await setupGuild(guild); // استخدام دالة setupGuild
        
    } catch (error) {
        logger.error(`خطأ أثناء إعداد السيرفر ${guild.name}:`, error);
        // محاولة إعادة الإعداد مرة واحدة بعد 5 ثواني في حالة الفشل
        setTimeout(async () => {
            try {
                if (checkRateLimit(guild.id, 'setup_retry', 1, 60000)) {
                    logger.info(`محاولة إعادة إعداد السيرفر ${guild.name}`);
                    await setupGuild(guild); // استخدام دالة setupGuild
                }
            } catch (retryError) {
                logger.error(`فشلت محاولة إعادة إعداد السيرفر ${guild.name}:`, retryError);
            }
        }, 5000);
    }
});

// معالجة حدث مغادرة البوت من سيرفر
client.on(Events.GuildDelete, async guild => {
    console.log(`Bot removed from server: ${guild.name}`);
    
    try {
        // إرسال رسالة خاصة لصاحب البوت
        const botOwner = await client.users.fetch('743432232529559684');
        await botOwner.send(`❌ Bot removed from server: ${guild.name}`);

        await retryOperation(async () => {
            const Attendance = require('./models/Attendance');
            await Attendance.deleteMany({ guildId: guild.id });

            const Ticket = require('./models/Ticket');
            await Ticket.deleteMany({ guildId: guild.id });

            console.log(`Successfully deleted all data for server ${guild.name}`);
        }, 5);

    } catch (error) {
        console.error(`Error cleaning up after guild delete for ${guild.name}:`, error);
        
        try {
            const Attendance = require('./models/Attendance');
            await Attendance.deleteMany({ guildId: guild.id })
                .catch(err => console.error('Error deleting attendance records:', err));

            const Ticket = require('./models/Ticket');
            await Ticket.deleteMany({ guildId: guild.id })
                .catch(err => console.error('Error deleting tickets:', err));

        } catch (secondError) {
            console.error('Final error in cleanup:', secondError);
        }
    }
});

// معالجة حدث تحديث السيرفر
const { updateBotPresence } = require('./utils/botPresence.js');
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
    try {
        // تحديث إعدادات السيرفر في قاعدة البيانات
        await retryOperation(async () => {
            const settings = await GuildSettings.findOneAndUpdate(
                { guildId: newGuild.id },
                {
                    $set: {
                        name: newGuild.name,
                        icon: newGuild.icon,
                        memberCount: newGuild.memberCount,
                        updatedAt: new Date()
                    }
                },
                { upsert: true, new: true }
            );
            
            logger.info('تم تحديث إعدادات السيرفر', {
                guildId: newGuild.id,
                guildName: newGuild.name,
                memberCount: newGuild.memberCount
            });
            
            // تحديث حالة البوت لعكس التغييرات
            await updateBotPresence(client);
        });
    } catch (error) {
        logger.error('خطأ في تحديث إعدادات السيرفر:', {
            guildId: newGuild.id,
            error: error.message,
            stack: error.stack
        });
    }
});

// معالجة حدث إضافة عضو جديد
client.on(Events.GuildMemberAdd, async member => {
    try {
        const welcomeChannel = member.guild.channels.cache.find(ch => ch.name === '👋〡・الترحيب');
        if (!welcomeChannel) return;

        // إنشاء رسالة الترحيب
        await welcomeChannel.send({
            embeds: [{
                title: '👋 عضو جديد!',
                description: `مرحباً ${member} في ${member.guild.name}!`,
                fields: [
                    {
                        name: '🎉 أنت العضو رقم',
                        value: `${member.guild.memberCount}`
                    },
                    {
                        name: '📅 تاريخ الانضمام',
                        value: member.joinedAt.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        })
                    }
                ],
                color: 0x00ff00,
                thumbnail: {
                    url: member.user.displayAvatarURL({ dynamic: true })
                },
                timestamp: new Date(),
                footer: {
                    text: `ID: ${member.user.id}`
                }
            }]
        });

    } catch (error) {
        console.error('Error in welcome message:', error);
    }
});

// ============= دوال معالجة التذاكر والحضور =============

// دالة للتحقق من حدود التذاكر
async function checkTicketLimits(userId, guildId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        // التحقق من التذاكر المفتوحة
        const openTicket = await Ticket.findOne({
            userId,
            guildId,
            status: 'open'
        });

        if (openTicket) {
            return {
                allowed: false,
                reason: 'لديك تذكرة مفتوحة بالفعل. يرجى إغلاقها قبل إنشاء تذكرة جديدة.',
                channel: openTicket.channelId
            };
        }

        // التحقق من عدد التذاكر اليومية
        const dailyTickets = await Ticket.countDocuments({
            userId,
            guildId,
            createdAt: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (dailyTickets >= 3) {
            return {
                allowed: false,
                reason: 'لقد وصلت للحد الأقصى من التذاكر اليومية (3 تذاكر). حاول مجدداً غداً.',
                dailyCount: dailyTickets
            };
        }

        return {
            allowed: true,
            dailyCount: dailyTickets
        };
    } catch (error) {
        console.error('Error checking ticket limits:', error);
        return {
            allowed: false,
            reason: 'حدث خطأ أثناء التحقق من حدود التذاكر'
        };
    }
}

// دالة معالجة إنشاء التذكرة
async function handleCreateTicket(interaction) {
    try {
        // التحقق من حدود التذاكر
        const limits = await checkTicketLimits(interaction.user.id, interaction.guild.id);
        if (!limits.allowed) {
            return await interaction.reply({
                content: `❌ ${limits.reason}`,
                ephemeral: true
            });
        }

        // إنشاء Modal لإدخال محتوى التذكرة
        const modal = new ModalBuilder()
            .setCustomId('ticket_modal')
            .setTitle('إنشاء تذكرة جديدة');

        const contentInput = new TextInputBuilder()
            .setCustomId('ticket_content')
            .setLabel('محتوى التذكرة')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(contentInput);
        modal.addComponents(actionRow);

        // عرض الـ Modal للمستخدم
        await interaction.showModal(modal);
    } catch (error) {
        console.error('خطأ في إنشاء التذكرة:', error);
        await handleInteractionError(interaction, error); // استخدام دالة معالجة الأخطاء
    }
}

// دالة معالجة إغلاق التذكرة
async function handleCloseTicket(interaction) {
    try {
        // إرسال رد أولي سريع
        await interaction.reply({ content: '🔄 جاري إغلاق التذكرة...', ephemeral: true });

        // التحقق من الأذونات
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return await interaction.followUp({
                content: '❌ ليس لديك صلاحية إغلاق التذاكر!',
                ephemeral: true 
            });
        }

        const ticketId = interaction.customId.replace('close_ticket_', '');
        const ticket = await Ticket.findOne({ ticketId: `TICKET-${ticketId}` });
        if (ticket) {
            ticket.status = 'closed';
            await ticket.save();

            // إزالة صلاحية رؤية القناة من صاحب التذكرة إذا لم يكن مسؤولاً
            const ticketOwner = await interaction.guild.members.fetch(ticket.userId);
            if (!ticketOwner.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false });
            }

            await interaction.followUp({
                content: 'تم إغلاق التذكرة بنجاح! سيتم إرسال أزرار التحكم لفريق الدعم.',
                ephemeral: true
            });

            // إرسال أزرار التحكم لفريق الدعم
            await interaction.channel.send({
                content: 'أزرار تحكم التذكرة لفريق الدعم:',
                components: [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('delete_ticket')
                                .setLabel('حذف قناة التذكرة')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('reopen_ticket')
                                .setLabel('إعادة فتح التذكرة')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('download_ticket_content')
                                .setLabel('تنزيل محتوى التذكرة')
                                .setStyle(ButtonStyle.Secondary)
                        )
                ]
            });

            // تسجيل في قناة السجلات
            const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
            if (logChannel) {
                await logChannel.send({
                    embeds: [{
                        title: '🔒 تم إغلاق تذكرة',
                        description: `تم إغلاق التذكرة بواسطة ${interaction.user}`,
                        fields: [
                            { name: 'رقم التذكرة', value: ticketId },
                            { name: 'القناة', value: interaction.channel.name },
                            { name: 'التاريخ والوقت', value: new Date().toLocaleString('en-GB') }
                        ],
                        color: 0xff0000,
                        timestamp: new Date()
                    }]
                });
            }
        }
    } catch (error) {
        console.error('خطأ في handleCloseTicket:', error);
        await interaction.followUp({
            content: '❌ حدث خطأ أثناء إغلاق التذكرة. يرجى المحاولة لاحقًا.',
            ephemeral: true
        });
    }
}

// دالة مساعدة لحساب مدة التذكرة
function getTicketDuration(createdAt) {
    const duration = new Date() - createdAt;
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    let durationText = '';
    if (days > 0) durationText += `${days} يوم `;
    if (hours > 0) durationText += `${hours} ساعة `;
    if (minutes > 0) durationText += `${minutes} دقيقة`;

    return durationText || 'أقل من دقيقة';
}

// ============= دوال معالجة الحضور والانصراف =============

// دالة معالجة تسجيل الحضور
async function handleCheckIn(interaction) {
    const userId = interaction.user.id;

    try {
        console.log('Starting check-in process for user:', userId);

        // تحقق من القفل
        if (attendanceLocks.get(userId)) {
            return await interaction.reply({
                content: 'جاري معالجة طلب سابق، الرجاء الانتظار...',
                ephemeral: true
            });
        }

        // وضع قفل للمستخدم
        attendanceLocks.set(userId, true);
        
        // إرسال رد فوري للمستخدم
        await interaction.reply({
            content: '🔄 جاري تسجيل الحضور...',
            ephemeral: true
        });

        // استخدام الدالة الجديدة للتحقق من السجلات
        const { attendanceRecord, leaveRecord } = await checkAttendanceAndLeave(userId, interaction.guild.id);

        if (!attendanceRecord) {
            const record = new Attendance({
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                date: getStartOfDay(),
                sessions: []
            });

            // إضافة جلسة جديدة
            record.sessions.push({
                checkIn: convertToRiyadhTime(new Date()),
                duration: 0
            });

            await record.save().catch(err => {
                logger.error('Error saving attendance record:', err);
                throw new Error('فشل في حفظ سجل الحضور');
            });
        } else {
            // التحقق من عدم وجود جلسة مفتوحة
            const hasOpenSession = attendanceRecord.sessions.some(session => !session.checkOut);
            if (hasOpenSession) {
                return await interaction.followUp({
                    content: '❌ لديك جلسة حضور مفتوحة بالفعل',
                    ephemeral: true
                });
            }

            // إضافة جلسة جديدة
            attendanceRecord.sessions.push({
                checkIn: convertToRiyadhTime(new Date()),
                duration: 0
            });

            await attendanceRecord.save().catch(err => {
                logger.error('Error saving attendance record:', err);
                throw new Error('فشل في حفظ سجل الحضور');
            });
        }

        // إضافة رتبة الحضور
        const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (attendanceRole) {
            await interaction.member.roles.add(attendanceRole);
        }

        // تسجيل في قناة السجلات
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (logChannel) {
            await logChannel.send({
                embeds: [{
                    title: '✅ تسجيل حضور',
                    description: `${interaction.user} سجل حضوره`,
                    fields: [{
                        name: 'وقت الحضور',
                        value: formatTimeInRiyadh(new Date())
                    }],
                    color: 0x00ff00,
                    timestamp: new Date()
                }]
            });
        }

        // إضافة نقاط الحضور
        if (PointsManager && PointsManager.POINTS_CONFIG && PointsManager.POINTS_CONFIG.ATTENDANCE) {
            const pointsResult = await PointsManager.addPoints(
                interaction.user.id,
                interaction.guild.id,
                PointsManager.POINTS_CONFIG.ATTENDANCE.CHECK_IN,
                'تسجيل حضور'
            );

            // تحديث الرد ليشمل النقاط
            let replyContent = '✅ تم تسجيل حضورك بنجاح';
            if (pointsResult.leveledUp) {
                replyContent += `\n🎉 مبروك! لقد وصلت للمستوى ${pointsResult.level}`;
            };

            await interaction.followUp({
                content: replyContent,
                ephemeral: true
            });
        } else {
            throw new Error('نظام النقاط غير معرف بشكل صحيح.');
        }

    } catch (error) {
        logger.error('Error in check-in:', error);
        await interaction.followUp({
            content: '❌ حدث خطأ أثناء تسجيل الحضور',
            ephemeral: true
        });
    } finally {
        // إزالة القفل بعد الانتهاء
        attendanceLocks.delete(userId);
    }
}

// دالة لحساب وتنسيق مدة الجلسة
function formatSessionDuration(checkIn, checkOut) {
    const duration = checkOut - checkIn; // بالمللي ثانية
    const totalSeconds = Math.round(duration / 1000);
    
    // إذا كانت المدة أقل من دقيقة
    if (totalSeconds < 60) {
        if (totalSeconds < 5) {
            return "أقل من 5 ثوانٍ";
        } else if (totalSeconds >= 55) {
            return "دقيقة تقريباً";
        } else {
            return `${totalSeconds} ثانية`;
        }
    }

    // تحويل إلى دقائق مع التقريب
    let minutes = Math.floor(totalSeconds / 60);
    
    // تنسيق النص
    return `${minutes} ${minutes === 1 ? 'دقيقة' : 'دقائق'}`;
}

// تحديث دالة تسجيل الانصراف
async function handleCheckOut(interaction) {
    try {
        // إرسال رد فوري للمستخدم
        await interaction.reply({
            content: '🔄 جاري تسجيل الانصراف...',
            ephemeral: true
        });

        const { attendanceRecord } = await checkAttendanceAndLeave(interaction.user.id, interaction.guild.id);

        if (!attendanceRecord || !attendanceRecord.sessions.length) {
            return await interaction.followUp({
                content: '❌ لم يتم العثور على جلسة حضور مفتوحة',
                ephemeral: true
            });
        }

        const lastSession = attendanceRecord.sessions[attendanceRecord.sessions.length - 1];
        if (lastSession.checkOut) {
            return await interaction.followUp({
                content: '❌ ليس لديك جلسة حضور مفتوحة',
                ephemeral: true
            });
        }

        // تحديث وقت الانصراف بتوقيت مكة
        lastSession.checkOut = convertToRiyadhTime(new Date());
        const duration = formatSessionDuration(lastSession.checkIn, lastSession.checkOut);
        lastSession.duration = Math.round((lastSession.checkOut - lastSession.checkIn) / 1000 / 60);

        await attendanceRecord.save();

        // تحديث تحليل الأداء
        await PerformanceAnalyzer.updateUserPerformance(
            interaction.user.id,
            interaction.guild.id
        );

        const attendanceRole = interaction.guild.roles.cache.find(role => role.name === 'مسجل حضوره');
        if (attendanceRole) {
            await interaction.member.roles.remove(attendanceRole);
        }

        // تسجيل في قناة السجلات
        const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (logChannel) {
            const checkInTime = formatTimeInRiyadh(lastSession.checkIn);
            const checkOutTime = formatTimeInRiyadh(lastSession.checkOut);

            await logChannel.send({
                embeds: [{
                    title: '⏹️ تسجيل انصراف',
                    description: `${interaction.user} سجل انصرافه`,
                    fields: [
                        {
                            name: 'وقت الحضور',
                            value: checkInTime,
                            inline: true
                        },
                        {
                            name: 'وقت الانصراف',
                            value: checkOutTime,
                            inline: true
                        },
                        {
                            name: 'المدة',
                            value: duration,
                            inline: true
                        }
                    ],
                    color: 0xff0000,
                    timestamp: new Date()
                }]
            });
        }

        await interaction.followUp({
            embeds: [{
                title: '✅ تم تسجيل انصرافك',
                description: `مدة الجلسة: ${duration}`,
                color: 0x00ff00,
                timestamp: new Date()
            }],
            ephemeral: true
        });

    } catch (error) {
        logger.error('Error in check-out:', error);
        await interaction.followUp({
            content: '❌ حدث خطأ أثناء تسجيل الانصراف',
            ephemeral: true
        });
    }
}

// تحديث دالة حساب مدة الجلسة
function formatSessionDuration(checkIn, checkOut) {
    const duration = moment(checkOut).diff(moment(checkIn));
    const minutes = Math.floor(duration / 1000 / 60);
    
    if (minutes < 1) {
        return "أقل من دقيقة";
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    let durationText = [];
    
    if (hours > 0) {
        durationText.push(formatArabicTime(hours, 'ساعة', 'ساعتان', 'ساعات'));
    }
    
    if (remainingMinutes > 0) {
        if (durationText.length > 0) durationText.push('و');
        durationText.push(formatArabicTime(remainingMinutes, 'دقيقة', 'دقيقتان', 'دقائق'));
    }
    
    return durationText.join(' ');
}

// =============== الدوال المساعدة ==================
// دالة لتقسيم الرسالة إلى أجزاء
function splitMessage(message, limit = 1024) {
    const parts = [];
    let currentPart = '';

    message.split('\n').forEach(line => {
        if (currentPart.length + line.length + 1 <= limit) {
            currentPart += (currentPart.length ? '\n' : '') + line;
        } else {
            parts.push(currentPart);
            currentPart = line;
        }
    });

    if (currentPart) {
        parts.push(currentPart); // إضافة الجزء الأخير
    }

    return parts;
}

// دالة لمعالجة الأخطاء في التفاعلات
async function handleInteractionError(interaction, error, context = {}) {
    try {
        const errorMessage = {
            content: '❌ عذراً، حدث خطأ أثناء معالجة طلبك. الرجاء المحاولة مرة أخرى لاحقاً.',
            ephemeral: true
        };

        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else if (interaction.replied) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }

        enhancedLogger('error', 'Interaction Error', {
            error: error.message,
            stack: error.stack,
            interactionType: interaction.type,
            customId: interaction.customId,
            userId: interaction.user?.id,
            guildId: interaction.guild?.id,
            context
        });

        try {
            const logChannel = interaction.guild?.channels.cache.find(c => c.name === 'سجل-الأخطاء');
            if (logChannel) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('🚨 تقرير خطأ')
                    .setDescription(`حدث خطأ أثناء معالجة طلب من ${interaction.user}`)
                    .addFields([
                        { name: 'نوع التفاعل', value: interaction.type.toString(), inline: true },
                        { name: 'معرف التفاعل', value: interaction.customId || 'غير متوفر', inline: true },
                        { name: 'رسالة الخطأ', value: error.message || 'خطأ غير معروف', inline: false }
                    ])
                    .setColor(0xff0000)
                    .setTimestamp();

                await logChannel.send({ embeds: [errorEmbed] });
            }
        } catch (logError) {
            enhancedLogger('error', 'Failed to log error to channel', { error: logError.message });
        }
    } catch (secondaryError) {
        enhancedLogger('error', 'Error handling original error', { 
            originalError: error.message,
            secondaryError: secondaryError.message 
        });
    }
}

// دالة لتنظيف الذاكرة المؤقتة
function cleanupCache() {
    const now = Date.now();
    
    // تنظيف Rate Limits
    rateLimits.forEach((timestamps, key) => {
        const validTimestamps = timestamps.filter(timestamp => now - timestamp < 60000);
        if (validTimestamps.length === 0) {
            rateLimits.delete(key);
        } else {
            rateLimits.set(key, validTimestamps);
        }
    });

    // تنظيف Cooldowns
    commandCooldowns.forEach((timestamp, key) => {
        if (now - timestamp > 3600000) {
            commandCooldowns.delete(key);
        }
    });

    // تنظيف محاولات التذاكر
    ticketAttempts.forEach((attempts, key) => {
        if (now - attempts.timestamp > 3600000) {
            ticketAttempts.delete(key);
        }
    });
}

// تشغيل تنظيف الذاكرة المؤقتة كل ساعة
setInterval(cleanupCache, 3600000);

// ============= تسجيل الدخول للبوت =============

// دالة لتحديث حالة البوت
async function updateBotStatus() {
    try {
        client.user.setPresence({
            activities: [{ 
                name: 'نظام الحضور',
                type: 3 // WATCHING
            }],
            status: 'online'
        });
    } catch (error) {
        console.error('Error updating bot status:', error);
    }
}

// دالة لإعداد البوت عند بدء التشغيل
async function setupBot() {
    try {
        await updateBotStatus();
        setupDailyReset(client);
        setInterval(cleanupCache, 3600000);
        setInterval(async () => {
            if (!client.isReady()) {
                console.log('Bot disconnected. Attempting to reconnect...');
                try {
                    await client.login(process.env.DISCORD_TOKEN);
                } catch (error) {
                    console.error('Failed to reconnect:', error);
                }
            }
        }, 300000);

        console.log('Bot setup completed successfully');
    } catch (error) {
        console.error('Error in bot setup:', error);
        process.exit(1);
    }
}

// تسجيل الدخول للبوت مع إعادة المحاولة
async function loginWithRetry(maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await client.login(process.env.TOKEN);
            console.log('Successfully logged in');
            await setupBot();
            return;
        } catch (error) {
            console.error(`Login attempt failed (${i + 1}/${maxRetries}):`, error);
            if (i === maxRetries - 1) {
                console.error('Failed to login after multiple attempts');
                process.exit(1);
            }
            await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1)));
        }
    }
}

// بدء تشغيل البوت
loginWithRetry().catch(error => {
    console.error('Error starting bot:', error);
    process.exit(1);
});

// ============= نظام Rate Limits المتقدم =============
const rateLimitQueue = new Map();

// دالة للتعامل مع Rate Limits
async function handleRateLimit(operation, key, timeout) {
    if (rateLimitQueue.has(key)) {
        const queue = rateLimitQueue.get(key);
        return new Promise((resolve) => queue.push(resolve));
    }
    
    const queue = [];
    rateLimitQueue.set(key, queue);
    
    setTimeout(() => {
        const currentQueue = rateLimitQueue.get(key);
        rateLimitQueue.delete(key);
        currentQueue.forEach(resolve => resolve());
    }, timeout);
}

// دالة للتحقق من Rate Limit
async function checkDiscordRateLimit(operation, key, options = {}) {
    const {
        maxAttempts = 3,
        timeout = 5000,
        increaseFactor = 2
    } = options;

    let attempt = 0;
    let currentTimeout = timeout;

    while (attempt < maxAttempts) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            
            if (error.code === 429) {
                const retryAfter = error.response?.data?.retry_after || currentTimeout / 1000;
                console.log(`Rate limit hit for ${key}. Retrying after ${retryAfter} seconds...`);
                
                await handleRateLimit(operation, key, retryAfter * 1000);
                currentTimeout *= increaseFactor;
                
                continue;
            }
            
            throw error;
        }
    }

    throw new Error(`Exceeded maximum retry attempts (${maxAttempts}) for ${key}`);
}

// تطبيق النظام على العمليات المهمة
async function sendDiscordMessage(channel, content) {
    return await checkDiscordRateLimit(
        async () => await channel.send(content),
        `send_message_${channel.id}`,
        { timeout: 2000 }
    );
}

async function createDiscordChannel(guild, options) {
    return await checkDiscordRateLimit(
        async () => await guild.channels.create(options),
        `create_channel_${guild.id}`,
        { timeout: 5000 }
    );
}

// ============= تحسينات الأمان =============

// حماية من التكرار المفرط للطلبات
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // حد أقصى 100 طلب
    message: 'تم تجاوز الحد المسموح من الطلبات. الرجاء المحاولة لاحقاً.',
    standardHeaders: true,
    legacyHeaders: false
});

// حماية من هجمات التخمين
const bruteForce = new Map();
function checkBruteForce(userId, action, maxAttempts = 5) {
    const key = `${userId}-${action}`;
    const attempts = bruteForce.get(key) || 0;
    
    if (attempts >= maxAttempts) {
        return false; // تجاوز الحد
    }
    
    bruteForce.set(key, attempts + 1);
    setTimeout(() => bruteForce.delete(key), 3600000); // إعادة تعيين بعد ساعة
    
    return true;
}

// حماية من محاولات الاختراق
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
        .replace(/[<>]/g, '') // منع HTML
        .replace(/javascript:/gi, '') // منع JavaScript
        .trim();
}

// ============= تحسينات المراقبة =============

// إعداد نظام المراقبة
const metrics = {
    commands: {
        total: 0,
        success: 0,
        failed: 0,
        types: {}
    },
    tickets: {
        created: 0,
        closed: 0,
        total: 0
    },
    attendance: {
        checkIns: 0,
        checkOuts: 0,
        totalSessions: 0
    },
    errors: {
        count: 0,
        types: {}
    },
    performance: {
        avgResponseTime: 0,
        totalRequests: 0
    }
};

// دالة لتسجيل الإحصائيات
function trackMetric(category, action, value = 1, extra = {}) {
    if (!metrics[category]) metrics[category] = {};
    
    if (typeof metrics[category][action] === 'number') {
        metrics[category][action] += value;
    } else {
        metrics[category][action] = value;
    }

    // تسجيل معلومات إضافية
    if (Object.keys(extra).length > 0) {
        if (!metrics[category].details) metrics[category].details = [];
        metrics[category].details.push({
            timestamp: new Date(),
            ...extra
        });
    }
}

// دالة لقياس زمن الاستجابة
async function measureResponseTime(operation) {
    const start = process.hrtime();
    try {
        return await operation();
    } finally {
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = seconds * 1000 + nanoseconds / 1e6; // تحويل إلى ميلي ثانية
        
        metrics.performance.totalRequests++;
        metrics.performance.avgResponseTime = 
            (metrics.performance.avgResponseTime * (metrics.performance.totalRequests - 1) + duration) 
            / metrics.performance.totalRequests;
    }
}

// إرسال تقرير دوري
setInterval(async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الإحصائيات');
        if (!logChannel) return;

        const statsEmbed = new EmbedBuilder()
            .setTitle('📊 تقرير الإحصائيات')
            .setColor(0x00ff00)
            .addFields([
                {
                    name: '🤖 الأوامر',
                    value: `إجمالي: ${metrics.commands.total}\nناجح: ${metrics.commands.success}\nفشل: ${metrics.commands.failed}`
                },
                {
                    name: '🎫 التذاكر',
                    value: `مفتوحة: ${metrics.tickets.created - metrics.tickets.closed}\nمغلقة: ${metrics.tickets.closed}\nإجمالي: ${metrics.tickets.total}`
                },
                {
                    name: '⏰ الحضور',
                    value: `تسجيل حضور: ${metrics.attendance.checkIns}\nتسجيل انصراف: ${metrics.attendance.checkOuts}\nإجمالي الجلسات: ${metrics.attendance.totalSessions}`
                },
                {
                    name: '⚡ الأداء',
                    value: `متوسط زمن الاستجابة: ${metrics.performance.avgResponseTime.toFixed(2)}ms\nإجمالي الطلبات: ${metrics.performance.totalRequests}`
                }
            ])
            .setTimestamp();

        await logChannel.send({ embeds: [statsEmbed] });

        // إعادة تعيين بعض الإحصائيات
        metrics.commands.total = 0;
        metrics.commands.success = 0;
        metrics.commands.failed = 0;
        metrics.errors.count = 0;
        metrics.performance.avgResponseTime = 0;
        metrics.performance.totalRequests = 0;

    } catch (error) {
        console.error('Error sending stats report:', error);
    }
}, 86400000); // كل 24 ساعة

// دالة للتحقق من Rate Limit
function checkRateLimit(userId, action, limit = 5, windowMs = 60000) {
    const key = `${userId}-${action}`;
    const now = Date.now();
    const userLimits = rateLimits.get(key) || [];
    
    // إزالة الطلبات القديمة
    const validRequests = userLimits.filter(timestamp => now - timestamp < windowMs);
    
    if (validRequests.length >= limit) {
        return false; // تجاوز الحد
    }
    
    // إضافة الطلب الجديد
    validRequests.push(now);
    rateLimits.set(key, validRequests);
    
    // تنظيف تلقائي بعد انتهاء النافذة الزمنية
    setTimeout(() => {
        const currentLimits = rateLimits.get(key) || [];
        const updatedLimits = currentLimits.filter(timestamp => now - timestamp < windowMs);
        if (updatedLimits.length === 0) {
            rateLimits.delete(key);
        } else {
            rateLimits.set(key, updatedLimits);
        }
    }, windowMs);

    return true;
}

// تنظيف دوري للـ Rate Limits
setInterval(() => {
    const now = Date.now();
    rateLimits.forEach((timestamps, key) => {
        const validTimestamps = timestamps.filter(timestamp => now - timestamp < 60000);
        if (validTimestamps.length === 0) {
            rateLimits.delete(key);
        } else {
            rateLimits.set(key, validTimestamps);
        }
    });
}, 300000); // كل 5 دقائق

// دالة لتحديث الأوامر
async function deployCommands(client) {
    try {
        console.log(`Starting command update...`);

        // استيراد أدوات الأوامر بطريقة آمنة
        let commands = [];
        try {
            const commandUtilsPath = path.join(__dirname, 'utils', 'commandUtils.js');
            const { loadCommands } = require(commandUtilsPath);
            
            if (typeof loadCommands === 'function') {
                commands = await loadCommands();
                console.log(`Updated ${commands.length} commands using the command utility.`);
            } else {
                throw new Error('Command loading function is not defined correctly');
            }
        } catch (loadError) {
            console.error('Error loading command utility:', loadError);
            
            // Use an alternate method to load commands
            console.log('Using alternate method to load commands...');
            const commandsPath = path.join(__dirname, 'commands');
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try {
                    const command = require(filePath);
                    if ('data' in command && 'execute' in command) {
                        commands.push(command.data.toJSON());
                    } else {
                        console.warn(`The command in ${filePath} is missing required properties 'data' and 'execute'`);
                    }
                } catch (error) {
                    console.error(`Failed to load command from ${filePath}:`, error);
                }
            }
            console.log(`Updated ${commands.length} commands using the alternate method.`);
        }

        if (commands.length === 0) {
            console.error('No commands to update.');
            return;
        }

        const rest = new REST().setToken(client.token);
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );

        console.log(`✅ Updated ${data.length} commands successfully.`);
    } catch (error) {
        console.error('Error updating commands:', error);
    }
}

// تأكد من أن البوت جاهز قبل تحديث الأوامر
client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);
        // تأخير تحديث الأوامر لضمان اكتمال تهيئة البوت
        setTimeout(async () => {
            await deployCommands(client);
        }, 1000);
    } catch (error) {
        console.error('Error in ready event:', error);
    }
});

client.on(Events.GuildCreate, async (guild) => {
    try {
        // التحقق من Rate Limit لإعداد السيرفر
        const setupLimitKey = `guild_setup:${guild.id}`;
        if (!checkRateLimit(guild.id, 'setup', 1, 60000)) {
            logger.warn(`Setup was ignored for ${guild.name} because of rate limit`);
            return;
        }

        logger.info(`Bot added to new server: ${guild.name}`);
        
        // التحقق من وجود إعدادات سابقة
        const existingSettings = await GuildSettings.findOne({ guildId: guild.id });
        if (existingSettings && existingSettings.setupComplete) {
            logger.info(`${guild.name} has already been set up`);
            return;
        }

        logger.info(`Starting setup for ${guild.name}`);
        await setupGuild(guild); // استخدام دالة setupGuild
        
    } catch (error) {
        logger.error(`Error setting up guild ${guild.name}:`, error);
        // محاولة إعادة الإعداد مرة واحدة بعد 5 ثواني في حالة الفشل
        setTimeout(async () => {
            try {
                if (checkRateLimit(guild.id, 'setup_retry', 1, 60000)) {
                    logger.info(`Retrying setup for ${guild.name}`);
                    await setupGuild(guild); // استخدام دالة setupGuild
                }
            } catch (retryError) {
                logger.error(`Failed to retry setup for ${guild.name}:`, retryError);
            }
        }, 5000);
    }
});

// محاولة إعادة الإعداد بعد 5 ثواني في حالة الفشل
client.on(Events.GuildCreate, guild => {
    setTimeout(async () => {
        try {
            const guildConfig = await GuildSettings.findOne({ guildId: guild.id });
            if (!guildConfig || !guildConfig.setupComplete) {
                logger.info(`محاولة إعادة إعداد السيرفر ${guild.name}`);
                await setupGuild(guild); // استخدام دالة setupGuild
            }
        } catch (error) {
            logger.error(`فشل في إعادة إعداد السيرفر ${guild.name}:`, error);
        }
    }, 5000);
});

// دالة فحص الغياب وإنشاء التقرير
async function generateAbsenteeReport(guild) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // الحصول على إعدادات نظام الحضور
        const attendanceSettings = await AttendanceSettings.findOne({ guildId: guild.id });
        if (!attendanceSettings || !attendanceSettings.viewRoleId) return null; // استخدام viewRoleId بدلاً من roleId

        // الحصول على الرتبة المحددة للمشاهدة
        const viewRole = await guild.roles.fetch(attendanceSettings.viewRoleId);
        if (!viewRole) return null;

        // الحصول على الأعضاء الذين لديهم رتبة المشاهدة (مع استبعاد البوتات)
        const membersWithViewRole = viewRole.members.filter(member => !member.user.bot);
        const totalMembersRequired = membersWithViewRole.size;

        // الحصول على سجلات الحضور لليوم
        const attendanceRecords = await Attendance.find({
            guildId: guild.id,
            userId: { $in: [...membersWithViewRole.keys()] }, // فقط للأعضاء الذين لديهم رتبة المشاهدة
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // الحصول على الإجازات النشطة
        const activeLeaves = await Leave.find({
            guildId: guild.id,
            adminId: { $in: [...membersWithViewRole.keys()] },
            startDate: { $lte: today },
            endDate: { $gte: today },
            status: 'approved'
        });

        const absentees = [];
        const presentCount = attendanceRecords.length;
        const onLeaveCount = activeLeaves.length;

        // فحص كل عضو لديه رتبة المشاهدة
        for (const [memberId, member] of membersWithViewRole) {
            const hasAttended = attendanceRecords.some(record => record.userId === memberId);
            const isOnLeave = activeLeaves.some(leave => leave.adminId === memberId);

            if (!hasAttended && !isOnLeave) {
                const consecutiveAbsenceDays = await calculateConsecutiveAbsence(memberId, guild.id);
                absentees.push({
                    member,
                    consecutiveDays: consecutiveAbsenceDays
                });
            }
        }

        // إنشاء Embed للتقرير
        const embed = new EmbedBuilder()
            .setTitle('📊 تقرير الحضور والغياب اليومي')
            .setColor(0xFF0000)
            .addFields(
                {
                    name: '📈 إحصائيات اليوم',
                    value: [
                        `👥 إجمالي الأعضاء المطلوب حضورهم: ${totalMembersRequired}`,
                        `✅ الحاضرون: ${presentCount}`,
                        `🏖️ في إجازة: ${onLeaveCount}`,
                        `❌ الغائبون: ${absentees.length}`,
                        onLeaveCount < totalMembersRequired ? 
                            `📊 نسبة الحضور: ${Math.round((presentCount / (totalMembersRequired - onLeaveCount)) * 100)}%` :
                            `📊 نسبة الحضور: 100% (الجميع في إجازة)`
                    ].join('\n'),
                    inline: false
                }
            )
            .setTimestamp();

        // إضافة قائمة الغائبين
        if (absentees.length > 0) {
            const absenteesList = absentees
                .sort((a, b) => b.consecutiveDays - a.consecutiveDays)
                .map(({ member, consecutiveDays }) => 
                    `${member} - غائب منذ ${consecutiveDays} ${consecutiveDays === 1 ? 'يوم' : 'أيام'}`
                )
                .join('\n');

            // تقسيم القائمة إذا كانت طويلة
            const chunks = splitIntoChunks(absenteesList, 1024);
            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: index === 0 ? '📝 قائمة الغائبين' : '... تابع قائمة الغائبين',
                    value: chunk,
                    inline: false
                });
            });
        } else {
            embed.addFields({
                name: '✨ ملاحظة',
                value: onLeaveCount === totalMembersRequired ? 
                    'جميع الأعضاء في إجازة اليوم!' :
                    'لا يوجد غائبون اليوم!',
                inline: false
            });
        }

        // إضافة معلومات الرتبة
        embed.setFooter({ 
            text: `رتبة نظام الحضور: ${viewRole.name}`,
            iconURL: guild.iconURL()
        });

        return embed;
    } catch (error) {
        console.error('Error generating absentee report:', error);
        return null;
    }
}

// دالة مساعدة لحساب أيام الغياب المتتالية
async function calculateConsecutiveAbsence(userId, guildId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let consecutiveDays = 1;
    let currentDate = new Date(today);

    while (true) {
        currentDate.setDate(currentDate.getDate() - 1);
        
        // التحقق من وجود سجل حضور
        const hasAttendance = await Attendance.findOne({
            userId,
            guildId,
            date: {
                $gte: currentDate,
                $lt: new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // التحقق من وجود إجازة
        const hasLeave = await Leave.findOne({
            adminId: userId,
            guildId,
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate },
            status: 'approved'
        });

        if (hasAttendance || hasLeave) break;
        consecutiveDays++;

        // حد أقصى للبحث (مثلاً 30 يوم)
        if (consecutiveDays > 30) break;
    }

    return consecutiveDays;
}

// دالة مساعدة لتقسيم النص الطويل
function splitIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';

    text.split('\n').forEach(line => {
        if (currentChunk.length + line.length + 1 <= maxLength) {
            currentChunk += (currentChunk.length ? '\n' : '') + line;
        } else {
            chunks.push(currentChunk);
            currentChunk = line;
        }
    });

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

// تحديث دالة السجل اليومي
async function generateDailyAttendanceLog(guild) {
    try {
        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (!logChannel) return;

        const startOfDay = getStartOfDay();
        const endOfDay = getEndOfDay();

        const records = await Attendance.find({
            guildId: guild.id,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        });

        if (records.length === 0) {
            await logChannel.send({
                embeds: [{
                    title: '📊 التقرير اليومي للحضور',
                    description: `لا توجد سجلات حضور ليوم ${moment(startOfDay).format('DD/MM/YYYY')}`,
                    color: 0xffff00,
                    timestamp: new Date()
                }]
            });
            return;
        }

        let reportText = '';
        let totalMinutes = 0;
        let earliestCheckIn = null;
        let latestCheckOut = null;
        let totalSessions = 0;
        const userStats = new Map();

        // تجميع إحصائيات كل مستخدم
        for (const record of records) {
            const member = await guild.members.fetch(record.userId).catch(() => null);
            if (!member) continue;

            let userTotal = 0;
            let userSessions = 0;
            let userEarliestCheckIn = null;
            let userLatestCheckOut = null;

            for (const session of record.sessions) {
                if (session.checkIn && session.checkOut) {
                    const duration = Math.floor((session.checkOut - session.checkIn) / 1000 / 60);
                    userTotal += duration;
                    userSessions++;
                    totalSessions++;

                    const checkInTime = convertToRiyadhTime(session.checkIn);
                    const checkOutTime = convertToRiyadhTime(session.checkOut);

                    if (!userEarliestCheckIn || checkInTime < userEarliestCheckIn) {
                        userEarliestCheckIn = checkInTime;
                    }
                    if (!userLatestCheckOut || checkOutTime > userLatestCheckOut) {
                        userLatestCheckOut = checkOutTime;
                    }
                    if (!earliestCheckIn || checkInTime < earliestCheckIn) {
                        earliestCheckIn = checkInTime;
                    }
                    if (!latestCheckOut || checkOutTime > latestCheckOut) {
                        latestCheckOut = checkOutTime;
                    }
                }
            }

            totalMinutes += userTotal;
            userStats.set(member.id, {
                username: member.user.username,
                totalMinutes: userTotal,
                sessions: userSessions,
                earliestCheckIn: userEarliestCheckIn,
                latestCheckOut: userLatestCheckOut
            });
        }

        // تنسيق التقرير
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;

        // ترتيب المستخدمين حسب الوقت الإجمالي
        const sortedUsers = Array.from(userStats.entries())
            .sort(([, a], [, b]) => b.totalMinutes - a.totalMinutes);

        reportText = sortedUsers.map(([, stats], index) => {
            const hours = Math.floor(stats.totalMinutes / 60);
            const minutes = stats.totalMinutes % 60;
            return `**${index + 1}.** ${stats.username}\n` +
                `⏰ المدة: ${hours}:${minutes.toString().padStart(2, '0')} ساعة\n` +
                `📊 عدد الجلسات: ${stats.sessions}\n` +
                `🕐 أول حضور: ${stats.earliestCheckIn ? formatTimeInRiyadh(stats.earliestCheckIn) : 'غير متوفر'}\n` +
                `🕐 آخر انصراف: ${stats.latestCheckOut ? formatTimeInRiyadh(stats.latestCheckOut) : 'غير متوفر'}\n`;
        }).join('\n');

        // تقسيم الرسالة إلى أجزاء إذا تجاوزت 1024 حرف
        const reportParts = splitMessage(reportText);
        
        // إرسال الرسالة
        await logChannel.send({
            embeds: [{
                title: '📊 التقرير اليومي للحضور',
                description: `تقرير يوم ${moment(startOfDay).format('DD/MM/YYYY')}`,
                fields: [
                    {
                        name: '📈 إحصائيات عامة',
                        value: 
                            `👥 إجمالي الحضور: ${records.length} عضو\n` +
                            `⏱️ إجمالي وقت العمل: ${totalHours}:${remainingMinutes.toString().padStart(2, '0')} ساعة\n` +
                            `🔄 إجمالي الجلسات: ${totalSessions}\n` +
                            `⏰ أول حضور: ${earliestCheckIn ? formatTimeInRiyadh(earliestCheckIn) : 'غير متوفر'}\n` +
                            `⏰ آخر انصراف: ${latestCheckOut ? formatTimeInRiyadh(latestCheckOut) : 'غير متوفر'}`
                    },
                    {
                        name: '👤 تفاصيل الأعضاء',
                        value: reportParts[0] || 'لا يوجد سجلات'
                    }
                ],
                color: 0x00ff00,
                timestamp: new Date(),
                footer: {
                    text: 'تم إنشاء التقرير في'
                }
            }]
        });

        // إرسال الأجزاء المتبقية
        for (let i = 1; i < reportParts.length; i++) {
            await logChannel.send({
                embeds: [{
                    description: reportParts[i]
                }]
            });
        }
    } catch (error) {
        console.error('Error sending daily report:', error);
    }
}

// تحسين عمليات قاعدة البيانات
async function checkAttendanceAndLeave(userId, guildId) {
    const startOfDay = getStartOfDay();
    const endOfDay = getEndOfDay();

    const [attendanceRecord, leaveRecord] = await Promise.all([
        Attendance.findOne({
            userId,
            guildId,
            date: {
                $gte: startOfDay,
                $lt: endOfDay
            }
        }),
        Leave.findOne({
            adminId: userId,
            guildId,
            startDate: { $lte: endOfDay },
            endDate: { $gte: startOfDay },
            status: 'approved'
        })
    ]);
    return { attendanceRecord, leaveRecord };
}

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'ticket_modal') {
            const content = interaction.fields.getTextInputValue('ticket_content');

            // إنشاء القناة للتذكرة
            const ticketChannel = await createTicketChannel(interaction, content);
            await interaction.reply({
                content: `✅ تم إنشاء تذكرتك بنجاح في ${ticketChannel}`,
                ephemeral: true
            });

            // إرسال محتوى التذكرة إلى القناة مع منشن
            await ticketChannel.send(`@everyone محتوى التذكرة: ${content}`);
        }
    } else if (interaction.isButton() && interaction.customId) {
        if (interaction.customId.startsWith('close_ticket')) {
            await handleCloseTicket(interaction);
        } else if (interaction.customId.startsWith('delete_ticket')) {
            await handleDeleteTicket(interaction);
        }
    }
});

// دالة معالجة حذف التذكرة
async function handleDeleteTicket(interaction) {
    try {
        // التحقق من الصلاحيات
        if (!interaction.member.permissions.has('MANAGE_CHANNELS')) {
            await interaction.reply({
                content: '❌ ليس لديك صلاحية لحذف التذاكر',
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        // التحقق من صحة معرف التذكرة
        const ticketId = interaction.customId.split('_').pop();
        if (!ticketId) {
            throw new Error('معرف التذكرة غير صالح');
        }

        const ticket = await Ticket.findOne({ ticketId: `TICKET-${ticketId}` });
        if (!ticket) {
            await interaction.editReply({
                content: '❌ لم يتم العثور على التذكرة في قاعدة البيانات',
                ephemeral: true
            });
            return;
        }

        // التحقق من وجود القناة
        const channel = interaction.channel;
        if (!channel) {
            throw new Error('لم يتم العثور على القناة');
        }

        // تسجيل في قناة السجلات قبل الحذف
        try {
            const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🗑️ حذف تذكرة')
                    .setDescription(`تم حذف التذكرة #${ticket.ticketNumber} بواسطة ${interaction.user}`)
                    .addFields([
                        { name: 'معرف التذكرة', value: ticket.ticketId, inline: true },
                        { name: 'صاحب التذكرة', value: `<@${ticket.userId}>`, inline: true },
                        { name: 'تاريخ الإنشاء', value: ticket.createdAt.toLocaleString('ar-SA'), inline: true },
                        { name: 'تاريخ الإغلاق', value: ticket.closedAt ? ticket.closedAt.toLocaleString('ar-SA') : 'غير معروف', inline: true }
                    ])
                    .setColor(0xff0000)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }
        } catch (logError) {
            console.error('خطأ في تسجيل حذف التذكرة:', logError);
            // نستمر في العملية حتى لو فشل التسجيل
        }

        // حذف القناة وتحديث قاعدة البيانات
        try {
            await channel.delete();
            await ticket.deleteOne();
            
            await interaction.editReply({
                content: '✅ تم حذف التذكرة والقناة بنجاح',
                ephemeral: true
            });
        } catch (deleteError) {
            throw new Error(`فشل في حذف التذكرة: ${deleteError.message}`);
        }
    } catch (error) {
        console.error('خطأ في handleDeleteTicket:', error);
        
        const errorMessage = {
            content: '❌ حدث خطأ أثناء حذف التذكرة: ' + (error.message || 'خطأ غير معروف'),
            ephemeral: true
        };

        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

// استيراد الأوامر
const openSessionsCommand = require('./commands/open-sessions'); // تأكد من المسار الصحيح

require('./cronJobs/attendanceCheck'); // تأكد من المسار الصحيح

// دالة تسجيل محسنة
function enhancedLogger(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...data
    };

    // تسجيل في وحدة التحكم
    console[level](JSON.stringify(logEntry));

    // حفظ السجل في الملف
    const logFileName = `logs/error-${new Date().toISOString().split('T')[0]}.log`;
    if (level === 'error') {
        fs.appendFileSync(logFileName, JSON.stringify(logEntry) + '\n');
    }
}

// دالة تنظيف السجلات القديمة
async function cleanupOldLogs() {
    try {
        const logsDir = path.join(__dirname, 'logs');
        const files = await fs.promises.readdir(logsDir);
        const now = new Date();
        
        for (const file of files) {
            if (file.startsWith('.')) continue;

            const filePath = path.join(logsDir, file);
            const stats = await fs.promises.stat(filePath);
            const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24);

            if (fileAge > 30) {
                await fs.promises.unlink(filePath);
                enhancedLogger('info', 'Old log file deleted', {
                    file,
                    age: Math.floor(fileAge),
                    deletedAt: new Date().toISOString()
                });
            }
            else if (fileAge > 7) {
                const archiveFileName = `archive-${new Date().toISOString().split('T')[0]}.log`;
                const archivePath = path.join(logsDir, archiveFileName);
                
                const content = await fs.promises.readFile(filePath, 'utf8');
                await fs.promises.appendFile(archivePath, content + '\n');
                await fs.promises.unlink(filePath);
                
                enhancedLogger('info', 'Log file moved to archive', {
                    file,
                    archiveFile: archiveFileName,
                    age: Math.floor(fileAge),
                    archivedAt: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        enhancedLogger('error', 'Error cleaning up old logs', {
            error: error.message,
            stack: error.stack
        });
    }
}

// تشغيل تنظيف السجلات كل 24 ساعة
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);

// تنظيف السجلات عند بدء التشغيل
cleanupOldLogs().catch(error => {
    enhancedLogger('error', 'فشل في تنظيف السجلات عند بدء التشغيل', {
        error: error.message
    });
});

// دالة لإنشاء التقرير الأسبوعي
async function generateWeeklyAttendanceLog(guild) {
    try {
        const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
        if (!logChannel) return;

        // تحديد بداية ونهاية الأسبوع
        const today = moment().tz('Asia/Riyadh');
        const startOfWeek = moment(today).startOf('week').tz('Asia/Riyadh');
        const endOfWeek = moment(today).endOf('week').tz('Asia/Riyadh');

        const records = await Attendance.find({
            guildId: guild.id,
            date: {
                $gte: startOfWeek.toDate(),
                $lt: endOfWeek.toDate()
            }
        });

        if (records.length === 0) {
            await logChannel.send({
                embeds: [{
                    title: '📊 التقرير الأسبوعي للحضور',
                    description: `لا توجد سجلات حضور للأسبوع من ${startOfWeek.format('DD/MM/YYYY')} إلى ${endOfWeek.format('DD/MM/YYYY')}`,
                    color: 0xffff00,
                    timestamp: new Date()
                }]
            });
            return;
        }

        // تجميع البيانات حسب اليوم
        const dailyStats = new Map();
        let totalWeeklyMinutes = 0;
        let totalWeeklySessions = 0;
        const userWeeklyStats = new Map();

        // تهيئة إحصائيات الأيام
        for (let i = 0; i < 7; i++) {
            const day = moment(startOfWeek).add(i, 'days');
            dailyStats.set(day.format('YYYY-MM-DD'), {
                totalMinutes: 0,
                sessions: 0,
                uniqueUsers: new Set()
            });
        }

        // معالجة السجلات
        for (const record of records) {
            const member = await guild.members.fetch(record.userId).catch(() => null);
            if (!member) continue;

            const dayKey = moment(record.date).format('YYYY-MM-DD');
            const dayStats = dailyStats.get(dayKey);

            let userDailyTotal = 0;
            for (const session of record.sessions) {
                if (session.checkIn && session.checkOut) {
                    const duration = Math.floor((session.checkOut - session.checkIn) / 1000 / 60);
                    userDailyTotal += duration;
                    dayStats.sessions++;
                    totalWeeklySessions++;
                }
            }

            if (userDailyTotal > 0) {
                dayStats.totalMinutes += userDailyTotal;
                dayStats.uniqueUsers.add(record.userId);
                totalWeeklyMinutes += userDailyTotal;

                // تحديث إحصائيات المستخدم الأسبوعية
                const userStats = userWeeklyStats.get(record.userId) || {
                    username: member.user.username,
                    totalMinutes: 0,
                    daysAttended: new Set()
                };
                userStats.totalMinutes += userDailyTotal;
                userStats.daysAttended.add(dayKey);
                userWeeklyStats.set(record.userId, userStats);
            }
        }

        // إنشاء تقرير مفصل لكل يوم
        const dailyReports = [];
        for (const [date, stats] of dailyStats) {
            const dayName = moment(date).format('dddd'); // اسم اليوم بالعربية
            const hours = Math.floor(stats.totalMinutes / 60);
            const minutes = stats.totalMinutes % 60;
            
            let timeText = [];
            if (hours > 0) {
                timeText.push(formatArabicTime(hours, 'ساعة', 'ساعتان', 'ساعات'));
            }
            if (minutes > 0) {
                if (timeText.length > 0) timeText.push('و');
                timeText.push(formatArabicTime(minutes, 'دقيقة', 'دقيقتان', 'دقائق'));
            }
            
            dailyReports.push(
                `**${dayName}** (${moment(date).format('DD/MM')})\n` +
                `👥 عدد الحاضرين: ${stats.uniqueUsers.size}\n` +
                `⏱️ إجمالي وقت العمل: ${timeText.join(' ') || 'لا يوجد'}\n` +
                `🔄 عدد الجلسات: ${stats.sessions}\n`
            );
        }

        // ترتيب المستخدمين حسب إجمالي الوقت
        const sortedUsers = Array.from(userWeeklyStats.entries())
            .sort(([, a], [, b]) => b.totalMinutes - a.totalMinutes)
            .slice(0, 10); // أعلى 10 مستخدمين

        const userReports = sortedUsers.map(([, stats], index) => {
            const hours = Math.floor(stats.totalMinutes / 60);
            const minutes = stats.totalMinutes % 60;
            
            let timeText = [];
            if (hours > 0) {
                timeText.push(formatArabicTime(hours, 'ساعة', 'ساعتان', 'ساعات'));
            }
            if (minutes > 0) {
                if (timeText.length > 0) timeText.push('و');
                timeText.push(formatArabicTime(minutes, 'دقيقة', 'دقيقتان', 'دقائق'));
            }

            return `**${index + 1}.** ${stats.username}\n` +
                   `⏰ إجمالي الوقت: ${timeText.join(' ') || 'لا يوجد'}\n` +
                   `📅 أيام الحضور: ${formatArabicTime(stats.daysAttended.size, 'يوم', 'يومان', 'أيام')}\n`;
        });

        // تحديث تنسيق الإحصائيات الأسبوعية
        const weeklyHours = Math.floor(totalWeeklyMinutes / 60);
        const weeklyMinutes = totalWeeklyMinutes % 60;
        
        let weeklyTimeText = [];
        if (weeklyHours > 0) {
            weeklyTimeText.push(formatArabicTime(weeklyHours, 'ساعة', 'ساعتان', 'ساعات'));
        }
        if (weeklyMinutes > 0) {
            if (weeklyTimeText.length > 0) weeklyTimeText.push('و');
            weeklyTimeText.push(formatArabicTime(weeklyMinutes, 'دقيقة', 'دقيقتان', 'دقائق'));
        }

        const weeklyEmbed = new EmbedBuilder()
            .setTitle('📊 التقرير الأسبوعي للحضور')
            .setDescription(`تقرير الأسبوع من ${startOfWeek.format('DD/MM/YYYY')} إلى ${endOfWeek.format('DD/MM/YYYY')}`)
            .addFields([
                {
                    name: '📈 إحصائيات الأسبوع',
                    value: 
                        `👥 إجمالي المستخدمين: ${formatArabicTime(userWeeklyStats.size, 'مستخدم', 'مستخدمان', 'مستخدمين')}\n` +
                        `⏱️ إجمالي وقت العمل: ${weeklyTimeText.join(' ') || 'لا يوجد'}\n` +
                        `🔄 إجمالي الجلسات: ${formatArabicTime(totalWeeklySessions, 'جلسة', 'جلستان', 'جلسات')}`,
                    inline: false
                },
                {
                    name: '📅 تفاصيل الأيام',
                    value: dailyReports.join('\n\n'),
                    inline: false
                },
                {
                    name: '🏆 أفضل 10 أعضاء نشاطاً',
                    value: userReports.join('\n\n'),
                    inline: false
                }
            ])
            .setColor(0x00ff00)
            .setTimestamp()
            .setFooter({ text: 'تم إنشاء التقرير في' });

        await logChannel.send({ embeds: [weeklyEmbed] });

    } catch (error) {
        console.error('Error generating weekly report:', error);
    }
}

// إعداد وظائف الكرون
setupDailyReset(client);

// دالة لتنسيق الأرقام والوقت بالعربية
function formatArabicTime(number, singular, dual, plural) {
    if (number === 0) return '';
    if (number === 1) return `${singular} واحدة`;
    if (number === 2) return `${dual}`;
    if (number >= 3 && number <= 10) return `${number} ${plural}`;
    return `${number} ${singular}`;
}

// ============= معالجة الأخطاء العامة =============
process.on('unhandledRejection', (error) => {
    logger.error('خطأ غير معالج (Unhandled Rejection):', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
});

process.on('uncaughtException', (error) => {
    logger.error('استثناء غير معالج (Uncaught Exception):', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
    
    // إعادة تشغيل البوت في حالة الأخطاء الحرجة
    process.exit(1);
});