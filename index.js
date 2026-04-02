const { Telegraf } = require('telegraf');
require('dotenv').config();
const startServer = require('./server');
const User = require('./models/User');
const connectDB = require('./config/db');
const { getDaysPassed, getTargetToday } = require('./utils/dates');
const { sendReply, getGopStyleInsult } = require('./utils/replies');
const { getRandomChallenge } = require('./utils/challenges');

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

        const isDoingChallenge = user && user.canRestore;

        if (currentCompleted >= daysPassed && !isDoingChallenge) {
            return sendReply(ctx, `✋ Гальмуй, ${userName}! План на сьогодні вже виконано (${currentCompleted}/${daysPassed} дн.).`);
        }

        // Визначаємо, чи є борг 2+ дні на момент завантаження
        const isCurrentlyDebtor = (daysPassed - currentCompleted) >= 2;

        const saveProgress = async (sec) => {
            const daysPassed = getDaysPassed();
            const isChallenge = user && user.canRestore;
            // Розрахунок стріку (якщо борг — 1, якщо вчасно — +1)
            let newStreak = user && !isCurrentlyDebtor ? (user.currentStreak || 0) + 1 : 1;
            const newMaxStreak = Math.max(user?.maxStreak || 0, newStreak);
            
            const update = {
                $set: { 
                    name: userName,
                    currentStreak: newStreak,
                    maxStreak: newMaxStreak,
                    isBroken: isCurrentlyDebtor || (user?.isBroken ?? false)
                },
                $inc: { 
                    // КЛЮЧОВИЙ ФІКС: 
                    // Додаємо +1 день ТІЛЬКИ якщо сьогоднішній план ще НЕ був закритий.
                    // Якщо план закритий (наприклад, челендж здається окремо) — додаємо 0.
                    completed: (user?.completed || 0) >= daysPassed ? 0 : 1, 
                    totalSeconds: sec
                }
            };
        
            const updated = await User.findOneAndUpdate({ userId }, update, { upsert: true, new: true });
            return { updated };
        };

        const diff = Math.abs(duration - target);

        if (diff <= 5 || duration >= target) {
            const { updated: updatedUser } = await saveProgress(duration);
            
            let challengeText = "";
            let extraMarkup = null;

            // 1. ЛОГІКА ЧЕЛЕНДЖУ
            if (updatedUser.canRestore && updatedUser.activeChallenge) {
                if (updatedUser.completed >= daysPassed) {
                    // Формуємо блок голосування
                    challengeText = `\n\n🥁 ЗВІТ-ЧЕЛЕНДЖ ЗА СЬОГОДНІ!\n\nЗавдання: "${updatedUser.activeChallenge}"\n\nДаємо вогник для ${userName}🔥?!`;
                    extraMarkup = {
                        inline_keyboard: [
                            [{ text: "✅ Гідно", callback_data: `vote_yes_${userId}` },
                            { text: "❌ Халява", callback_data: `vote_no_${userId}` }]
                        ]
                    };
                } else {
                    // Скидаємо, якщо борг лишився
                    await User.updateOne({ userId }, { $set: { canRestore: false, activeChallenge: null } });
                    challengeText = `\n\n⚠️ Оскільки ти все ще боржник, вогник не повернуто. Здавай далі!`;
                }
            }

            // 2. ФОРМУВАННЯ СТАТУСУ
            const statusMsg = duration >= target ? `🔥 Ого, машина! Перевиконав план (+${duration - target} сек).` : `✅ Красава! Чітко в таймінг.`;
            const fireIcon = updatedUser.isBroken ? '🦾' : '🔥';
            
            const finalMsg = `${statusMsg}${challengeText}\n\n` +
                            `📊 Результат: ${updatedUser.completed}/${daysPassed} дн.\n` +
                            `⚡️ Стрік: ${updatedUser.currentStreak} ${fireIcon} | Всього: ${updatedUser.totalSeconds} сек.`;

            // 3. ВІДПРАВКА (Одним повідомленням)
            await ctx.reply(finalMsg, { 
                reply_to_message_id: ctx.message.message_id,
                reply_markup: extraMarkup,
                parse_mode: 'Markdown' 
            });

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
    const daysPassed = getDaysPassed();
    let user = await User.findOne({ userId });

    if (!user || !user.isBroken) {
        return ctx.reply("😎 Твій вогник і так горить! Челендж не потрібен.");
    }

    // ГОЛОВНА ПЕРЕВІРКА: чи є борг на цей момент
    if (user.completed + 1 < daysPassed) {
        const debt = daysPassed - user.completed - 1;
        const word = debt === 1 ? 'звіт' : (debt < 5 ? 'звіти' : 'звітів');
        return ctx.reply(
            `⚠️ Доступ заблоковано!\n\n` +
            `Ти не можеш повернути вогник, поки маєш борги. \n` +
            `Тобі треба здати ${debt} ${word}, щоб наздогнати групу. \n\n` +
            `Здай борги, і тоді приходь за челенджем! 👊`
        );
    }

    // Дозволяємо активувати, якщо сьогодні ще НЕ здано (або якщо є невеликий борг)
    const msg = `👊 **ЧЕЛЕНДЖ НА ПОВЕРНЕННЯ ВОГНИКА**\n\n` +
                `Ти можеш повернути вогник 🔥 прямо зараз!\n` +
                `Твій сьогоднішній звіт буде зараховано як спецзавдання.\n\n` +
                `👉 Тобі випаде рандомний треш-челендж. Виконаєш його під час планки — вогник повернеться.\n\n` +
                `Ризикнеш?`;

    await ctx.reply(msg, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 Погнали!", callback_data: 'accept_challenge' }]]
        }
    });
});

bot.action('accept_challenge', async (ctx) => {
    const challenge = getRandomChallenge();
    // Зберігаємо challenge в базу юзеру, щоб потім вивести в описі голосування
    await User.updateOne({ userId: ctx.from.id }, { $set: { canRestore: true, activeChallenge: challenge } });
    
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🚀 Прийнято! Твоє спецзавдання:\n\n👉 ${challenge}\n\nЗнімай відео, скидай сюди, а далі — суд громади!`);
});

bot.action(/vote_(yes|no)_(\d+)/, async (ctx) => {
    const action = ctx.match[1]; // 'yes' або 'no'
    const targetUserId = ctx.match[2];
    const voterId = ctx.from.id;

    // 1. Не даємо голосувати самому за себе
    if (voterId == targetUserId) {
        return ctx.answerCbQuery("😂 Nah Man! За себе голосувати не можна. Нехай громада вирішує!", { show_alert: true });
    }

    const user = await User.findOne({ userId: targetUserId });
    if (!user || !user.canRestore) {
        return ctx.answerCbQuery("Голосування вже неактуальне.");
    }

    // 2. Логіка підрахунку голосів (через текст повідомлення)
    let text = ctx.callbackQuery.message.text;
    let yesCount = (text.match(/✅/g) || []).length;

    if (action === 'yes') {
        yesCount++;
        
        if (yesCount >= 3) {
            // ПЕРЕМОГА! Відновлюємо вогник
            await User.updateOne(
                { userId: targetUserId }, 
                { 
                    $set: { 
                        isBroken: false,
                        canRestore: false,
                        activePollId: null,
                        activeChallenge: null,
                    }
                }
            );
            await ctx.editMessageText(`🔥 **ВОГНИК ПОВЕРНУТО!**\n\nГромада схвалила виконання ${user.name}. Машина!`);
            return ctx.answerCbQuery("Рішення прийнято! 🔥");
        } else {
            // Оновлюємо лічильник у повідомленні
            await ctx.editMessageText(text + "\n✅", ctx.callbackQuery.message.reply_markup);
            return ctx.answerCbQuery("Твій голос враховано!");
        }
    } else {
        // Якщо хтось один натиснув "❌ Халява" — челендж провалено (або можна теж лічильник)
        await User.updateOne({ userId: targetUserId }, { $set: { canRestore: false, activeChallenge: null } });
        await ctx.editMessageText(`🦾 **ЧЕЛЕНДЖ ВІДХИЛЕНО.**\n\nГромада відчула халяву. Вогник залишається холодним.`);
        return ctx.answerCbQuery("Спроба анульована.");
    }
});

// --- 7. ЗАПУСК ---
bot.launch();
console.log(`🚀 Бот стартує в режимі: ${testMode ? 'TEST' : 'PRODUCTION'}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));