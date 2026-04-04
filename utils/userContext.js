const User = require('../models/User');
const { getUserDaysPassed, getTargetForToday } = require('./dates');

const getUserContext = async (userId, userName = 'Анонім') => {
    const user = await User.findOne({ userId });

    const timezone = user?.timezone || 'Europe/Kyiv';

    const personalDay = getUserDaysPassed(timezone);

    const personalTarget = getTargetForToday(personalDay);

    return { 
        user, 
        userName: user?.name || userName,
        personalDay, 
        personalTarget,
        timezone,
    };
}

module.exports = { getUserContext };

