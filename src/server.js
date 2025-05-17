const express = require('express');
const cors = require('cors');
const comicRoutes = require('./routes/comicRoutes');
const config = require('./config/config');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/comics', comicRoutes);

app.use((err, req, res, next) => {
    res.status(500).json({
        success: false,
        error: 'Internal Server Error'
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

function startServer(port) {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            startServer(port + 1);
        } else {
            process.exit(1);
        }
    });
}

startServer(config.server.startPort);
