/**
 * Test script for WhatsApp notification service.
 * Usage: node test_whatsapp.js
 * 
 * Tests the notification both in mock mode and (if configured) with the real API.
 */

const env = require('./src/config/env');
const whatsapp = require('./src/services/whatsappNotifier');

const mockAppointment = {
    id: 'TEST-REF-002',
    txid: 'TEST-TXID-002',
    clientName: 'Maria Silva',
    clientEmail: 'maria@email.com',
    clientPhone: env.WHATSAPP_ADMIN_PHONE, // Test using the admin phone
    service: 'Depilação a Cera - Perna Completa',
    value: 50.00,
    paidValue: '50.00',
    date: new Date().toISOString().split('T')[0], // TODAY
    time: '14:30',
    paidAt: new Date().toISOString(),
    status: 'paid',
    clientConfirmed: false,
    endToEndId: 'E0000000020260307225012345678901',
    infoPagador: 'Pagamento via app Inter'
};

async function main() {
    console.log('=== WhatsApp Notification Test ===\n');

    console.log('Mock mode:', whatsapp.isMockMode() ? 'YES' : 'NO');
    console.log('');

    // Test message formatting
    console.log('--- Formatted Message Preview ---');
    console.log(whatsapp.formatMessage(mockAppointment));
    console.log('');

    // Test sending
    console.log('--- Sending Test Notification ---');
    console.log('Waiting for WhatsApp client to be ready... Please scan the QR code if it appears.');

    // In real mode, we must wait for the client to be fully ready before sending
    if (!whatsapp.isMockMode()) {
        const checkReady = setInterval(async () => {
            if (whatsapp.client && whatsapp.client.info) {
                clearInterval(checkReady);
                console.log('\nClient is ready. Proceeding to send test message...');
                await runTest();
            }
        }, 2000);
    } else {
        await runTest();
    }
}

async function runTest() {
    const result = await whatsapp.sendPaymentConfirmation(mockAppointment);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.success) {
        console.log('\n✅ Test passed!');
    } else {
        console.log('\n❌ Test failed:', result.error);
    }

    // If not mock mode, wait a bit before exiting to ensure message is sent
    if (!whatsapp.isMockMode()) {
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    } else {
        process.exit(0);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
