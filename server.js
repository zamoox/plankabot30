const http = require('http');

const startServer = () => {
    const PORT = process.env.PORT || 3000;
    
    http.createServer((req, res) => {
        res.writeHead(200);
        res.end('Bot is running and healthy!');
    }).listen(PORT, () => {
        console.log(`🌐 Health-check server is live on port ${PORT}`);
    });
};

module.exports = startServer;