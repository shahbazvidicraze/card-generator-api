// src/routes/index.js
const express = require('express');
const router = express.Router();

const boxRoutes = require('./box.routes');
const cardRoutes = require('./card.routes');
const rulesRoutes = require('./rules.routes');
const templateRoutes = require('./template.routes');
// const utilRoutes = require('./util.routes'); // For image proxy, etc.
// const authRoutes = require('./auth.routes'); // If you have user auth

// router.use('/auth', authRoutes);
router.use('/boxes', boxRoutes); // All box-related APIs under /api/boxes
router.use('/cards', cardRoutes); // All card-related APIs under /api/cards
router.use('/rules', rulesRoutes);
router.use('/templates', templateRoutes);
// router.use('/utils', utilRoutes);

router.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', message: 'API is healthy' });
});

module.exports = router;