const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');
const startServer = require('./server');
const User = require('./models/User');
const connectDB = require('./config/db');
const {getDaysPassed, getTargetToday} = require('./utils/dates')
const {sendReply, getGopStyleInsult} = require('./utils/replies')
require('dotenv').config();

// --- 1. ІНІЦІАЛІЗАЦІЯ СЕРВЕРУ
startServer();

// --- 2. ВИЗНАЧЕННЯ РЕЖИМУ (Локально чи Сервер) ---
const testMode = true; // test or prod

const { token, mongoUri } = testMode ? 
{ token: process.env.TEST_BOT_TOKEN, mongoUri: process.env.TEST_MONGO_URI} :
{ token: process.env.BOT_TOKEN, mongoUri: process.env.MONGO_URI};

connectDB(mongoUri);

const bot = new Telegraf(token);

// --- 5. ОБРОБКА ВІДЕО ---
bot.on(['video', 'video_note'], async (ctx) => {
    const video = ctx.message.video || ctx.message.video_note;
    const duration = video.duration; 
    const target = getTargetToday(); 
    const daysPassed = getDaysPassed();
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;

    // 1. Перевірка на "гоп-стоп"
    if (duration < 30) {
        return sendReply(ctx, `🤬 ${getGopStyleInsult()} (${duration} сек — це несерйозно)`);
    }

    // 2. Перевірка ліміту днів
    let user = await User.findOne({ userId });
    const currentCompleted = user ? user.completed : 0;

    if (currentCompleted >= daysPassed) {
        return sendReply(ctx, `✋ Гальмуй, ${userName}! Ти вже здав план на сьогодні (${currentCompleted}/${daysPassed} дн.). \nПриходь завтра!`);
    }

    const diff = Math.abs(duration - target);
    
    // Функція для запису в базу
    const saveProgress = async (sec) => {
        return await User.findOneAndUpdate(
            { userId },
            { 
                $set: { name: userName }, 
                $inc: { completed: 1, totalSeconds: sec } 
            },
            { upsert: true, new: true }
        );
    };

    if (diff <= 5) {
        const updatedUser = await saveProgress(duration);
        sendReply(ctx, `✅ Красава! Чітко в таймінг. \nТвій результат: ${updatedUser.completed}/${daysPassed} дн. \nВсього вистояно: ${updatedUser.totalSeconds} сек. 🦾`);
    } else if (duration < target) {
        sendReply(ctx, `⚠️ Малувато буде! Треба було ${target} сек, а в тебе ${duration}. Не халяв!`);
    } else {
        const updatedUser = await saveProgress(duration);
        sendReply(ctx, `🔥 Ого, машина! Перевиконав план (${duration} сек). Зараховано! \nВсього: ${updatedUser.totalSeconds} сек.`);
    }
});

// --- 6. КОМАНДИ ---

bot.command('stats', async (ctx) => {
    try {
        const target = getTargetToday();
        const daysPassed = getDaysPassed();
        
        // 1. Отримуємо всіх юзерів
        let users = await User.find();

        // 2. Сортування
        users.sort((a, b) => {
            // Боржником вважаємо того, хто виконав МЕНШЕ ніж (daysPassed - 1)
            // Приклад: сьогодні День 3. Якщо у юзера 2 дні — він КРАСАВА. Якщо 1 день — БОРЖНИК.
            const aIsDebtor = a.completed < (daysPassed - 1);
            const bIsDebtor = b.completed < (daysPassed - 1);

            // ПРАВИЛО 1: Ті, хто без боргів, завжди вище
            if (aIsDebtor && !bIsDebtor) return 1;
            if (!aIsDebtor && bIsDebtor) return -1;

            // ПРАВИЛО 2: Сортуємо за секундами (від більшого до меншого)
            return b.totalSeconds - a.totalSeconds;
        });

        let msg = `🏆 **ТАБЛИЦЯ ЛІДЕРІВ** (День ${daysPassed})\n`;
        msg += `⏱ Сьогоднішня ціль: **${target} сек**\n`;
        msg += `--------------------------\n`;

        if (users.length === 0) {
            msg += "Поки що ніхто не здав відео.";
        } else {
            users.forEach((u, i) => {
                const isDebtor = u.completed < (daysPassed - 1);
                
                // Визначаємо іконку: якщо борг — 🔻, якщо ні — медалі за топ-3 або стандартна 👤
                let icon = '👤';
                if (isDebtor) {
                    icon = '🔻';
                } else {
                    if (i === 0) icon = '🥇';
                    else if (i === 1) icon = '🥈';
                    else if (i === 2) icon = '🥉';
                }

                // Текст боргу (тільки якщо він є)
                const debtCount = daysPassed - u.completed;
                const statusText = isDebtor ? `*(Борг: ${debtCount} дн.)*` : '';
                
                msg += `${icon} **${u.name}** ${statusText}\n└ Днів: ${u.completed}/${daysPassed} | Всього: ${u.totalSeconds} сек.\n\n`;
            });
        }

        sendReply(ctx, msg);
    } catch (e) {
        console.error(e);
        sendReply(ctx, "Помилка при отриманні статистики.");
    }
});

// --- 7. ЗАПУСК ---
bot.launch();
console.log(`🚀 Бот стартує в режимі: ${testMode ? 'TEST' : 'PRODUCTION'}`);

// Зупинка бота при завершенні процесу
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));