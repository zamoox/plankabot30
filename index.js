const { Telegraf } = require('telegraf');
require('dotenv').config();
const startServer = require('./server');
const User = require('./models/User');
const connectDB = require('./config/db');
const { getUserContext } = require('./utils/userContext');
const { getUserDaysPassed, getTargetForToday } = require('./utils/dates');
const { sendReply, getGopStyleInsult } = require('./utils/replies');
const { getRandomChallenge } = require('./utils/challenges');
const { COMMANDS } = require('./utils/messages');

// 1. ІНІЦІАЛІЗАЦІЯ СЕРВЕРУ
startServer();

// 2. НАЛАШТУВАННЯ РЕЖИМУ
const testMode = false; // Змінюй на false для продакшену
 
// 3. ОТРИМАННЯ ТОКЕНУ БОТА ТА БАЗИ ДАНИХ
const { token, mongoUri } =  testMode ? 
{ token: process.env.TEST_BOT_TOKEN, mongoUri: process.env.TEST_MONGO_URI} :
{ token: process.env.BOT_TOKEN, mongoUri: process.env.MONGO_URI};

connectDB(mongoUri);

// 4. ІНІЦІАЛІЗАЦІЯ БОТА
const bot = new Telegraf(token);

// --- 5. ОБРОБКА ВІДЕО ---
bot.on(['video', 'video_note'], async (ctx) => {
    try {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || 'Анонім';

        const { user, personalTarget, personalDay } = await getUserContext(userId, userName);

        const video = ctx.message.video || ctx.message.video_note;
        const duration = video.duration; 


        if (duration < 30) {
            return sendReply(ctx, `🤬 ${getGopStyleInsult()} (${duration} сек — це несерйозно)`);
        }

        const currentCompleted = user ? user.completed : 0;
        const isDoingChallenge = user && user.canRestore;

        if (currentCompleted >= personalDay && !isDoingChallenge) {
            return sendReply(ctx, `✋ Гальмуй, ${userName}! План на сьогодні вже виконано (${currentCompleted}/${personalDay} дн.).`);
        }

        // Визначаємо, чи є борг 2+ дні на момент завантаження
        const isCurrentlyDebtor = (personalDay - currentCompleted) >= 2;

        const saveProgress = async (sec) => {
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
                    // Додаємо +1 день ТІЛЬКИ якщо сьогоднішній план ще НЕ був закритий.
                    // Якщо план закритий (наприклад, челендж здається окремо) — додаємо 0.
                    completed: (user?.completed || 0) >= personalDay ? 0 : 1, 
                    totalSeconds: sec
                }
            };
        
            const updatedDoc = await User.findOneAndUpdate({ userId }, update, { upsert: true, new: true });
            return {updated: updatedDoc};
        };

        const diff = Math.abs(duration - personalTarget);

        if (diff <= 5 || duration >= personalTarget) {
            const { updated: updatedUser } = await saveProgress(duration);
            
            let challengeText = "";
            let extraMarkup = null;

            // 1. ЛОГІКА ЧЕЛЕНДЖУ
            if (updatedUser.canRestore && updatedUser.activeChallenge) {
                if (updatedUser.completed >= personalDay) {
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
            const statusMsg = duration >= personalTarget ? `🔥 Ого, машина! Перевиконав план (+${duration - personalTarget} сек).` : `✅ Красава! Чітко в таймінг.`;
            const fireIcon = updatedUser.isBroken ? '🦾' : '🔥';
            
            const finalMsg = `${statusMsg}${challengeText}\n\n` +
                            `📊 Результат: ${updatedUser.completed}/${personalDay} дн.\n` +
                            `⚡️ Стрік: ${updatedUser.currentStreak} ${fireIcon} | Всього: ${updatedUser.totalSeconds} сек.`;

            // 3. ВІДПРАВКА (Одним повідомленням)
            await ctx.reply(finalMsg, { 
                reply_to_message_id: ctx.message.message_id,
                reply_markup: extraMarkup,
                parse_mode: 'Markdown' 
            });

        } else {
            sendReply(ctx, `⚠️ Малувато! Треба було ${personalTarget} сек, а в тебе ${duration}. Не халяв!`);
        }
    } catch (e) {
        console.error('Помилка при збереженні відео:', e);
        sendReply(ctx, "❌ Сталася помилка при збереженні відео. Можливо, потрібно оновити схему бази даних.");
    }
});

// --- 6. КОМАНДИ ---

bot.command('stats', async (ctx) => {
    try {
        const daysPassed = getUserDaysPassed('Europe/Kyiv');
        const targetToday = getTargetForToday(daysPassed);
        
        let users = await User.find();

        // --- ПЕРЕВІРКА НА "ДРОП" СТРІКУ ---
        // Якщо настав новий день, а борг не закрито — обнуляємо стрік і забираємо вогник
        for (let u of users) {
            const userTZ = u.timezone || 'Europe/Kyiv';
            const personalDays = getUserDaysPassed(userTZ);
            const diff = personalDays - u.completed;

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
            const aDiff = getUserDaysPassed(a.timezone || 'Europe/Kyiv') - a.completed;
            const bDiff = getUserDaysPassed(b.timezone || 'Europe/Kyiv') - b.completed;
            
            const aIsDebtor = aDiff >= 2;
            const bIsDebtor = bDiff >= 2;

            if (aIsDebtor && !bIsDebtor) return 1;
            if (!aIsDebtor && bIsDebtor) return -1;
            return b.totalSeconds - a.totalSeconds;
        });

        let msg = COMMANDS.stats.statsHeader(daysPassed, targetToday);

        if (users.length === 0) {
            msg += COMMANDS.stats.noStats;
        } else {
            users.forEach((user, position) => {
                const userTZ = user.timezone || 'Europe/Kyiv';
                const personalDays = getUserDaysPassed(userTZ);
                const diff = personalDays - user.completed;
                const isDebtor = diff >= 2;

                msg += COMMANDS.stats.userInfo(user, position, isDebtor, diff, personalDays)
            });
        }

        const prefix = typeof testMode !== 'undefined' && testMode ? '🛠 [TEST MODE]\n' : '';
        await ctx.reply(prefix + msg, { parse_mode: 'HTML' });

    } catch (e) {
        console.error(e);
        ctx.reply("❌ Помилка статистики.");
    }
});

// --- КОМАНДА ПРАВИЛ ---
bot.command('guide', (ctx) => {
    try {
        ctx.reply(COMMANDS.guide.text, { parse_mode: 'HTML' });
    } catch (e) {
        console.error("Помилка в rules:", e);
        ctx.reply("❌ Не вдалося завантажити правила.");
    }
});

bot.command('remind', async (ctx) => {
    try {
        const users = await User.find();

        const daysPassed = getUserDaysPassed('Europe/Kyiv');
        const targetToday = getTargetForToday(daysPassed);

        let ironList = '';
        let debtList = '';
        let heavyDebtList = '';
        let hasAnyDebtor = false;

        users.forEach(u => {

            const userTZ = u.timezone || 'Europe/Kyiv';
            const personalDays = getUserDaysPassed(userTZ);

            const diff = personalDays - u.completed;
            
            const userTag = `[${u.name || 'Тіп'}](tg://user?id=${u.userId})`;

            if (diff >= 1) {
                hasAnyDebtor = true;
                const userTag = `[${u.name || 'Атлет'}](tg://user?id=${u.userId})`;

                if (diff >= 5) {
                    heavyDebtList += `💀 ${userTag} — борг **${diff} дн.** (Повна яма)\n`;
                } else if (diff >= 2) {
                    debtList += `🔻 ${userTag} — борг ${diff} дн. (Вогник 🔥 потух)\n`;
                } else if (diff === 1) {
                    ironList += `⚠️ ${userTag} — сьогодні дедлайн, або прощавай вогник!\n`;
                }
            }
        });

        if (!hasAnyDebtor) {
            return ctx.reply("😎 **Всі красунчики!** Боржників немає, вогники горять. Від душі!");
        }

        let msg = `📣 **ЗБІР ПО ТРИВОЗІ**\n`;
        msg += `⏱ План на сьогодні: **${targetToday} сек** \n`;
        msg += `--------------------------\n\n`;

        if (ironList) msg += `🔥 **БИТВА ЗА ВОГНИКИ:**\n${ironList}\n`;
        if (debtList) msg += `📉 **СПИСОК ШТРАФНИКІВ:**\n${debtList}\n`;
        if (heavyDebtList) msg += `🚨 **ЖОРСТКІ ЗАВАЛИ:**\n${heavyDebtList}\n`;

        msg += `\nПідтягуйте хвости, пацани! Чекаємо відоси! 👇`;

        await ctx.reply(msg, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error(e);
        ctx.reply("❌ Бот шось тупить, не зміг нагадати.");
    }
});

bot.command('challenge', async (ctx) => {
    const userId = ctx.from.id;
    const daysPassed = getUserDaysPassed();
    let user = await User.findOne({ userId });

    if (!user || !user.isBroken) {
        return ctx.reply("😎 Твій вогник і так горить! Челендж не потрібен.");
    }

    // ГОЛОВНА ПЕРЕВІРКА: чи є борг на цей момент
    if (user.completed + 1 < daysPassed) {
        const debt = daysPassed - user.completed - 1;
        const word = debt === 1 ? 'звіт' : (debt < 5 ? 'звіти' : 'звітів');
        return ctx.reply(COMMANDS.challenge.locked);
    }

    // Дозволяємо активувати, якщо сьогодні ще НЕ здано (або якщо є невеликий борг)
    const msg = COMMANDS.challenge.intro;

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