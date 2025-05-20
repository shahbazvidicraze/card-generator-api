// src/routes/card.routes.js
const express = require('express');
const router = express.Router();
const cardController = require('../controllers/card.controller');

// POST /api/cards/generate - Generate a new card using AI
router.post('/generate', cardController.generateCardWithAI);

// GET /api/cards/:cardId - Get a specific card by its ID
router.get('/:cardId', cardController.getCardById);

// POST /api/cards/:cardId/elements - Add a new element to a card
router.post('/:cardId/elements', cardController.addElementToCard);

// POST /api/generate-text
router.post('/generate-text', cardController.generateTextForCard); 

// New endpoint for combined image and text generation for a new card
router.post('/generate-full-card', cardController.generateFullCardFromPrompt);

module.exports = router;