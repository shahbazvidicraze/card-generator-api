// src/routes/auth.routes.js
const express = require('express');
const { register, login, profile /*, forgotPassword, resetPassword, updatePassword */ } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware'); // We'll create this next

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, profile); // Example of a protected route

// Conceptual routes for password management (implement controllers as above)
// router.post('/forgotpassword', forgotPassword);
// router.put('/resetpassword/:resettoken', resetPassword);
// router.put('/updatepassword', protect, updatePassword); // For logged-in users to change their password

module.exports = router;