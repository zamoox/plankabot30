const { ICON, FOOTER } = require('./helpers');

// Функція-обгортка для відповідей (додає префікс у тесті)
const sendReply = (ctx, text, extra = {}) => {
    // Виправляємо помилку: якщо extra не об'єкт (наприклад, Markdown), обробляємо це
    const options = typeof extra === 'string' ? { parse_mode: extra } : extra;
    return ctx.reply(text, { parse_mode: 'Markdown', ...options });
};

const MESSAGES = {
    video: {
        getGopStyleInsult: () => {
            const phrases = [
                "Чуєш, ти шо, на приколі? Де решта секунд? 🤨",
                "Слишиш, це шо за фізкультура для малят?",
                "Ти кому це фуфло впарюєш? Навіть 30 сек не було — не пацан!",
                "Шось ти слабо газуєш, дядя. Сімки-вісімки не канають!"
            ];
            return phrases[Math.floor(Math.random() * phrases.length)];
        },

        tooShort: (sec) => `🤬 ${MESSAGES.video.getGopStyleInsult()} (${sec} сек — це несерйозно)`,

        alreadyDone: (name, comp, day) => `✋ Гальмуй, ${name}! План на сьогодні вже виконано (${comp}/${day} дн.).`,

        almost: (sec, target) => `${ICON.WARN} Малувато буде! Треба було ${target} сек, а в тебе ${sec}. Не халяв!`,
        
        successHigh: (sec, target) => `${ICON.FIRE} Ого, машина! Перевиконав план (+${sec - target} сек).`,
        
        successOk: `✅ Красава! Чітко в таймінг.`,

        icon: (isBroken) => isBroken ? '🦾' : '🔥',

        statusMessage: (sec, target) => sec >= target ? MESSAGES.video.successHigh(sec, target) : MESSAGES.video.successOk,

        tooLow: (target, sec) => `${ICON.WARN} Малувато! Треба було ${target} сек, а в тебе ${sec}.`,

        statsSuffix: (comp, day, streak, icon, total) => 
            `${ICON.STAT} Результат: ${comp}/${day} дн.\n${ICON.BOLT} Стрік: ${streak} ${icon} | Всього: *${total} сек.*`,

        finalMsg: (user, personalDay, duration, target) => `${MESSAGES.video.statusMessage(duration, target)}${user.activeChallenge || ''}\n\n` +
                            `📊 Результат: ${user.completed}/${personalDay} дн.\n` +
                            `⚡️ Стрік: ${user.currentStreak} ${MESSAGES.video.icon(user.isBroken)} | Всього: ${user.totalSeconds} сек.`,

        error: "❌ Сталася помилка при збереженні відео. Можливо, потрібно оновити схему бази даних.",
    },
    stats: {
        statsHeader: (day, target) => 
            `🏆 <b>ТАБЛИЦЯ ЛІДЕРІВ</b> (День ${day})\n${ICON.TARGET} Ціль: <b>${target} сек</b>\n--------------------------\n`,
        
        userIcon: (isDebtor, position) => isDebtor ? ICON.DEBTOR : 
            (position === 0 ? ICON.MEDALS[0] : position === 1 ? ICON.MEDALS[1] : position === 2 ? ICON.MEDALS[2] : ICON.DEFAULT),

        userDebtorText: (isDebtor, diff) => isDebtor ? ` <i>(Борг: ${diff} дн.)</i>` : '',

        userStreak: (u) => (!u.isBroken ? ` ${u.currentStreak} 🔥` : ` ${u.currentStreak}`),

        userFullTime: (sec) => `( ${Math.floor(sec/60)} хв ${sec - Math.floor(sec/60) * 60} сек )`,

        // ВИПРАВЛЕНО: Прибрано this, виправлено конкатенацію рядків
        userInfo: (user, position, isDebtor, diff, personalDays) => {

            const userIcon = MESSAGES.stats.userIcon(isDebtor, position);
            const debtorText = MESSAGES.stats.userDebtorText(isDebtor, diff);
            const userStreak = MESSAGES.stats.userStreak(user);
            
            return `${userIcon} <b>${user.name || 'Анонім'}</b>${debtorText}\n` +
                   `└ Днів: ${user.completed}/${personalDays} | Рекорд: ${user.maxStreak || 0} | Стрік:${userStreak}\n` +
                   `└ Всього: <b>${user.totalSeconds} сек.</b> <i>${(MESSAGES.stats.userFullTime(user.totalSeconds))}</i>\n\n`;
        },

        remindHeader: (target) => 
            `📣 <b>ЗБІР ПО ТРИВОЗІ</b>\n${ICON.TARGET} План: <b>${target} сек</b>\n--------------------------\n\n`,
        
        noStats: "Поки що ніхто не здав відео.",
        remindNoDebtors: `😎 <b>Всі красунчики!</b> Боржників немає, вогники горять ${ICON.FIRE}.`,
        remindFooter: FOOTER.REMIND
    },
    guide: {
        text: `
        📖 **ПРАВИЛА ТА ІНСТРУКЦІЯ ЧЕЛЕНДЖУ**

        1️⃣ **Мета:** Щодня робити планку. Кожен новий день додає **+5 секунд** до твого часу.
        2️⃣ **Відео:** Скидаєш відео (або video_note) у цей чат. Бот автоматично зарахує прогрес.
        3️⃣ **Таймінги:** • Мінімум для зарахування: **30 сек**.
        • Твоя ціль на сьогодні рахується індивідуально від дати старту.
        4️⃣ **Вогники та Стріки:**
        • Здаєш вчасно — отримуєш 🔥 та +1 до стріку.
        • Пропустив день — вогник гасне 🦾.
        • Пропустив 2+ дні — ти стаєш боржником 🔻.
        5️⃣ **Повернення вогника:** • Якщо вогник згас, ти можеш активувати команду \`/challenge\`.
        • Бот дасть тобі спецзавдання. Якщо громада проголосує "✅ Гідно" — твій 🔥 повернеться!

        Позначення:
            🥇/🥈/🥉 — Трійка лідерів, про них ходять легенди найбільше часу.
            🔻 — Позначка боржника. З’являється, якщо ти відстав від графіка на 2+ дні.
            Стрік: 8 🔥 — Означає, що ти молодець і йдеш без критичних затримок.
            Стрік: 8 (без вогника) — Означає, що ти наздогнав групу, але колись уже "грішив" із пропусками.
    `,
    },
    challenge: {
        intro: `👊 **ЧЕЛЕНДЖ НА ПОВЕРНЕННЯ ВОГНИКА**\n\n` +
                    `Ти можеш повернути вогник 🔥 прямо зараз!\n` +
                    `Твій сьогоднішній звіт буде зараховано як спецзавдання.\n\n` +
                    `👉 Тобі випаде рандомний треш-челендж. Виконаєш його під час планки — вогник повернеться.\n\n` +
                    `Ризикнеш?`,

        go: `🚀 Погнали!`,

        accept: (challenge) => `🚀 Прийнято! Твоє спецзавдання:\n\n👉 ${challenge}\n\nЗнімай відео, скидай сюди, а далі — суд громади!`,

        blockVote: "😂 Nah Man! За себе голосувати не можна. Нехай громада вирішує!",

        notNeeded: `😎 Твій вогник і так горить! Челендж не потрібен.`,

        locked: (debt, word) => `${ICON.WARN} Доступ заблоковано!\n\n` +
            `Ти не можеш повернути вогник, поки маєш борги. \n` +
            `Тобі треба здати ${debt} ${word}, щоб наздогнати групу. \n\n` +
            `Здай борги, і тоді приходь за челенджем! 👊`,

        poll: (challenge, name) => `\n\n🥁 ЗВІТ-ЧЕЛЕНДЖ ЗА СЬОГОДНІ!\n\nЗавдання: "${challenge}"\n\nДаємо вогник для ${name}🔥?!`,

        win: (name) => `🔥 **ВОГНИК ПОВЕРНУТО!**\n\nГромада схвалила виконання ${name}. Машина!`,

        loss: `${ICON.BROKEN} <b>ЧЕЛЕНДЖ ВІДХИЛЕНО.</b> Громада відчула халяву.`,
        
        debtStillExists: `\n\n${ICON.WARN} Оскільки ти все ще боржник, вогник не повернуто. Здавай далі!`,

        votingNotActive: "Голосування вже неактуальне.",

        cancelAttempt: "Спроба анульована.",

        countVote: "Твій голос враховано",

    },
}

module.exports = {
    MESSAGES,
    sendReply 
};