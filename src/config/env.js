require('dotenv').config();

const getEnv = (key, defaultValue = '') => (process.env[key] || defaultValue).trim();

module.exports = {
  PORT: process.env.PORT || 3000,
  MOCK_MODE: getEnv('MOCK_MODE', 'false') === 'true' || !getEnv('INTER_CLIENT_ID'),
  WHATSAPP_MOCK_MODE: getEnv('WHATSAPP_MOCK_MODE', 'false') === 'true',
  ADMIN_USER: getEnv('ADMIN_USER', 'admin'),
  ADMIN_PASS: getEnv('ADMIN_PASS', 'admin123'),
  ADMIN_TOKEN: getEnv('ADMIN_TOKEN', 'admin-token-secret-123'),
  INTER_CLIENT_ID: getEnv('INTER_CLIENT_ID'),
  INTER_CLIENT_SECRET: getEnv('INTER_CLIENT_SECRET'),
  INTER_CERT_PATH: getEnv('INTER_CERT_PATH', './certs/inter_cert.crt'),
  INTER_KEY_PATH: getEnv('INTER_KEY_PATH', './certs/inter_key.key'),
  INTER_PIX_KEY: getEnv('INTER_PIX_KEY'),
  INTER_AUTH_URL: 'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
  INTER_API_URL: 'https://cdpj.partners.bancointer.com.br/pix/v2',
  // WhatsApp Business Cloud API (Meta)
  WHATSAPP_API_URL: getEnv('WHATSAPP_API_URL', 'https://graph.facebook.com/v21.0/PHONE_NUMBER_ID/messages'),
  WHATSAPP_API_TOKEN: getEnv('WHATSAPP_API_TOKEN'),
  WHATSAPP_ADMIN_PHONE: getEnv('WHATSAPP_ADMIN_PHONE'),
  WHATSAPP_TEMPLATE_NAME: getEnv('WHATSAPP_TEMPLATE_NAME', 'payment_confirmation'),
};
