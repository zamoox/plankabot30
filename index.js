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
            const target = getTargetToday();
            let restoreSuccess = false;

            // ЛОГІКА ВІДНОВЛЕННЯ ВОГНИКА
            if (user && user.isBroken && user.canRestore) {
                if (sec >= target + 10) {
                    restoreSuccess = true;
                }
            }

            let newStreak = user && !isCurrentlyDebtor ? (user.currentStreak || 0) + 1 : 1;
            const newMaxStreak = Math.max(user?.maxStreak || 0, newStreak);
            
            const update = {
                $set: { 
                    name: userName,
                    currentStreak: newStreak,
                    maxStreak: newMaxStreak,
                    canRestore: false // Скидаємо прапорець спроби в будь-якому випадку
                },
                $inc: { 
                    completed: 1, 
                    totalSeconds: sec
                }
            };
            
            // Якщо борг зараз — Broken. Якщо був Broken і НЕ виконав челендж — залишається Broken.
            if (isCurrentlyDebtor || (user && user.isBroken && !restoreSuccess)) {
                update.$set.isBroken = true;
            } else if (restoreSuccess) {
                update.$set.isBroken = false; // ПОВЕРТАЄМО ВОГНИК!
            }

            // Решта коду без змін...
            const updated = await User.findOneAndUpdate({ userId }, update, { upsert: true, new: true });
            // ...
            return { updated, restoreSuccess };
        };

        const diff = Math.abs(duration - target);

        if (diff <= 5 || duration >= target) {
            const {updated: updatedUser} = await saveProgress(duration);
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
                msg += `└ Днів: ${u.completed}/${daysPassed} | Рекорд: ${u.maxStreak || 0} | Стрік:${streakFire}\n`;
                msg += `└ Всього: *${u.totalSeconds} сек.*\n\n`;
            });
        }

        const prefix = typeof testMode !== 'undefined' && testMode ? '🛠 [TEST MODE]\n' : '';
        await ctx.reply(prefix + msg, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error(e);
        ctx.reply("❌ Помилка статистики.");
    }
});

// --- КОМАНДА ПРАВИЛ ---
bot.command('guide', (ctx) => {
    try {
        const targetToday = getTargetToday();
        
        const rulesMsg = `
🥋 *ГАЙД ПО ЧЕЛЕНДЖУ*

1. *План на сьогодні:* — вистояти *${targetToday} сек*.
    Кожного дня ціль зростає на **+5 сек**.

2. *Як надсилати відео: 🎥*
    Якщо план *до 60 сек* — можна записувати звичайний "кружечок".
    Якщо план *більше 60 сек* — надсилай **звичайне відео**, бо Телеграм обрізає "кружечки" на першій хвилині.

3. *Твій статус (🔥):*
    Поки ти здаєш звіти вчасно — вогник з тобою.
    Якщо ти раз стаєш боржником — вогник зникає назавжди. 

4. *Пропустив день?*
    Не біда! Ти можеш скинути кілька відео за один вечір, щоб наздогнати групу. Бот прийматиме твої звіти, поки ти не вийдеш на сьогоднішній графік.

Позначення:

    🥇/🥈/🥉 — Трійка лідерів, про них ходять легенди найбільше часу.

    🔻 — Позначка боржника. З’являється, якщо ти відстав від графіка на 2+ дні.

    Стрік: 8 🔥 — Означає, що ти молодець і йдеш без критичних затримок.
    
    Стрік: 8 (без вогника) — Означає, що ти наздогнав групу, але колись уже "грішив" із пропусками.
    `;

        ctx.reply(rulesMsg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Помилка в rules:", e);
        ctx.reply("❌ Не вдалося завантажити правила.");
    }
});

bot.command('remind', async (ctx) => {
    try {
        const daysPassed = getDaysPassed();
        const targetToday = getTargetToday();
        const users = await User.find();

        const debtors = users.filter(u => u.completed < daysPassed);

        if (debtors.length === 0) {
            return ctx.reply("😎 **Всі при ділі!** Боржників нуль, вогники горять. Від душі, пацани!");
        }

        let msg = `📣 **ЗБІР ПО ТРИВОЗІ**\n`;
        msg += `⏱ План на сьогодні: **${targetToday} сек**\n`;
        msg += `--------------------------\n\n`;

        let ironList = "";    // Останній шанс (борг 1 день)
        let debtList = "";    // Звичайний борг (2-4 дні)
        let heavyDebtList = ""; // Жорсткий борг (5+ днів)

        debtors.forEach(u => {
            const diff = daysPassed - u.completed;
            const userTag = `[${u.name || 'Тіп'}](tg://user?id=${u.userId})`;

            if (diff >= 5) {
                heavyDebtList += `💀 ${userTag} — борг **${diff} дн.** (Повна яма)\n`;
            } else if (diff >= 2) {
                debtList += `🔻 ${userTag} — борг ${diff} дн. (Вогник 🔥 потух)\n`;
            } else if (diff === 1) {
                ironList += `⚠️ ${userTag} — рішай зараз, бо завтра без вогника!\n`;
            }
        });

        if (ironList) {
            msg += `🔥 **БИТВА ЗА ВОГНИКИ:**\n${ironList}\n`;
        }

        if (debtList) {
            msg += `📉 **СПИСОК ШТРАФНИКІВ:**\n${debtList}\n`;
        }

        if (heavyDebtList) {
            msg += `🚨 **ЖОРСТКІ ЗАВАЛИ (5+ днів):**\n${heavyDebtList}\n`;
        }

        msg += `\nДавайте, челікі, підтягуйте хвости. Чекаємо відоси! 👇`;

        await ctx.reply(msg, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error(e);
        ctx.reply("❌ Бот шось тупить, не зміг нагадати.");
    }
});

bot.command('challenge', async (ctx) => {
    const userId = ctx.from.id;
    let user = await User.findOne({ userId });

    if (!user || !user.isBroken) {
        return ctx.reply("😎 У тебе і так все чітко! Твій вогник горить, челендж не потрібен.");
    }

    const msg = `👊 **ЧЕЛЕНДЖ НА ПОВЕРНЕННЯ ВОГНИКА**\n\n` +
                `Ти колись пропустив дні, і твій стрік став "холодним" (🦾).\n` +
                `Щоб повернути статус 🔥, тобі потрібно виконати додаткове завдання:\n` +
                `**Записати відео на 10 секунд довше сьогоднішньої цілі!**\n\n` +
                `Бажаєш спробувати?`;

    await ctx.reply(msg, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "✅ Я в справі!", callback_data: 'accept_challenge' }]
            ]
        }
    });
});

bot.action('accept_challenge', async (ctx) => {
    await User.updateOne({ userId: ctx.from.id }, { $set: { canRestore: true } });
    await ctx.answerCbQuery();
    await ctx.editMessageText("🚀 Прийнято! Тепер твій наступний звіт має бути на 10 сек довшим за план. Чекаю відос!");
});

// --- 7. ЗАПУСК ---
bot.launch();
console.log(`🚀 Бот стартує в режимі: ${testMode ? 'TEST' : 'PRODUCTION'}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));