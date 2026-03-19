const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const cron = require('node-cron'); // Не забудьте: npm install node-cron
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. ПІДКЛЮЧЕННЯ ДО МОНГО
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ База даних підключена!'))
    .catch(err => console.error('❌ Помилка БД:', err));

// Схема користувача (що ми зберігаємо)
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    name: String,
    completed: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// 2. ЛОГІКА СЕКУНД (Старт 19 березня 2026)
function getTargetToday() {
    const start = new Date(2026, 2, 19);
    const today = new Date();
    const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
    return 30 + (Math.max(0, diff) * 5);
}

// Функція для "гоп-стоп" коментарів
const getGopStyleInsult = () => {
    const phrases = [
        "Чуєш, ти шо, на приколі? Де решта секунд? 🤨",
        "Слишиш, це шо за фізкультура для малят? Давай по-нормальному!",
        "Ти кому це фуфло впарюєш? навіть 30 секунд не було — не пацан (чи не пацанка)!",
        "Шось ти слабо газуєш, дядя. Сімки-вісімки не канають, давай повну дистанцію!"
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
};

bot.on(['video', 'video_note'], async (ctx) => {
    const video = ctx.message.video || ctx.message.video_note;
    const duration = video.duration; 
    const target = getTargetToday(); 
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;

    // 1. ПЕРЕВІРКА НА "ГОП-СТОП"
    if (duration < 30) {
        return ctx.reply(`🤬 ${getGopStyleInsult()} (${duration} сек — це несерйозно)`);
    }

    const diff = Math.abs(duration - target);
    
    // Функція-помічник для запису в БД, щоб не дублювати код
    const saveProgress = async () => {
        return await User.findOneAndUpdate(
            { userId },
            { $set: { name: userName }, $inc: { completed: 1 } },
            { upsert: true, new: true }
        );
    };

    if (diff <= 5) {
        const user = await saveProgress();
        ctx.reply(`✅ Красава! Чітко в таймінг. \nТвій результат: ${user.completed} дн. Планка на сьогодні виконана! 🦾`);
    } else if (duration < target) {
        ctx.reply(`⚠️ Малувато буде! Сьогодні треба було ${target} сек, а в тебе тільки ${duration}. Не халяв, дожимай!`);
    } else {
        // Тепер тут теж є запис у базу!
        const user = await saveProgress();
        ctx.reply(`🔥 Ого, машина! Перевиконав план (аж ${duration} сек). Зараховано! \nТвій результат: ${user.completed} дн.`);
    }
});

// 4. ДАШБОРД /stats
bot.command('stats', async (ctx) => {
    const target = getTargetToday();
    const users = await User.find().sort({ completed: -1 });

    let msg = `📊 **СТАТУС ЧЕЛЕНДЖУ**\n`;
    msg += `⏱ Сьогоднішня ціль: **${target} сек**\n`;
    msg += `--------------------------\n`;

    users.forEach((u, i) => {
        const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : '👤';
        msg += `${icon} ${u.name}: ${u.completed} дн.\n`;
    });

    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('reset_all', async (ctx) => {
    // Вкажіть свій ID (дізнатися можна через @userinfobot), щоб будь-хто не обнулив базу
    const ADMIN_ID = 415598130; 

    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply("✋ Чуєш, ти куди лізеш?");
    }

    try {
        await User.deleteMany({}); // Видаляє ВСІХ користувачів з бази
        ctx.reply("🧹 База чиста, як совість пацана. Починаємо челендж з нуля!");
    } catch (e) {
        ctx.reply("Помилка при обнуленні.");
    }
});

bot.launch();