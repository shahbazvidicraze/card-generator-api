// src/routes/card.routes.js
const express = require('express');
const router = express.Router();
const cardController = require('../controllers/card.controller');
// const authMiddleware = require('../middleware/auth.middleware');

// --- Card Routes (often nested under or related to a Box) ---

// Get all cards for a specific box (could also be part of getBoxById with populate)
router.get('/box/:boxId', /* authMiddleware.protect, */ cardController.getCardsByBox); // LINE X

// Get a single card by its ID
router.get('/:cardId', /* authMiddleware.protect, */ cardController.getCardById); // LINE Y

// Create a new blank card within an existing box (user designs it manually)
router.post('/box/:boxId', /* authMiddleware.protect, */ cardController.createCardInBox); // LINE Z

// Update card details (name, orderInBox) - elements are handled separately
router.put('/:cardId', /* authMiddleware.protect, */ cardController.updateCardDetails); // LINE A

// Delete a card
router.delete('/:cardId', /* authMiddleware.protect, */ cardController.deleteCard); // LINE B

// --- Routes for Card Elements ---
// Add an element to a card's front or back
// query param: ?face=front or ?face=back
router.post('/:cardId/elements', /* authMiddleware.protect, */ cardController.addCardElement); // LINE C

// Update an existing element on a card's front or back
router.put('/:cardId/elements/:elementId', /* authMiddleware.protect, */ cardController.updateCardElement); // LINE D

// Delete an element from a card's front or back
router.delete('/:cardId/elements/:elementId', /* authMiddleware.protect, */ cardController.deleteCardElement); // LINE E  <-- This is likely around line 37

// AI Text Generation for a specific card field (if not part of initial deck gen)
// This might be better as a utility route, but for context here:
router.post('/:cardId/generate-text-field', /* authMiddleware.protect, */ cardController.generateTextForCard); // LINE F

module.exports = router;