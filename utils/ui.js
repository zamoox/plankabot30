const { MESSAGES } = require('./messages');

const UI = {
    // Базові налаштування для всіх відповідей
    defaultOptions: {
        parse_mode: 'HTML',
        disable_web_page_preview: true
    },

    // Відповідь на відео (успішна здача)
    async sendVideoSuccess(ctx, { updatedUser, personalDay, duration, target, challengeText, extraMarkup }) {
        const text = MESSAGES.video.finalMsg(challengeText, updatedUser, personalDay, duration, target);
        
        return ctx.reply(text, {
            ...this.defaultOptions,
            reply_to_message_id: ctx.message.message_id,
            reply_markup: extraMarkup
        });
    },

    // Вивід таблиці лідерів
    async sendLeaderboard(ctx, { users, day, target, isTestMode }) {
        let msg = MESSAGES.stats.statsHeader(day, target);

        if (users.length === 0) {
            msg += MESSAGES.stats.noStats;
        } else {
            users.forEach((user, position) => {
                const diff = (user.personalDay || day) - user.completed;
                const isDebtor = diff >= 2;
                msg += MESSAGES.stats.userInfo(user, position, isDebtor, diff, user.personalDay || day);
            });
        }

        const prefix = isTestMode ? '🛠 <b>[TEST MODE]</b>\n' : '';
        return ctx.reply(prefix + msg, this.defaultOptions);
    },

    // Спільний метод для простих відповідей (Guide, Errors, etc.)
    async sendSimple(ctx, text, options = {}) {
        return ctx.reply(text, { ...this.defaultOptions, ...options });
    }
};

module.exports = UI;