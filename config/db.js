// Підключення до БД з перевіркою назви бази
const mongoose = require('mongoose');

const connectDB = async (uri) => {
    try {
        const conn = await mongoose.connect(uri);
        console.log(`📂 Назва бази в Atlas: ${mongoose.connection.name}`);
    } catch (err) {
        console.error(`❌ Помилка підключення до БД: ${err.message}`);
        process.exit(1); // Зупиняємо бота, якщо база не підключилася
    }
};

module.exports = connectDB;