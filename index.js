const { Telegraf } = require('telegraf');
require('dotenv').config();
const startServer = require('./server');
const User = require('./models/User');
const connectDB = require('./config/db');
const { getDaysPassed, getTargetToday } = require('./utils/dates');
const { sendReply, getGopStyleInsult } = require('./utils/replies');

// 1. ІНІЦІАЛІЗАЦІЯ СЕРВЕРУ
startServer();

// 2. НАЛАШТУВАННЯ РЕЖИМУ
const testMode = false; // Змінюй на false для продакшену
 
const { token, mongoUri } =  testMode ? 
{ token: process.env.TEST_BOT_TOKEN, mongoUri: process.env.TEST_MONGO_URI} :
{ token: process.env.BOT_TOKEN, mongoUri: process.env.MONGO_URI};

connectDB(mongoUri);

const bot = new Telegraf(token);

// --- 5. ОБРОБКА ВІДЕО ---
bot.on(['video', 'video_note'], async (ctx) => {
    try {
        const video = ctx.message.video || ctx.message.video_note;
        const duration = video.duration; 
        const target = getTargetToday(); 
        const daysPassed = getDaysPassed();
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || 'Анонім';

        if (duration < 30) {
            return sendReply(ctx, `🤬 ${getGopStyleInsult()} (${duration} сек — це несерйозно)`);
        }

        let user = await User.findOne({ userId });
        const currentCompleted = user ? user.completed : 0;

        if (currentCompleted >= daysPassed) {
            return sendReply(ctx, `✋ Гальмуй, ${userName}! План на сьогодні вже виконано (${currentCompleted}/${daysPassed} дн.).`);
        }

        // Визначаємо, чи є борг 2+ дні на момент завантаження
        const isCurrentlyDebtor = (daysPassed - currentCompleted) >= 2;

        const saveProgress = async (sec) => {
            // Визначаємо новий стрік: якщо борг — починаємо з 1, якщо ні — інкрементуємо існуючий
            let newStreak = user && !isCurrentlyDebtor ? (user.currentStreak || 0) + 1 : 1;
            
            const update = {
                $set: { 
                    name: userName,
                    currentStreak: newStreak
                },
                $inc: { 
                    completed: 1, 
                    totalSeconds: sec
                }
            };
            
            // Якщо людина завантажує відео з боргом — мітка Broken назавжди
            if (isCurrentlyDebtor || (user && user.isBroken)) {
                update.$set.isBroken = true;
            }

            const updated = await User.findOneAndUpdate(
                { userId },
                update,
                { upsert: true, new: true }
            );

            // Оновлюємо рекорд
            if (updated.currentStreak > (updated.maxStreak || 0)) {
                await User.updateOne({ userId: updated.userId }, { $set: { maxStreak: updated.currentStreak } });
            }
            return updated;
        };

        const diff = Math.abs(duration - target);

        if (diff <= 5 || duration >= target) {
            const updatedUser = await saveProgress(duration);
            const statusMsg = duration >= target ? `🔥 Ого, машина! Перевиконав план.` : `✅ Красава! Чітко в таймінг.`;
            
            // Визначаємо, чи виводити вогник у повідомленні про успіх
            const fire = !updatedUser.isBroken ? '🔥' : '🦾';
            
            sendReply(ctx, `${statusMsg} \nТвій результат: ${updatedUser.completed}/${daysPassed} дн. \nСтрік: ${updatedUser.currentStreak} ${fire} | Всього: ${updatedUser.totalSeconds} сек.`);
        } else {
            sendReply(ctx, `⚠️ Малувато! Треба було ${target} сек, а в тебе ${duration}. Не халяв!`);
        }
    } catch (e) {
        console.error('Помилка при збереженні відео:', e);
        sendReply(ctx, "❌ Сталася помилка при збереженні відео. Можливо, потрібно оновити схему бази даних.");
    }
});

// --- 6. КОМАНДИ ---

bot.command('stats', async (ctx) => {
    try {
        const daysPassed = getDaysPassed();
        const targetToday = getTargetToday();
        
        let users = await User.find();

        // --- ПЕРЕВІРКА НА "ДРОП" СТРІКУ ---
        // Якщо настав новий день, а борг не закрито — обнуляємо стрік і забираємо вогник
        for (let u of users) {
            const diff = daysPassed - u.completed;
            if (diff >= 2 && (u.currentStreak > 0 || !u.isBroken)) {
                await User.updateOne(
                    { _id: u._id }, 
                    { $set: { currentStreak: 0, isBroken: true } }
                );
                // Оновлюємо локальний об'єкт для коректного відображення в списку
                u.currentStreak = 0;
                u.isBroken = true;
            }
        }

        // Сортування: не-боржники вище, далі за секундами
        users.sort((a, b) => {
            const aIsDebtor = (daysPassed - a.completed) >= 2;
            const bIsDebtor = (daysPassed - b.completed) >= 2;
            if (aIsDebtor && !bIsDebtor) return 1;
            if (!aIsDebtor && bIsDebtor) return -1;
            return b.totalSeconds - a.totalSeconds;
        });

        let msg = `🏆 **ТАБЛИЦЯ ЛІДЕРІВ** (День ${daysPassed})\n`;
        msg += `⏱ Ціль: **${targetToday} сек**\n`;
        msg += `--------------------------\n`;

        if (users.length === 0) {
            msg += "Поки що ніхто не здав відео.";
        } else {
            users.forEach((u, i) => {
                const diff = daysPassed - u.completed;
                const isTodayDebtor = diff >= 2;
                
                // Стрік з вогником тільки якщо не Broken
                const streakVal = u.currentStreak || 0;
                const streakFire = !u.isBroken ? ` ${streakVal} 🔥` : ` ${streakVal}`;
                
                let icon = '👤';
                if (isTodayDebtor) {
                    icon = '🔻';
                } else {
                    if (i === 0) icon = '🥇';
                    else if (i === 1) icon = '🥈';
                    else if (i === 2) icon = '🥉';
                }

                const statusText = isTodayDebtor ? ` *(Борг: ${diff} дн.)*` : '';
                
                msg += `${icon} **${u.name || 'Анонім'}**${statusText}\n`;
                msg += `└ Днів: ${u.completed}/${daysPassed} | Стрік:${streakFire}\n`;
                msg += `└ Рекорд: ${u.maxStreak || 0} | Всього: ${u.totalSeconds} сек.\n\n`;
            });
        }

        const prefix = typeof testMode !== 'undefined' && testMode ? '🛠 [TEST MODE]\n' : '';
        await ctx.reply(prefix + msg, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error(e);
        ctx.reply("❌ Помилка статистики.");
    }
});

// --- 7. ЗАПУСК ---
bot.launch();
console.log(`🚀 Бот стартує в режимі: ${testMode ? 'TEST' : 'PRODUCTION'}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));