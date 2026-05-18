const cron = require('node-cron');
const db = require('./database');
const whatsapp = require('./whatsappNotifier');

/**
 * Initializes the automated reminder scheduler.
 * Runs every 2 hours to check for unconfirmed appointments happening today.
 */
function initScheduler() {
    console.log('[Scheduler] Initializing automated reminders (Cron: 0 */2 * * *)');

    // Run at minute 0 past every 2nd hour (e.g., 08:00, 10:00, 12:00, 14:00, 16:00, 18:00)
    // You can adjust '* * * * *' to run every minute for testing.
    cron.schedule('0 */2 * * *', async () => {
        try {
            console.log('\n[Scheduler] Running automated appointment checks for today...');

            // If WhatsApp is not ready yet, skip this run
            if (!whatsapp.isClientReady && !whatsapp.isMockMode()) {
                console.log('[Scheduler] WhatsApp client is not ready. Skipping...');
                return;
            }

            const todayStr = new Date().toISOString().split('T')[0];
            const appointments = await db.loadAppointments();

            // Find all appointments that happen TODAY, are PAID, and NOT YET CONFIRMED
            const unconfirmedToday = appointments.filter(a => {
                return a.date === todayStr &&
                    a.status === 'paid' &&
                    a.clientConfirmed === false &&
                    a.clientPhone;
            });

            if (unconfirmedToday.length === 0) {
                console.log('[Scheduler] No unconfirmed appointments found for today.');
                return;
            }

            console.log(`[Scheduler] Found ${unconfirmedToday.length} appointments requiring confirmation.`);

            for (const appointment of unconfirmedToday) {
                let clientPhoneStr = String(appointment.clientPhone).replace(/\D/g, ''); // Remove non-digits
                if (clientPhoneStr.length === 10 || clientPhoneStr.length === 11) {
                    clientPhoneStr = '55' + clientPhoneStr;
                }

                const message = `Olá *${appointment.clientName}*,\n\nSeu agendamento para *${appointment.service}* é hoje às *${appointment.time}*!\n\nPor favor, responda:\n*1* para confirmar sua presença.\n*2* para cancelar.`;

                if (whatsapp.isMockMode()) {
                    console.log(`[Scheduler MOCK] Sending reminder to ${clientPhoneStr}: \n${message}`);
                } else {
                    try {
                        const clientNumberId = await whatsapp.client.getNumberId(clientPhoneStr);
                        if (clientNumberId) {
                            const clientChatId = clientNumberId._serialized;
                            await whatsapp.client.sendMessage(clientChatId, message);
                            console.log(`[Scheduler] Reminder successfully sent to ${clientPhoneStr}. (Apt: ${appointment.id})`);
                        } else {
                            console.log(`[Scheduler] The phone number ${clientPhoneStr} is not registered on WhatsApp.`);
                        }
                    } catch (sendErr) {
                        console.error(`[Scheduler] Error sending reminder to ${clientPhoneStr}:`, sendErr.message);
                    }
                }
            }

            console.log('[Scheduler] Finished automated checks.\n');

        } catch (error) {
            console.error('[Scheduler] Error running cron job:', error);
        }
    });
}

module.exports = {
    initScheduler
};
