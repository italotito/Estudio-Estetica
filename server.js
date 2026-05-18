const express = require('express');
const cors = require('cors');
const env = require('./src/config/env');
const whatsapp = require('./src/services/whatsappNotifier');
const reminderScheduler = require('./src/services/reminderScheduler');

const authRoutes = require('./src/routes/auth');
const appointmentRoutes = require('./src/routes/appointments');
const pixRoutes = require('./src/routes/pix');

const app = express();

app.use(cors());
app.use(express.json());

// Main entry point for static testing if needed or just api routes
app.use('/api/auth', authRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/pix', pixRoutes);

app.use((req, res, next) => {
    res.status(404).json({ error: 'Route not found' });
});

// Init WhatsApp Client
console.log('Initializing WhatsApp Client...');
whatsapp.client.initialize().catch(err => {
    console.error('Failed to initialize WhatsApp during server startup:', err);
});

// Start the reminder scheduler (runs every 2 hours)
reminderScheduler.initScheduler();

app.listen(env.PORT, () => {
    console.log(`Server running at http://localhost:${env.PORT}`);
    console.log(`Environment mode: MOCK_MODE=${env.MOCK_MODE}`);
});
