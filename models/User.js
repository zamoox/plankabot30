const mongoose = require('mongoose');

// Схема користувача
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    name: String,
    completed: { type: Number, default: 0 },
    totalSeconds: { type: Number, default: 0 },
    maxStreak: {type: Number, default: 0},
    currentStreak: {type: Number, default: 0},
    isBroken: {type: Boolean, default: false}
});

module.exports = mongoose.model('User', userSchema);