// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // else if (req.cookies.token) { // Alternative: check for token in cookies
    //     token = req.cookies.token;
    // }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authorized to access this route (no token)' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = await User.findById(decoded.id);

        if (!req.user) { // Check if user still exists
            return res.status(401).json({ success: false, message: 'Not authorized (user not found)' });
        }
        next();
    } catch (err) {
        console.error("Auth middleware error:", err.message);
        return res.status(401).json({ success: false, message: 'Not authorized to access this route (token failed)' });
    }
};

exports.optionalProtect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
        } catch (err) {
            // Token is invalid/expired, but we don't care, just proceed as a guest
            console.log('Optional protect: Invalid token, proceeding as guest.');
            req.user = null;
        }
    }
    next();
};

// Grant access to specific roles (example)
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: `User role ${req.user ? req.user.role : 'guest'} is not authorized to access this route` });
        }
        next();
    };
};