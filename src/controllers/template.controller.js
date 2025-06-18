// src/controllers/template.controller.js
const Template = require('../models/Template.model');

// --- Standard Response Helpers ---
function successResponse(res, message, data, statusCode = 200) {
    res.status(statusCode).json({ success: true, message, data });
}
function errorResponse(res, message, statusCode = 500, details = null) {
    res.status(statusCode).json({ success: false, message, details });
}

// @desc    Create a new template
// @route   POST /api/templates
// @access  Public (for now)
exports.createTemplate = async (req, res) => {
    try {
        const { name, description, themePrompt, image } = req.body;
        if (!name || !themePrompt || !image) {
            return errorResponse(res, 'Name, themePrompt, and image are required fields.', 400);
        }
        const newTemplate = await Template.create({ name, description, themePrompt, image });
        successResponse(res, 'Template created successfully.', newTemplate, 201);
    } catch (error) {
        if (error.code === 11000) {
            return errorResponse(res, 'A template with this name already exists.', 409);
        }
        errorResponse(res, 'Error creating template.', 500, error.message);
    }
};

// @desc    Get all templates
// @route   GET /api/templates
// @access  Public (for now)
exports.getAllTemplates = async (req, res) => {
    try {
        // Sort by most used first, then alphabetically
        const templates = await Template.find().sort({ uses_count: -1, name: 1 });
        successResponse(res, 'Templates retrieved successfully.', templates);
    } catch (error) {
        errorResponse(res, 'Error retrieving templates.', 500, error.message);
    }
};

// @desc    Get a single template by ID
// @route   GET /api/templates/:templateId
// @access  Public (for now)
exports.getTemplateById = async (req, res) => {
    try {
        const template = await Template.findById(req.params.templateId);
        if (!template) {
            return errorResponse(res, 'Template not found.', 404);
        }
        successResponse(res, 'Template retrieved successfully.', template);
    } catch (error) {
        errorResponse(res, 'Error retrieving template.', 500, error.message);
    }
};

// @desc    Update a template
// @route   PUT /api/templates/:templateId
// @access  Public (for now)
exports.updateTemplate = async (req, res) => {
    try {
        const updatedTemplate = await Template.findByIdAndUpdate(req.params.templateId, req.body, {
            new: true,
            runValidators: true
        });
        if (!updatedTemplate) {
            return errorResponse(res, 'Template not found.', 404);
        }
        successResponse(res, 'Template updated successfully.', updatedTemplate);
    } catch (error) {
        errorResponse(res, 'Error updating template.', 500, error.message);
    }
};

// @desc    Delete a template
// @route   DELETE /api/templates/:templateId
// @access  Public (for now)
exports.deleteTemplate = async (req, res) => {
    try {
        const template = await Template.findByIdAndDelete(req.params.templateId);
        if (!template) {
            return errorResponse(res, 'Template not found.', 404);
        }
        successResponse(res, 'Template deleted successfully.', { templateId: req.params.templateId });
    } catch (error) {
        errorResponse(res, 'Error deleting template.', 500, error.message);
    }
};

// @desc    Export all templates as JSON
// @route   GET /api/templates/export/json
// @access  Public (for now)
exports.exportTemplates = async (req, res) => {
    try {
        const templates = await Template.find().lean();
        // Remove MongoDB-specific fields for a clean export
        const cleanedTemplates = templates.map(({ _id, __v, createdAt, updatedAt, ...rest }) => rest);
        
        res.setHeader('Content-Disposition', 'attachment; filename="templates.json"');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({ templates: cleanedTemplates });
    } catch (error) {
        errorResponse(res, 'Error exporting templates.', 500, error.message);
    }
};

// @desc    Import templates from a JSON file
// @route   POST /api/templates/import/json
// @access  Public (for now)
exports.importTemplates = async (req, res) => {
    try {
        const { templates } = req.body;
        if (!templates || !Array.isArray(templates)) {
            return errorResponse(res, 'Request body must contain a "templates" array.', 400);
        }
        
        // Use insertMany for bulk creation. ordered:false will attempt to insert all documents, even if some fail.
        const result = await Template.insertMany(templates, { ordered: false });
        
        successResponse(res, `${result.length} templates successfully imported.`, {
            successfulImports: result.length,
            totalAttempted: templates.length
        });
    } catch (error) {
        // insertMany with ordered:false still throws an error, but it's a BulkWriteError
        // that contains information about which documents succeeded.
        if (error.name === 'BulkWriteError') {
             return successResponse(res, `Import completed with some errors. ${error.result.nInserted} templates were successfully imported.`, {
                successfulImports: error.result.nInserted,
                totalAttempted: req.body.templates.length,
                errors: error.result.getWriteErrors()
             });
        }
        errorResponse(res, 'Error importing templates.', 500, error.message);
    }
};