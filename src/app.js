const express = require('express');
const cors = require('cors');
const winston = require('winston');
const app = express();
// Create logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`)
    ),
    transports: [new winston.transports.Console()]
});
// 🟢 CORS Configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
// Global middleware
app.use(express.json());
// Log every request
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`);
    next();
});
// Routes
const authRoutes = require('./routes/authRoutes');
const rideRoutes = require('./routes/rideRoutes');
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/admin', adminRoutes);
app.get('/', (req, res) => {
    logger.info('Home route hit');
    res.send("Ride Partner Backend is running smoothly!");
});

app.logger = logger;
module.exports = app;