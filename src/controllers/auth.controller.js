// src/controllers/auth.controller.js
const User = require('../models/User.model');
const crypto = require('crypto'); // For password reset token
const { generateToken } = require('../utils/tokenUtils'); // Assuming you created this

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
    const { username, email, password } = req.body;

    try {
        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, message: 'User already exists with this email' });
        }
        user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ success: false, message: 'Username is already taken' });
        }

        // Create user
        user = await User.create({
            username,
            email,
            password // Password will be hashed by the pre-save hook in User.model.js
        });

        // Create token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            token,
            data: { userId: user._id, username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error("Register error:", error.message);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        res.status(500).json({ success: false, message: 'Server Error during registration' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    const { email, password } = req.body;

    // Validate email & password
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide an email and password' });
    }

    try {
        // Check for user
        const user = await User.findOne({ email }).select('+password'); // Explicitly select password

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials (user not found)' });
        }

        // Check if password matches
        const isMatch = await user.matchPassword(password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials (password mismatch)' });
        }

        // Create token
        const token = generateToken(user._id);

        // Send only necessary user data
        const userData = {
            userId: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        };

        res.status(200).json({
            success: true,
            token,
            data: userData
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({ success: false, message: 'Server Error during login' });
    }
};


// @desc    Get current logged in user (example of a protected route data)
// @route   GET /api/auth/me
// @access  Private
exports.profile = async (req, res, next) => {
    // req.user is set by the auth middleware
    if (!req.user) {
        return res.status(404).json({ success: false, message: 'User not found or not authenticated' });
    }
    const user = await User.findById(req.user.id); // req.user.id comes from the protect middleware

    if (!user) { // Should not happen if protect middleware worked correctly
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    // Send only necessary user data
    const userData = {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role
    };
    res.status(200).json({
        success: true,
        data: userData
    });
};

// --- Password Reset (Conceptual Backend Steps) ---
// 1. Forgot Password Route (e.g., POST /api/auth/forgotpassword)
//    - User submits their email.
//    - Find user by email.
//    - If user exists, generate a reset token (UserSchema.methods.getResetPasswordToken).
//    - Save the hashed token and expiry to the user document.
//    - Create a reset URL like `YOUR_FRONTEND_URL/resetpassword/${resetToken}`.
//    - Send an email to the user with this URL (using nodemailer or similar).
//    - For nodemailer, you'd set up a transport (e.g., with SendGrid, Mailgun, or SMTP).
//      Example (very basic structure for `src/utils/email.js`):
/*
const nodemailer = require('nodemailer');

const sendEmail = async options => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
        // For services like Gmail, you might need to enable "less secure app access"
        // or use OAuth2. For production, services like SendGrid, Mailgun are better.
    });

    const message = {
        from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        text: options.message
        // html: options.html // for HTML emails
    };

    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
};
module.exports = sendEmail;
*/
// Then in your forgotPassword controller:
/*
try {
    await sendEmail({
        email: user.email,
        subject: 'Password Reset Token',
        message: `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}` // Or link to frontend page
    });
    res.status(200).json({ success: true, data: 'Email sent' });
} catch (err) {
    console.error(err);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return res.status(500).json({ success: false, message: 'Email could not be sent' });
}
*/

// 2. Reset Password Route (e.g., PUT /api/auth/resetpassword/:resettoken)
//    - User clicks link in email, lands on frontend page, enters new password.
//    - Frontend sends `newPassword` and `resettoken` from URL to this backend route.
//    - Backend hashes the `resettoken` from the URL param.
//    - Find user by this hashed `resetPasswordToken` AND `resetPasswordExpire > Date.now()`.
//    - If user found and token valid:
//        - Set new password (it will be hashed by pre-save hook).
//        - Clear `resetPasswordToken` and `resetPasswordExpire` from user document.
//        - Save user.
//        - Send new JWT or success message.

// 3. Change Password Route (e.g., PUT /api/auth/updatepassword - when user is logged in)
//    - This route would be protected by auth middleware.
//    - User provides `currentPassword` and `newPassword`.
//    - Find user by `req.user.id`.
//    - Verify `currentPassword` using `user.matchPassword()`.
//    - If correct, update `user.password = newPassword` (it will be hashed by pre-save).
//    - Save user.