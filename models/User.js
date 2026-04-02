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
    canRestore: { type: Boolean, default: false },
    // Текст рандомного завдання, який випав юзеру (щоб вивести його в описі голосування)
    activeChallenge: { type: String, default: null },

    // ID повідомлення з голосуванням (допоможе боту зрозуміти, за кого голосують)
    activePollId: { type: String, default: null }

});

module.exports = mongoose.model('User', userSchema);