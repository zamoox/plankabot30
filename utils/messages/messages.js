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
            `🏆 <b>ТАБЛИЦЯ ЛІДЕРІВ ( День ${day} )\n${ICON.TARGET}</b> Ціль: <b>${MESSAGES.stats.getFullTime(target)}</b>\n--------------------------\n`,
        
        userIcon: (isDebtor, position) => isDebtor ? ICON.DEBTOR : 
            (position === 0 ? ICON.MEDALS[0] : position === 1 ? ICON.MEDALS[1] : position === 2 ? ICON.MEDALS[2] : ICON.DEFAULT),

        userDebtorText: (isDebtor, diff) => isDebtor ? ` <i>(Борг: ${diff} дн.)</i>` : '',

        userStreak: (u) => (!u.isBroken ? ` ${u.currentStreak}🔥` : ` ${u.currentStreak}`),

        getFullTime: (sec) => `( ${Math.floor(sec/60)} хв ${sec - Math.floor(sec/60) * 60} с )`,

        // ВИПРАВЛЕНО: Прибрано this, виправлено конкатенацію рядків
        userInfo: (user, position, isDebtor, diff, personalDays) => {

            const userIcon = MESSAGES.stats.userIcon(isDebtor, position);
            const debtorText = MESSAGES.stats.userDebtorText(isDebtor, diff);
            const userStreak = MESSAGES.stats.userStreak(user);
            
            return `${userIcon} <b>${user.name || 'Анонім'}</b>${debtorText}\n` +
                   `└ Днів: ${user.completed}/${personalDays} | ${ICON.RECORD}: ${user.maxStreak || 0} | Стрік:${userStreak}\n` +
                   `└ Всього: <b>${user.totalSeconds} сек.</b> <i>${(MESSAGES.stats.getFullTime(user.totalSeconds))}</i>\n\n`;
        },

        remindHeader: (target) => 
            `📣 <b>ЗБІР ПО ТРИВОЗІ</b>\n${ICON.TARGET} План: <b>${target} сек</b>\n--------------------------\n\n`,
        
        noStats: "Поки що ніхто не здав відео.",
        remindNoDebtors: `😎 <b>Всі красунчики!</b> Боржників немає, вогники горять ${ICON.FIRE}.`,
        remindFooter: FOOTER.REMIND
    },
    guide: {
        text: `
        📖<b>ПРАВИЛА ТА ІНСТРУКЦІЯ ЧЕЛЕНДЖ</b>

        1️⃣ <b>[ МЕТА ]</b> 
        Щодня робити планку. 
        Початкова ціль - 30 сек. 
        Кожен новий день додає <b>+5 сек</b> до денної цілі.
        Перевірити ціль можна в команді \/stats\.

        2️⃣ <b>[ ВІДЕО ]</b>
        Скидаєш відео або кружок у цей чат. 
        Бот автоматично зарахує прогрес. 

        3️⃣ <b>[ ВОГНИК ТА СТРІК ]</b>
        Здаєш вчасно — отримуєш 🔥 та +1 до стріку.
        Пропустив день — вогник гасне і ти стаєш боржником 🔻.

        4️⃣ <b> [ ПОВЕРНЕННЯ ВОГНИКА ]</b> 
        Якщо вогник згас, ти можеш активувати команду \/challenge\.
        Бот дасть тобі спецзавдання для планки.
        Cпецзавдання зараховується як звичайна планка 
        із сьогоднішнім часом, але із додатковою умовою.  
        Якщо громада (3+ людей) проголосує "✅ Гідно"
        твій 🔥 повернеться!

        <b>ПОЗНАЧЕННЯ</b>:

        🥇/🥈/🥉 — Трійка лідерів;
        🔻 — Позначка боржника. Відстав від графіка на 2+ дні;
        🔥 — Ні разу не був боржником;
        Стрік: 8 (без вогника) — Означає, що ти наздогнав групу, 
        але колись уже "грішив" із пропусками;
    `,
    },
    challenge: {
        intro: `👊 ЧЕЛЕНДЖ НА ПОВЕРНЕННЯ ВОГНИКА\n\n` +
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

        win: (name) => `🔥 ВОГНИК ПОВЕРНУТО!\n\nГромада схвалила виконання ${name}. Машина!`,

        loss: `${ICON.BROKEN} <b>ЧЕЛЕНДЖ ВІДХИЛЕНО.</b> Громада відчула халяву.`,
        
        debtStillExists: `\n\n${ICON.WARN} Оскільки ти все ще боржник, вогник не повернуто. Здавай далі!`,

        votingNotActive: "Голосування вже неактуальне.",

        cancelAttempt: "Спроба анульована.",

        countVote: "Твій голос враховано",

        offerRestore: `⚡️ <b>Борги закрито!</b>\nБажаєш повернути свій вогник 🔥 через спецзавдання?`,

    },
}

module.exports = {
    MESSAGES,
    sendReply 
};