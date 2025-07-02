const express = require('express');
const router = express.Router();
const templateController = require('../controllers/template.controller');
const upload = require('../middleware/upload'); // ← multer middleware

// Export/Import
router.get('/export/json', templateController.exportTemplates);
router.post('/import/json', templateController.importTemplates);

// Standard CRUD
router.route('/')
    .post(upload.single('image'), templateController.createTemplate)
    .get(templateController.getAllTemplates);

router.route('/:templateId')
    .get(templateController.getTemplateById)
    .put(upload.single('image'), templateController.updateTemplate)
    .delete(templateController.deleteTemplate);

module.exports = router;
