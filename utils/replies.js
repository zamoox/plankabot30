const getGopStyleInsult = () => {
    const phrases = [
        "Чуєш, ти шо, на приколі? Де решта секунд? 🤨",
        "Слишиш, це шо за фізкультура для малят?",
        "Ти кому це фуфло впарюєш? Навіть 30 сек не було — не пацан!",
        "Шось ти слабо газуєш, дядя. Сімки-вісімки не канають!"
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
};

// Функція-обгортка для відповідей (додає префікс у тесті)
const sendReply = (ctx, text, extra = {}) => {
    const prefix = testMode ? '🛠 [TEST MODE]\n' : '';
    // Виправляємо помилку: якщо extra не об'єкт (наприклад, Markdown), обробляємо це
    const options = typeof extra === 'string' ? { parse_mode: extra } : extra;
    return ctx.reply(prefix + text, { parse_mode: 'Markdown', ...options });
};

module.exports = { getGopStyleInsult, sendReply };