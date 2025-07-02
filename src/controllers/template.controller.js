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
// @access  Public
exports.createTemplate = async (req, res) => {
    try {
        const { templateName, description, themePrompt } = req.body;
        const imageFile = req.file;

        if (!templateName || !themePrompt || !imageFile) {
            return errorResponse(res, 'templateName, themePrompt, and image are required fields.', 400);
        }

        const existing = await Template.findOne({ templateName });
        if (existing) {
            return errorResponse(res, 'A template with this templateName already exists.', 409);
        }

        const newTemplate = await Template.create({
            templateName,
            description,
            themePrompt,
            image: `/uploads/templates/${imageFile.filename}`
        });

        successResponse(res, 'Template created successfully.', newTemplate, 201);
    } catch (error) {
        errorResponse(res, 'Error creating template.', 500, error.message);
    }
};

// @desc    Get all templates
// @route   GET /api/templates
// @access  Public
exports.getAllTemplates = async (req, res) => {
    try {
        const templates = await Template.find().sort({ templateName: 1 });
        successResponse(res, 'Templates retrieved successfully.', templates);
    } catch (error) {
        errorResponse(res, 'Error retrieving templates.', 500, error.message);
    }
};

// @desc    Get a single template by ID
// @route   GET /api/templates/:templateId
// @access  Public
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
// @access  Public
exports.updateTemplate = async (req, res) => {
    try {
        const { templateName, description, themePrompt } = req.body;
        const imageFile = req.file;

        const updateData = {
            templateName,
            description,
            themePrompt,
        };

        if (imageFile) {
            updateData.image = `/uploads/templates/${imageFile.filename}`;
        }

        const updatedTemplate = await Template.findByIdAndUpdate(
            req.params.templateId,
            updateData,
            { new: true, runValidators: true }
        );

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
// @access  Public
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
// @access  Public
exports.exportTemplates = async (req, res) => {
    try {
        const templates = await Template.find().lean();
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
// @access  Public
exports.importTemplates = async (req, res) => {
    try {
        const { templates } = req.body;
        if (!templates || !Array.isArray(templates)) {
            return errorResponse(res, 'Request body must contain a "templates" array.', 400);
        }

        const result = await Template.insertMany(templates, { ordered: false });

        successResponse(res, `${result.length} templates successfully imported.`, {
            successfulImports: result.length,
            totalAttempted: templates.length
        });
    } catch (error) {
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
