const mongoose = require('mongoose');

// Схема користувача
const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true },
    name: String,
    completed: { type: Number, default: 0 },
    totalSeconds: { type: Number, default: 0 }
});

module.exports = mongoose.model('User', userSchema);