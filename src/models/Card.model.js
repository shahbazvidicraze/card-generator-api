// src/models/Card.model.js
const mongoose = require('mongoose');

// Enhanced ElementSchema
const ElementSchema = new mongoose.Schema({
    elementId: { type: String, required: true, unique: false }, // Unique ID for this element *within the card*
    type: { type: String, enum: ['image', 'text'], required: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 100 },
    height: { type: Number, default: 50 },
    rotation: { type: Number, default: 0 }, // Added for future Canva-like features
    zIndex: { type: Number, default: 0 },

    // Image-specific
    imageUrl: { type: String }, // Will store data URI or URL

    // Text-specific
    content: { type: String, default: '' },
    fontSize: { type: String, default: '16px' }, // e.g., "16px", "2em"
    fontFamily: { type: String, default: 'Arial' },
    color: { type: String, default: '#000000' }, // Hex color
    textAlign: { type: String, enum: ['left', 'center', 'right', 'justify'], default: 'left' },
    fontWeight: { type: String, default: 'normal' }, // e.g., 'normal', 'bold'
    fontStyle: { type: String, default: 'normal' }, // e.g., 'normal', 'italic'
    // Add other text properties as needed: letterSpacing, lineHeight, textDecoration, etc.
}, { _id: false }); // _id: false because elementId will be our identifier within the elements array

const CardSchema = new mongoose.Schema({
    name: { type: String, default: 'Untitled Card' },
    promptUsed: { type: String, required: false },
    // cardArtUrl: { type: String }, // This can be deprecated if the main image is always an element
    widthPx: { type: Number, default: 512 },
    heightPx: { type: Number, default: 512 },
    elements: [ElementSchema], // Array of editable elements for the card FRONT

    cardBackImageUrl: { type: String, default: null }, // NEW FIELD FOR CARD BACK IMAGE URL/DATA URI

    originalDeckRequest: { // Optional, if generating decks
        baseName: String,
        indexInDeck: Number,
        totalInDeck: Number
    },
    metadata: {
        imageGenAspectRatio: String,
        outputFormat: String,
        backgroundColor: { type: String, default: '#FFFFFF' },
        selectedThemeColorHex: String, // Text color
        imageGenerationStatus: String,
        textGenerationStatus: String
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

CardSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Card', CardSchema);