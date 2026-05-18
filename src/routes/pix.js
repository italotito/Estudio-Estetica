const express = require('express');
const router = express.Router();
const interPix = require('../services/interPix');
const db = require('../services/database');
const env = require('../config/env');
const whatsapp = require('../services/whatsappNotifier');

// Gerar PIX (Banco Inter)
router.post('/generate', async (req, res) => {
    const { buyer, value, referenceId, serviceName } = req.body;

    if (!buyer || !value || !referenceId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Remove non-digit characters to check format
    const cleanPhone = buyer?.phone ? String(buyer.phone).replace(/\D/g, '') : null;

    try {
        console.log(`Generating PIX (Inter) for ${referenceId} - Value: ${value}`);

        const result = await interPix.createPixCharge(referenceId, buyer, value, serviceName);

        // Save appointment locally
        await db.insertAppointment({
            id: referenceId,
            txid: result.txid,
            date: date || new Date().toISOString().split('T')[0], // Use provided date or fallback to current day
            time: time || '09:00', // Use provided time or fallback
            clientName: `${buyer.firstName} ${buyer.lastName}`.trim(),
            clientEmail: buyer.email,
            clientPhone: cleanPhone,
            service: serviceName || "Serviço Estética",
            value: value,
            status: 'pending',
            provider: env.MOCK_MODE ? 'inter_mock' : 'inter',
            clientConfirmed: false // Important for the scheduled reminders
        });

        res.json(result);

    } catch (error) {
        console.error('Error in PIX generation route:', error.message);
        res.status(500).json({ error: 'Failed to generate PIX payment', details: error.message });
    }
});

// Banco Inter Webhook para chamadas Pix Callbacks
router.post('/webhook', async (req, res) => {
    try {
        // Inter envia um array de objetos "pix" dentro do corpo quando um pagamento acontece
        const { pix } = req.body;

        if (!pix || !Array.isArray(pix)) {
            return res.status(400).json({ error: 'Invalid webhook payload' });
        }

        for (const p of pix) {
            const { txid, valor, endToEndId, infoPagador } = p;

            // Encontra o agendamento pendente pelo txid
            const appointments = await db.loadAppointments();
            const appointment = appointments.find(a => a.txid === txid && a.status === 'pending');

            if (appointment) {
                console.log(`[Webhook] Pix received for txid ${txid}. Updating appointment ${appointment.id} to paid.`);

                const paidAt = p.horario || new Date().toISOString();

                // Atualiza o status para 'paid' pago
                const updateData = {
                    status: 'paid',
                    paidAt: paidAt,
                    paidValue: valor,
                    endToEndId: endToEndId || null,
                    infoPagador: infoPagador || null
                };

                await db.updateAppointment(appointment.id, updateData);

                // Envia notificação WhatsApp ao administrador (fire-and-forget)
                const updatedAppointment = { ...appointment, ...updateData };
                whatsapp.sendPaymentConfirmation(updatedAppointment)
                    .then(result => {
                        if (result.success) {
                            console.log(`[Webhook] WhatsApp notification sent for appointment ${appointment.id}`);
                        }
                    })
                    .catch(() => { }); // Já processado dentro do serviço

            } else {
                console.log(`[Webhook] Received Pix for txid ${txid} but no pending appointment was found.`);
            }
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('Error processing Pix webhook:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
