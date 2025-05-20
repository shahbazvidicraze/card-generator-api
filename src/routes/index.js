// src/routes/index.js
const express = require('express');
const router = express.Router();

const cardRoutes = require('./card.routes'); // Import card routes
router.use('/cards', cardRoutes);          // Use card routes under /api/cards

router.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', message: 'API is healthy' });
});

module.exports = router;