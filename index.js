const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const http = require('http');
require('dotenv').config();

// --- 1. НАЛАШТУВАННЯ ПОРТУ ТА СЕРВЕРА (для Render) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
}).listen(PORT, () => {
    console.log(`✅ Веб-сервер запущено на порту ${PORT}`);
});

// --- 2. ВИЗНАЧЕННЯ РЕЖИМУ (Локально чи Сервер) ---
// Якщо в .env є TEST_BOT_TOKEN — ми в режимі розробки

const testMode = false; // test or prod

const { token, mongoUri } = testMode ? 
{ token: process.env.TEST_BOT_TOKEN, mongoUri: process.env.TEST_MONGO_URI} :
{ token: process.env.BOT_TOKEN, mongoUri: process.env.MONGO_URI};

const bot = new Telegraf(token);

// 3. Підключення до БД з перевіркою назви бази
mongoose.connect(mongoUri)
    .then(() => {
        // Виводимо назву бази, щоб точно знати, куди ми підключилися
        console.log(`✅ БД підключена: ${testMode ? 'TEST' : 'PRODUCTION'}`);
        console.log(`📂 Назва бази в Atlas: ${mongoose.connection.name}`);
    })
    .catch(err => console.error('❌ Помилка БД:', err));

// Схема користувача
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    name: String,
    completed: { type: Number, default: 0 },
    totalSeconds: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// --- 4. ДОПОМІЖНІ ФУНКЦІЇ ---

// Скільки днів пройшло від старту
const getDaysPassed = () => {
    const start = new Date(2026, 2, 19); // 19 березня 2026
    const today = new Date();
    const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
};

// Ціль у секундах на сьогодні
const getTargetToday = () => {
    const days = getDaysPassed();
    return 30 + (Math.max(0, days - 1) * 5);
};

// Функція-обгортка для відповідей (додає префікс у тесті)
const sendReply = (ctx, text, extra = {}) => {
    const prefix = testMode ? '🛠 [TEST MODE]\n' : '';
    // Виправляємо помилку: якщо extra не об'єкт (наприклад, Markdown), обробляємо це
    const options = typeof extra === 'string' ? { parse_mode: extra } : extra;
    return ctx.reply(prefix + text, { parse_mode: 'Markdown', ...options });
};

const getGopStyleInsult = () => {
    const phrases = [
        "Чуєш, ти шо, на приколі? Де решта секунд? 🤨",
        "Слишиш, це шо за фізкультура для малят?",
        "Ти кому це фуфло впарюєш? Навіть 30 сек не було — не пацан!",
        "Шось ти слабо газуєш, дядя. Сімки-вісімки не канають!"
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
};

bot.use(async (ctx, next) => {
    // Перевіряємо, чи це текстове повідомлення
    if (ctx.message) {
        const userId = ctx.from.id;
        const username = ctx.from.username || ctx.from.first_name;
        const text = ctx.message.text || "[Медіа/Інше]";

        console.log(`--- 📩 Нове повідомлення ---`);
        console.log(`Від: ${username} (ID: ${userId})`);
        console.log(`Текст: ${text}`);
        console.log(`База даних: ${mongoose.connection.name}`); // Перевірка, куди пишемо
        console.log(`---------------------------`);
    }
    
    // Обов'язково викликаємо next(), щоб бот пішов далі до наступних обробників
    return next(); 
});

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
        const users = await User.find().sort({ totalSeconds: -1, completed: -1 });

        let msg = `📊 **СТАТУС ЧЕЛЕНДЖУ** (День ${daysPassed})\n`;
        msg += `⏱ Сьогоднішня ціль: **${target} сек**\n`;
        msg += `--------------------------\n`;

        if (users.length === 0) {
            msg += "Поки що ніхто не здав відео.";
        } else {
            users.forEach((u, i) => {
                const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤';
                msg += `${icon} **${u.name}**\n└ Днів: ${u.completed}/${daysPassed} | Всього: ${u.totalSeconds} сек.\n\n`;
            });
        }

        sendReply(ctx, msg);
    } catch (e) {
        console.error(e);
        sendReply(ctx, "Помилка при отриманні статистики.");
    }
});

bot.command('reset_all', async (ctx) => {
    const ADMIN_ID = 415598130; 
    if (ctx.from.id !== ADMIN_ID) return sendReply(ctx, "✋ Чуєш, ти куди лізеш?");

    try {
        await User.deleteMany({});
        sendReply(ctx, "🧹 База чиста. Починаємо з нуля!");
    } catch (e) {
        sendReply(ctx, "Помилка при обнуленні.");
    }
});

// --- 7. ЗАПУСК ---
bot.launch();
console.log(`🚀 Бот стартує в режимі: ${testMode ? 'TEST' : 'PRODUCTION'}`);

// Зупинка бота при завершенні процесу
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));