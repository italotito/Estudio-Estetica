const express = require('express');
const router = express.Router();
const env = require('../config/env');

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === env.ADMIN_USER && password === env.ADMIN_PASS) {
        res.json({ token: env.ADMIN_TOKEN });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

module.exports = router;
