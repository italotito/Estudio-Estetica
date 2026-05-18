const axios = require('axios');
const fs = require('fs');
const https = require('https');
const env = require('../config/env');

const getInterAgent = () => {
    try {
        if (!fs.existsSync(env.INTER_CERT_PATH) || !fs.existsSync(env.INTER_KEY_PATH)) {
            console.warn('Banco Inter certificates not found. Using MOCK MODE.');
            return null;
        }
        const cert = fs.readFileSync(env.INTER_CERT_PATH);
        const key = fs.readFileSync(env.INTER_KEY_PATH);
        return new https.Agent({
            cert,
            key,
            // SECURITY FIX: rejectUnauthorized MUST be true in production to prevent MITM
            rejectUnauthorized: true, 
        });
    } catch (e) {
        console.error('Error loading certificates:', e.message);
        return null;
    }
};

const getInterToken = async (agent) => {
    try {
        const params = new URLSearchParams();
        params.append('client_id', env.INTER_CLIENT_ID);
        params.append('client_secret', env.INTER_CLIENT_SECRET);
        params.append('grant_type', 'client_credentials');
        params.append('scope', 'cob.write cob.read pix.write pix.read webhook.write webhook.read');

        const response = await axios.post(env.INTER_AUTH_URL, params, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Inter Token:', error.response ? error.response.data : error.message);
        throw new Error('Auth Failed');
    }
};

const createPixCharge = async (txid, buyer, value, serviceName) => {
    const agent = getInterAgent();
    
    if (env.MOCK_MODE || !agent) {
        console.log('Using MOCK MODE (Inter) for charge creation.');
        const mockPixCode = "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913" + buyer.firstName + "6008Brasilia62070503***6304E2CA";
        return {
            qrcode: {
                content: mockPixCode,
                base64: "https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=" + encodeURIComponent(mockPixCode)
            },
            txid: "MOCK-TXID-" + Date.now()
        };
    }

    const accessToken = await getInterToken(agent);

    if (!env.INTER_PIX_KEY) throw new Error("INTER_PIX_KEY not configured in .env");

        const cleanDoc = buyer.document.replace(/\D/g, '');
        const devedor = {
            nome: `${buyer.firstName} ${buyer.lastName}`.trim()
        };
        if (cleanDoc.length === 14) devedor.cnpj = cleanDoc;
        else devedor.cpf = cleanDoc;

        const chargePayload = {
            calendario: { expiracao: 3600 },
            devedor,
        valor: { original: value.toFixed(2) },
        chave: env.INTER_PIX_KEY,
        solicitacaoPagador: `Pagamento ${serviceName}`,
        infoAdicionais: [
            { nome: 'Referência', valor: txid }
        ]
    };

    const response = await axios.post(`${env.INTER_API_URL}/cob`, chargePayload, {
        httpsAgent: agent,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    const pixCode = response.data.pixCopiaECola;
    const interTxid = response.data.txid;

    const qrCodeImageUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(pixCode)}`;

    return {
        qrcode: {
            content: pixCode,
            base64: qrCodeImageUrl 
        },
        txid: interTxid
    };
};

module.exports = {
    createPixCharge
};
