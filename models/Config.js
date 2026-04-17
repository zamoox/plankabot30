const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
    challengeLimit: { type: Number, default: 30 },
    isExtended: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Config', configSchema, 'config');