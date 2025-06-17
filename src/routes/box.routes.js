// src/routes/box.routes.js
const express = require('express');
const router = express.Router();
const boxController = require('../controllers/box.controller');
const authMiddleware = require('../middleware/auth.middleware');

// --- Box Creation (Public, but controller handles optional auth) ---
// Create a new Box with an initial deck of cards
router.post('/create-with-deck', boxController.generateNewDeckAndBox); // Public, controller handles optional auth
// Create an empty Box
router.post('/', boxController.createBox); // Public, controller handles optional auth

// --- Claiming a Box (Protected) ---
router.post('/:boxId/claim', authMiddleware.protect, boxController.claimBox);

// --- Reading Boxes ---
// Get all boxes for THE AUTHENTICATED user
router.get('/', authMiddleware.protect, boxController.getUserBoxes);

// Get a specific box by its ID
// This is public for guest boxes, but controller will enforce ownership for non-guest boxes if a token is present.
// If a token IS present, the controller should also check ownership if the box is NOT a guest box.
router.get('/:boxId', boxController.getBoxById); // Controller logic will handle guest vs owned access

router.get('/:boxId/export/json', authMiddleware.protect, boxController.exportBoxAsJson);
// --- Modifying/Deleting Box and Its Elements (Protected) ---
// Update box details
router.put('/:boxId', authMiddleware.protect, boxController.updateBox);
// Delete a box
router.delete('/:boxId', authMiddleware.protect, boxController.deleteBox);

// Add an element to a box's design
router.post('/:boxId/elements', authMiddleware.protect, boxController.addBoxElement);
// Update an element on a box's design
router.put('/:boxId/elements/:elementId', authMiddleware.protect, boxController.updateBoxElement);
// Delete an element from a box's design
router.delete('/:boxId/elements/:elementId', authMiddleware.protect, boxController.deleteBoxElement);

module.exports = router;