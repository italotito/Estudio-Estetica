const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const env = require('../config/env');
const receiptGenerator = require('./receiptGenerator');
const db = require('./database');

/**
 * Envia uma notificação WhatsApp para o admin quando um pagamento é confirmado.
 * Utiliza whatsapp-web.js para emular um cliente WhatsApp Web.
 */

const isMockMode = () => {
    return env.WHATSAPP_MOCK_MODE || !env.WHATSAPP_ADMIN_PHONE;
};

// Inicializa o cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Salva a sessão para que você não precise escanear o QR code toda vez
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    console.log('\n======================================================');
    console.log('[WhatsApp] SCANEIE O QR CODE ABAIXO PARA AUTENTICAR');
    console.log('======================================================\n');
    qrcode.generate(qr, { small: true });
});

client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Autenticação falhou:', msg);
});

client.on('ready', () => {
    console.log('\n✅ [WhatsApp] Cliente está pronto e conectado!\n');
    isClientReady = true;
});

// -------- INBOUND MESSAGES (CONFIRMAR / CANCELAR) --------
client.on('message', async (msg) => {
    // Processa apenas respostas de texto puros de usuários reais (não status ou grupos)
    if (msg.isStatus || msg.from.includes('@g.us') || !msg.body) return;

    const senderPhone = msg.from.split('@')[0]; // Formato: 5511999999999
    let incomingText = msg.body.trim();

    // Verifica se a resposta é exatamente '1' ou '2'
    if (incomingText === '1' || incomingText === '2') {
        try {
            // Encontra todas as agendamentos que correspondem a este número de telefone que estão acontecendo HOJE
            const todayStr = new Date().toISOString().split('T')[0];
            const appointments = await db.loadAppointments();

            // Verifica se o telefone do remetente corresponde ao telefone do cliente, sanitiza ambos
            const sanitizePhone = (p) => p ? String(p).replace(/\D/g, '') : '';

            const clientAppointments = appointments.filter(a => {
                if (!a.clientPhone || a.status !== 'paid') return false;
                let dbPhone = sanitizePhone(a.clientPhone);
                if (dbPhone.length === 10 || dbPhone.length === 11) dbPhone = '55' + dbPhone;

                // Verifica se o agendamento é para hoje e se não foi cancelado
                return dbPhone === senderPhone && a.date === todayStr && a.status !== 'cancelled';
            });

            if (clientAppointments.length > 0) {
                // Pega o último ou primeiro encontrado para hoje
                const appointment = clientAppointments[clientAppointments.length - 1];

                if (incomingText === '1') {
                    // Confirmação
                    await db.updateAppointment(appointment.id, { clientConfirmed: true });
                    await msg.reply('✅ Perfeito! Seu agendamento foi confirmado. Estamos te esperando!');
                    console.log(`[WhatsApp] Appointment ${appointment.id} confirmed via reply from ${senderPhone}.`);

                    // (Optional) Notifica o admin que o cliente confirmou
                    if (env.WHATSAPP_ADMIN_PHONE) {
                        let adminPhone = '55' + String(env.WHATSAPP_ADMIN_PHONE).replace(/\D/g, '');
                        if (adminPhone !== '55' + senderPhone) {
                            client.sendMessage(`${adminPhone}@c.us`, `✅ O cliente *${appointment.clientName}* acabou de confirmar presença para hoje às *${appointment.time}*.`);
                        }
                    }

                } else if (incomingText === '2') {
                    // Cancelamento 
                    await db.updateAppointment(appointment.id, { status: 'cancelled' });
                    await msg.reply('❌ Seu agendamento foi cancelado. Você pode reagendar pelo nosso site quando quiser!');
                    console.log(`[WhatsApp] Appointment ${appointment.id} CANCELLED via reply from ${senderPhone}.`);

                    // Notifica o admin que o agendamento foi cancelado
                    if (env.WHATSAPP_ADMIN_PHONE) {
                        let adminPhone = '55' + String(env.WHATSAPP_ADMIN_PHONE).replace(/\D/g, '');
                        if (adminPhone !== '55' + senderPhone) {
                            client.sendMessage(`${adminPhone}@c.us`, `❌ ATENÇÃO: O cliente *${appointment.clientName}* acabou de CANCELAR o horário de hoje às *${appointment.time}*.`);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[WhatsApp] Error handling inward message:', err);
        }
    }
});

client.on('disconnected', (reason) => {
    console.log('\n❌ [WhatsApp] Client was logged out', reason);
    isClientReady = false;
});

// Como whatsappNotifier é requerido por outros módulos, iniciamos o cliente imediatamente 
// mas apenas se não estivermos em modo de mock.
if (!isMockMode()) {
    console.log('[WhatsApp] Initializing WhatsApp Web Client...');
    client.initialize().catch(err => {
        console.error('[WhatsApp] Failed to initialize client:', err);
    });
}


/**
 * Formata uma mensagem de confirmação de pagamento
 */
const formatMessage = (appointment) => {
    const paidAt = appointment.paidAt
        ? new Date(appointment.paidAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    let message = `✅ *Pagamento Confirmado!*\n\n` +
        `👤 *Cliente:* ${appointment.clientName}\n` +
        `💇 *Serviço:* ${appointment.service}\n` +
        `💰 *Valor Pago:* R$ ${parseFloat(appointment.paidValue || appointment.value).toFixed(2)}\n` +
        `📅 *Data do Pagamento:* ${paidAt}\n` +
        `📧 *Email:* ${appointment.clientEmail || 'N/A'}\n` +
        `🔖 *Referência:* ${appointment.id}\n`;

    if (appointment.endToEndId) {
        message += `\n🧾 *COMPROVANTE PIX:*\n` +
            `▫️ *ID da Transação:* ${appointment.endToEndId}\n`;
        if (appointment.infoPagador) {
            message += `▫️ *Obs:* ${appointment.infoPagador}\n`;
        }
    }

    message += `\n_Notificação automática - Estúdio Estética_`;

    return message;
};


/**
 * Envia uma notificação WhatsApp para o admin e o cliente quando um pagamento é confirmado.
 * @param {Object} appointment - Os dados do agendamento
 * @returns {Promise<Object>} - Resultado da operação
 */
async function sendPaymentConfirmation(appointment) {
    try {
        if (isMockMode()) {
            console.log('\n=== [MOCK INFO] WhatsApp Notification ===');
            console.log('Admin:', env.WHATSAPP_ADMIN_PHONE || '(não configurado)');
            if (appointment.clientPhone) {
                console.log('Client:', appointment.clientPhone);
            }
            console.log('Message Content:\n', formatMessage(appointment));
            console.log('=== [MOCK INFO] WhatsApp Notification End ===\n');
            return { mock: true, success: true };
        }

        const message = formatMessage(appointment);

        if (!isClientReady) {
            console.warn('[WhatsApp] Cannot send message because client is not ready. Is the QR code scanned?');
            return { mock: false, success: false, error: 'Client not ready' };
        }

        // whatsapp-web.js requer números no formato: 5511999999999@c.us
        // Vamos sanitizar o número do telefone do admin
        let phoneStr = String(env.WHATSAPP_ADMIN_PHONE).replace(/\D/g, ''); // Remove non-digits

        // Garante que tenha o código do país (Brazil 55 se tiver 10 ou 11 dígitos)
        if (phoneStr.length === 10 || phoneStr.length === 11) {
            phoneStr = '55' + phoneStr;
        }

        // Resolvendo o número via API do WhatsApp para garantir o ID correto @c.us / @s.whatsapp.net
        // Previne o erro "No LID for user" (comum com o nono dígito brasileiro)
        const numberId = await client.getNumberId(phoneStr);

        if (!numberId) {
            console.error(`[WhatsApp] The phone number ${phoneStr} is not registered on WhatsApp.`);
            return { mock: false, success: false, error: 'Number not registered on WhatsApp' };
        }

        const chatId = numberId._serialized;

        let sendMessageOptions = {};

        // Gera o PDF do comprovante se não estiver em modo de mock (opcional, mas necessário para enviar real)
        try {
            const pdfBase64 = await receiptGenerator.generateReceiptBase64(appointment);
            const media = new MessageMedia('application/pdf', pdfBase64, `Comprovante_${appointment.txid || appointment.id}.pdf`);
            sendMessageOptions.media = media;
        } catch (pdfError) {
            console.error('[WhatsApp] Failed to generate PDF receipt, sending message text only:', pdfError);
        }

        const result = await client.sendMessage(chatId, message, sendMessageOptions);
        console.log(`[WhatsApp] Message successfully sent to admin (${phoneStr}). Message ID: ${result.id.id}`);

        // --- SEGUNDA NOTIFICAÇÃO (AO CLIENTE) ---
        if (appointment.clientPhone) {
            let clientPhoneStr = String(appointment.clientPhone).replace(/\D/g, ''); // Remove non-digits

            // Presume numeros brasileiros com tamanho 10 ou 11 digitos
            if (clientPhoneStr.length === 10 || clientPhoneStr.length === 11) {
                clientPhoneStr = '55' + clientPhoneStr;
            }

            try {
                const clientNumberId = await client.getNumberId(clientPhoneStr);
                if (clientNumberId) {
                    const clientChatId = clientNumberId._serialized;
                    const clientResult = await client.sendMessage(clientChatId, message, sendMessageOptions);
                    console.log(`[WhatsApp] Mensagem enviada com sucesso para o cliente (${clientPhoneStr}). ID da mensagem: ${clientResult.id.id}`);
                } else {
                    console.log(`[WhatsApp] Ignorando notificação ao cliente. O número ${clientPhoneStr} não está registrado no WhatsApp.`);
                }
            } catch (clientSendErr) {
                console.error(`[WhatsApp] Erro ao enviar mensagem para o cliente (${clientPhoneStr}):`, clientSendErr.message);
            }
        }

        return { mock: false, success: true, messageId: result.id.id };

    } catch (error) {
        // CRITICAL: Nunca deixe erros do WhatsApp quebrarem o fluxo do webhook
        console.error('[WhatsApp] Erro ao enviar notificação:', error.message);
        return { mock: false, success: false, error: error.message };
    }
};

module.exports = {
    client,
    isClientReady,
    sendPaymentConfirmation,
    formatMessage,
    isMockMode
};
