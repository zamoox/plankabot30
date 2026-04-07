const { ICON, FOOTER } = require('./messages');

const COMMANDS = {
    stats: {
        statsHeader: (day, target) => 
            `🏆 <b>ТАБЛИЦЯ ЛІДЕРІВ</b> (День ${day})\n${ICON.TARGET} Ціль: <b>${target} сек</b>\n--------------------------\n`,
        
        userIcon: (isDebtor, position) => isDebtor ? ICON.DEBTOR : 
            (position === 0 ? ICON.MEDALS[0] : position === 1 ? ICON.MEDALS[1] : position === 2 ? ICON.MEDALS[2] : ICON.DEFAULT),

        userDebtorText: (isDebtor, diff) => isDebtor ? ` <i>(Борг: ${diff} дн.)</i>` : '',

        userStreak: (u) => (!u.isBroken ? ` ${u.currentStreak} 🔥` : ` ${u.currentStreak}`),

        // ВИПРАВЛЕНО: Прибрано this, виправлено конкатенацію рядків
        userInfo: (user, position, isDebtor, diff, personalDays) => {

            const userIcon = COMMANDS.stats.userIcon(isDebtor, position);
            const debtorText = COMMANDS.stats.userDebtorText(isDebtor, diff);
            const userStreak = COMMANDS.stats.userStreak(user);
            
            return `${userIcon} <b>${user.name || 'Анонім'}</b>${debtorText}\n` +
                   `└ Днів: ${user.completed}/${personalDays} | Рекорд: ${user.maxStreak || 0} | Стрік:${userStreak}\n` +
                   `└ Всього: <b>${user.totalSeconds} сек.</b>\n\n`;
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

        notNeeded: `😎 Твій вогник і так горить ${ICON.FIRE}!`,

        locked: (debt, word) => `${ICON.WARN} Доступ заблоковано!\n\n` +
            `Ти не можеш повернути вогник, поки маєш борги. \n` +
            `Тобі треба здати ${debt} ${word}, щоб наздогнати групу. \n\n` +
            `Здай борги, і тоді приходь за челенджем! 👊`,

        poll: (task, name) => `\n\n🥁 ЗВІТ-ЧЕЛЕНДЖ!\nЗавдання: "${task}"\nДаємо вогник для ${name} ${ICON.FIRE}?!`,

        win: (name) => `${ICON.FIRE} <b>ВОГНИК ПОВЕРНУТО!</b>\n\nГромада схвалила ${name}.`,

        loss: `${ICON.BROKEN} <b>ЧЕЛЕНДЖ ВІДХИЛЕНО.</b> Громада відчула халяву.`,
        
        debtStillExists: `\n\n${ICON.DEBTOR} Ти все ще боржник, вогник не повернуто.`
    },
}

module.exports = {
    COMMANDS
};