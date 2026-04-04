const { User } = require('../models/User');
const { getDaysPassed, getTargetToday } = require('./dates');

const getUserContext = async (userId, userName = 'Анонім') => {
    const user = await User.findOne({ userId });

    const timezone = user?.timezone || 'Europe/Kyiv';

    const personalDay = getDaysPassed(timezone);

    const personalTarget = getTargetToday(personalDay);

    return { 
        user, 
        userName: user?.name || userName,
        personalDay, 
        personalTarget,
        timezone,
    };
}

module.exports = { getUserContext };

