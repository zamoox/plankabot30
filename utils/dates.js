const getDaysPassed = () => {
    const start = new Date(2026, 2, 19); 
    const now = new Date();
    const kyivDate = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Kyiv"}));
    kyivDate.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((kyivDate - start) / (1000 * 60 * 60 * 24)) + 1);
};

const getTargetToday = () => {
    return 30 + (Math.max(0, getDaysPassed() - 1) * 5);
};

module.exports = { getDaysPassed, getTargetToday };