// src/models/Template.model.js
const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Template name is required.'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    // This is the prompt string that the frontend will merge
    themePrompt: {
        type: String,
        required: [true, 'A theme prompt is required for the template.']
    },
    // The image will be stored as a Base64 Data URI string
    image: {
        type: String,
        required: [true, 'A preview image is required for the template.']
    },
    uses_count: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.models.Template || mongoose.model('Template', TemplateSchema);