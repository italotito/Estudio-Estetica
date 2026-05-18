const express = require('express');
const router = express.Router();
const db = require('../services/database');
const env = require('../config/env');

// Admin Middleware
const authenticateAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === env.ADMIN_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Get Appointments
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const appointments = await db.loadAppointments();
        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load appointments' });
    }
});

// Create Appointment (Manual)
router.post('/', authenticateAdmin, async (req, res) => {
    const { clientName, service, date, value, observation } = req.body;

    if (!clientName || !service || !date || !value) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const newAppointment = {
        id: 'MANUAL-' + Date.now(),
        date,
        clientName,
        clientEmail: 'agendamento@manual.com',
        service,
        value,
        status: 'confirmed',
        observation: observation || 'Agendamento Manual'
    };

    try {
        await db.insertAppointment(newAppointment);
        res.json(newAppointment);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save appointment' });
    }
});

// Update Appointment
router.patch('/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const { observation } = req.body;

    try {
        const success = await db.updateAppointment(id, { observation });
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Appointment not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

// Delete Appointment
router.delete('/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const success = await db.deleteAppointment(id);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Appointment not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});

module.exports = router;
