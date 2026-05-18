const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const APPOINTMENTS_FILE = path.join(__dirname, '..', '..', 'appointments.json');

// Ensure file exists
if (!fsSync.existsSync(APPOINTMENTS_FILE)) {
    fsSync.writeFileSync(APPOINTMENTS_FILE, '[]');
}

// Simple mutex queue to prevent race conditions during async write
let writeQueue = Promise.resolve();

const loadAppointments = async () => {
    try {
        const data = await fs.readFile(APPOINTMENTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading db file:", e);
        return [];
    }
};

const saveAppointments = async (appointments) => {
    writeQueue = writeQueue.then(async () => {
        await fs.writeFile(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
    }).catch(e => {
        console.error("Failed to write db file:", e);
    });
    return writeQueue;
};

const insertAppointment = async (appointment) => {
    const appointments = await loadAppointments();
    appointments.unshift(appointment); // Add to beginning
    await saveAppointments(appointments);
    return appointment;
};

const updateAppointment = async (id, updates) => {
    const appointments = await loadAppointments();
    const index = appointments.findIndex(a => a.id === id);
    if (index !== -1) {
        appointments[index] = { ...appointments[index], ...updates };
        await saveAppointments(appointments);
        return true;
    }
    return false;
};

const deleteAppointment = async (id) => {
    let appointments = await loadAppointments();
    const initialLength = appointments.length;
    appointments = appointments.filter(a => a.id !== id);
    if (appointments.length !== initialLength) {
        await saveAppointments(appointments);
        return true;
    }
    return false;
};

module.exports = {
    loadAppointments,
    insertAppointment,
    updateAppointment,
    deleteAppointment
};
