// src/routes/template.routes.js
const express = require('express');
const router = express.Router();
const templateController = require('../controllers/template.controller');

// For now, all routes are public as requested.
// Later, you can add `authMiddleware.protect` and `authMiddleware.authorize('admin')` to these routes.

// Export/Import
router.get('/export/json', templateController.exportTemplates);
router.post('/import/json', templateController.importTemplates);

// Standard CRUD
router.route('/')
    .post(templateController.createTemplate)
    .get(templateController.getAllTemplates);

router.route('/:templateId')
    .get(templateController.getTemplateById)
    .put(templateController.updateTemplate)
    .delete(templateController.deleteTemplate);

module.exports = router;