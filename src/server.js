const express = require('express');
const cors = require('cors');
const comicRoutes = require('./routes/comicRoutes');
const config = require('./config/config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/comics', comicRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Start the server with port fallback
function startServer(port) {
    app.listen(port, () => {
        console.log(`🚀 Server running at http://localhost:${port}`);
        console.log(`📚 Comics API available at http://localhost:${port}/api/comics`);
        console.log(`🖼️ Panel API available at http://localhost:${port}/api/comics/panels`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is in use, trying port ${port + 1}`);
            startServer(port + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

// Start the server
startServer(config.server.startPort); 