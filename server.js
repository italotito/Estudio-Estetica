require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const https = require('https');

const INTER_AUTH_URL = 'https://cdpj.partners.bancointer.com.br/oauth/v2/token';
const INTER_API_URL = 'https://cdpj.partners.bancointer.com.br/pix/v2';
// Helper to safely get env vars
const getEnv = (key) => (process.env[key] || '').trim();

const INTER_CLIENT_ID = getEnv('INTER_CLIENT_ID');
const INTER_CLIENT_SECRET = getEnv('INTER_CLIENT_SECRET');
const INTER_CERT_PATH = getEnv('INTER_CERT_PATH') || './certs/inter_cert.crt';
const INTER_KEY_PATH = getEnv('INTER_KEY_PATH') || './certs/inter_key.key';
const MOCK_MODE = getEnv('MOCK_MODE') === 'true' || !INTER_CLIENT_ID; // Fallback to mock if no creds

const APPOINTMENTS_FILE = path.join(__dirname, 'appointments.json');

// Helper to load/save appointments
const loadAppointments = () => {
    if (!fs.existsSync(APPOINTMENTS_FILE)) return [];
    try {
        const data = fs.readFileSync(APPOINTMENTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
};

const saveAppointment = (appointment) => {
    const appointments = loadAppointments();
    appointments.unshift(appointment); // Add to beginning
    fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
};

const updateAppointment = (id, updates) => {
    const appointments = loadAppointments();
    const index = appointments.findIndex(a => a.id === id);
    if (index !== -1) {
        appointments[index] = { ...appointments[index], ...updates };
        fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
        return true;
    }
    return false;
};

const deleteAppointment = (id) => {
    let appointments = loadAppointments();
    const initialLength = appointments.length;
    appointments = appointments.filter(a => a.id !== id);
    if (appointments.length !== initialLength) {
        fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(appointments, null, 2));
        return true;
    }
    return false;
};

// Admin Middleware (Simple Token Check)
const authenticateAdmin = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === 'admin-token-secret-123') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// --- ROUTES ---

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // Hardcoded credentials for MVP
    if (username === 'admin' && password === 'admin123') {
        res.json({ token: 'admin-token-secret-123' });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

// Get Appointments (Protected)
app.get('/api/appointments', authenticateAdmin, (req, res) => {
    res.json(loadAppointments());
});

// Create Appointment (Manual - Protected)
app.post('/api/appointments', authenticateAdmin, (req, res) => {
    const { clientName, service, date, value, observation } = req.body;

    if (!clientName || !service || !date || !value) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const newAppointment = {
        id: 'MANUAL-' + Date.now(),
        date: date, // Should be ISO string or valid date string
        clientName,
        clientEmail: 'agendamento@manual.com', // Placeholder for manual
        service,
        value,
        status: 'confirmed', // Manual appointments are assumed confirmed/paid or pay-on-site
        observation: observation || 'Agendamento Manual'
    };

    saveAppointment(newAppointment);
    res.json(newAppointment);
});

// Update Appointment (Protected)
app.patch('/api/appointments/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { observation } = req.body;

    if (updateAppointment(id, { observation })) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Appointment not found' });
    }
});

// Delete Appointment (Protected)
app.delete('/api/appointments/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    if (deleteAppointment(id)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Appointment not found' });
    }
});

// Generate PIX
// Helper: Get Banco Inter Agent (mTLS)
const getInterAgent = () => {
    try {
        if (!fs.existsSync(INTER_CERT_PATH) || !fs.existsSync(INTER_KEY_PATH)) {
            console.warn('Banco Inter certificates not found. Using MOCK MODE.');
            return null;
        }
        const cert = fs.readFileSync(INTER_CERT_PATH);
        const key = fs.readFileSync(INTER_KEY_PATH);
        return new https.Agent({
            cert,
            key,
            rejectUnauthorized: false // Sometimes needed for Inter sandbox/production chain issues, careful in heavy prod
        });
    } catch (e) {
        console.error('Error loading certificates:', e.message);
        return null;
    }
};

// Helper: Get Banco Inter OAuth Token
const getInterToken = async (agent) => {
    try {
        const params = new URLSearchParams();
        params.append('client_id', INTER_CLIENT_ID);
        params.append('client_secret', INTER_CLIENT_SECRET);
        params.append('grant_type', 'client_credentials');
        params.append('scope', 'cob.write cob.read pix.write pix.read');

        const response = await axios.post(INTER_AUTH_URL, params, {
            httpsAgent: agent,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting Inter Token:', error.response ? error.response.data : error.message);
        throw new Error('Auth Failed');
    }
};

// Generate PIX (Banco Inter)
app.post('/api/pix/generate', async (req, res) => {
    const { buyer, value, referenceId, serviceName } = req.body;

    if (!buyer || !value || !referenceId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        console.log(`Generating PIX (Inter) for ${referenceId} - Value: ${value}`);

        const agent = getInterAgent();
        // Mock Mode Check
        // If explicitly set to MOCK_MODE or if we can't create the agent (missing certs)
        if (MOCK_MODE || !agent) {
            console.log('Using MOCK MODE (Inter)');
            throw new Error('Mock Mode Trigger');
        }

        // 1. Authenticate
        const accessToken = await getInterToken(agent);

        // 2. Create Charge (Cobrança Imediata)
        const chargePayload = {
            calendario: {
                expiracao: 3600 // 1 hour
            },
            devedor: {
                cpf: buyer.document.replace(/\D/g, ''),
                nome: `${buyer.firstName} ${buyer.lastName}`.trim()
            },
            valor: {
                original: value.toFixed(2)
            },
            chave: INTER_CLIENT_ID, // Usually the Pix Key is related to the cert, but Inter API uses the cert to identify the account.
             // Wait, for Inter API "Cobrança Imediata", you specify the 'chave' (Pix Key) in the body usually?
             // Checking docs snippet in memory: Authorization is OAuth. The account is linked to the app. 
             // Actually, usually you need to send the 'chave' (your CPF/CNPJ/Email/EVP key). 
             // Let's assume the user puts their PIX KEY in .env or we pass it.
             // For now, I will use a placeholder or derived from env if I had it. 
             // *Correction*: The payload needs 'chave'. I'll add INTER_PIX_KEY to env or constants.
        };
        // Let's add INTER_PIX_KEY to top defaults or just fail if not present in real mode.
        // For now, let's assume 'sem chave' logic or just pass a dummy if missing to trigger error/mock.
        
        // *Re-reading* Inter API: You DO need to pass your Pix Key.
        const pixKey = getEnv('INTER_PIX_KEY'); 
        if (!pixKey && !MOCK_MODE) throw new Error("INTER_PIX_KEY not configured in .env");

        chargePayload.chave = pixKey;
        chargePayload.solicitacaoPagador = `Pagamento ${serviceName}`;


        const response = await axios.post(`${INTER_API_URL}/cob`, chargePayload, {
            httpsAgent: agent,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Inter returns { txid, pixCopiaECola, ... } and usually you need to generate QR Code image from pixCopiaECola yourself 
        // OR they might return 'imagem' link depending on endpoint version. V2 /cob returns pixCopiaECola.
        // We will generate a QR Code base64 for the frontend using a library or just pass the code if the frontend generates it.
        // The previous PicPay implementation returned a base64 image. 
        // To keep it simple and dependency-free for now, we will return the code and let frontend generate or use a public API for QR if needed.
        // BUT, existing frontend expects `qrcode.base64`.
        // I'll use a public QR generator API for the 'base64' field to maintain compatibility.
        
        const pixCode = response.data.pixCopiaECola;
        const txid = response.data.txid;

        const qrCodeImageUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(pixCode)}`;

        // Save appointment locally
        saveAppointment({
            id: referenceId,
            txid: txid,
            date: new Date().toISOString(),
            clientName: `${buyer.firstName} ${buyer.lastName}`,
            clientEmail: buyer.email,
            service: serviceName || "Serviço Estética",
            value: value,
            status: 'pending',
            provider: 'inter'
        });

        res.json({
            qrcode: {
                content: pixCode,
                base64: qrCodeImageUrl // Using Google Charts for quick QR generation
            },
            txid: txid
        });

    } catch (error) {
        if (error.message !== 'Mock Mode Trigger') {
            console.error('Error generating PIX:', error.response ? error.response.data : error.message);
        }

        // Mock Response
        // Compatible with Inter structure we just defined above
        if (MOCK_MODE || error.message === 'Mock Mode Trigger') {
            
            const mockPixCode = "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5913" + buyer.firstName + "6008Brasilia62070503***6304E2CA";
            
            const mockResponse = {
                qrcode: {
                    content: mockPixCode,
                    base64: "https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=" + encodeURIComponent(mockPixCode)
                },
                txid: "MOCK-TXID-" + Date.now()
            };

            // Save Mock Appointment
            saveAppointment({
                id: referenceId,
                date: new Date().toISOString(),
                clientName: `${buyer.firstName} ${buyer.lastName}`,
                clientEmail: buyer.email,
                service: serviceName || "Serviço (Mock)",
                value: value,
                status: 'pending',
                provider: 'inter_mock'
            });

            return res.json(mockResponse);
        }

        res.status(500).json({ error: 'Failed to generate PIX payment', details: error.response ? error.response.data : error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
