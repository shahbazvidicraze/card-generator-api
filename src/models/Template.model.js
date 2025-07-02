const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
    image: {
        type: String,
        required: true
    },
    templateName: {
        type: String,
        required: true,
        trim: true
    },
    themePrompt: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Template', TemplateSchema);
