// src/routes/box.routes.js
const express = require('express');
const router = express.Router();
const boxController = require('../controllers/box.controller');
// const authMiddleware = require('../middleware/auth.middleware'); // Assuming you'll add auth

// --- Box Routes ---
// Create a new Box with an initial deck of cards
router.post('/create-with-deck', /* authMiddleware.protect, */ boxController.generateNewDeckAndBox);

// Create an empty Box
router.post('/', /* authMiddleware.protect, */ boxController.createBox);

// Get all boxes for the authenticated user
router.get('/', /* authMiddleware.protect, */ boxController.getUserBoxes);

// Get a specific box by its ID (and potentially its cards - can be paginated later)
router.get('/:boxId', /* authMiddleware.protect, */ boxController.getBoxById);

// Update box details (name, description, default settings)
router.put('/:boxId', /* authMiddleware.protect, */ boxController.updateBox);

// Delete a box (and its associated cards - needs careful handling)
router.delete('/:boxId', /* authMiddleware.protect, */ boxController.deleteBox);

// --- Routes for managing elements directly on the Box (e.g., box art) ---
// Add an element to a box's front or back design
router.post('/:boxId/elements', /* authMiddleware.protect, */ boxController.addBoxElement);
// Update an element on a box's design
router.put('/:boxId/elements/:elementId', /* authMiddleware.protect, */ boxController.updateBoxElement);
// Delete an element from a box's design
router.delete('/:boxId/elements/:elementId', /* authMiddleware.protect, */ boxController.deleteBoxElement);

module.exports = router;