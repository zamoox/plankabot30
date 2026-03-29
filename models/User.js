const mongoose = require('mongoose');

// Схема користувача
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    name: String,
    completed: { type: Number, default: 0 },
    totalSeconds: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    isBroken: { type: Boolean, default: false },
    // Нові поля для логіки відновлення:
    lastActivityDate: { type: Date, default: Date.now }, 
    savedStreakBeforeBreak: { type: Number, default: 0 }, // Зберігаємо стрік тут, коли isBroken стає true
    restoreAvailable: { type: Boolean, default: true }   // Чи може користувач відновити (одноразово/раз на період)
});

module.exports = mongoose.model('User', userSchema);