// src/models/Box.model.js
const mongoose = require('mongoose');
// No need to import Element model here if only storing ObjectIds with ref

const BoxSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    userId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true,
        index: true
    },
    defaultCardWidthPx: { type: Number, default: 315 },
    defaultCardHeightPx: { type: Number, default: 440 },
    baseAISettings: {
        userPrompt: String,
        genre: String,
        accentColorHex: String,
        imageAspectRatio: String,
        imageOutputFormat: String,
        cardBackImage: String // DataURI or URL for the default back for cards in this box
    },

    // Elements for the box itself (e.g., box art front/back)
    // These store ObjectId references to documents in the 'Element' collection
    boxFrontElementIds: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Element' 
    }],
    boxBackElementIds: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Element' 
    }]

}, { timestamps: true });

module.exports = mongoose.models.Box || mongoose.model('Box', BoxSchema);