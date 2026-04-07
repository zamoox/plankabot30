const ICON = {
    FIRE: '🔥',
    BROKEN: '🦾',
    DEBTOR: '🔻',
    MEDALS: ['🥇', '🥈', '🥉'],
    TARGET: '⏱',
    STAT: '📊',
    BOLT: '⚡️',
    DEFAULT: '👤'
};

const FOOTER = {
    REMIND: "\nПідтягуйте хвости, пацани! Чекаємо відоси! 👇",
    RULES: "\n*Тримай спину рівно, а дух міцним!* ⚡️"
};

const VIDEO = {
    successHigh: (sec) => `${ICON.FIRE} Ого, машина! Перевиконав план (+${sec} сек).`,
    successOk: `✅ Красава! Чітко в таймінг.`,
    alreadyDone: (name, comp, day) => `✋ Гальмуй, ${name}! Вже виконано (${comp}/${day} дн.).`,
    tooShort: (insult, sec) => `🤬 ${insult} (${sec} сек — це несерйозно)`,
    tooLow: (target, sec) => `${ICON.WARN} Малувато! Треба було ${target} сек, а в тебе ${sec}.`,
    statsSuffix: (comp, day, streak, icon, total) => 
        `${ICON.STAT} Результат: ${comp}/${day} дн.\n${ICON.BOLT} Стрік: ${streak} ${icon} | Всього: *${total} сек.*`
};

module.exports = {
    ICON,
    FOOTER,
    VIDEO,
};


