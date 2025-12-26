const express = require('express');
const db = require('../../db');
const { requireAuth } = require('../../utils/middleware');

const router = express.Router();

router.get('/logs', requireAuth, (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const offset = parseInt(req.query.offset, 10) || 0;
        const type = req.query.type || null;

        const logs = db.getLogs(limit, offset, type);
        res.json(logs);
    } catch (error) {
        console.error('Failed to fetch logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

module.exports = router;
