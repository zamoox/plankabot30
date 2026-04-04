const { DateTime } = require('luxon');

const START_DATE = { year: 2026, month: 3, day: 19 };

const getUserDaysPassed = (timezone = 'Europe/Kyiv') => {
    // const start = new Date(2026, 2, 19); 
    const start = DateTime.fromObject(START_DATE, { zone: timezone });
    const now = DateTime.now().setZone(timezone).startOf('day');

    // const kyivDate = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Kyiv"}));

    const diff = now.diff(start, 'days').days;
    
    return Math.max(1, Math.floor(diff + 1));
};

const getTargetForToday = (day) => {
    return 30 + (Math.max(0, day - 1) * 5);
};

module.exports = { getUserDaysPassed, getTargetForToday };