const User = require('../models/User.model');
const UserActionLog = require('../models/UserActionLog.model'); // <-- IMPORT THE NEW MODEL

// ... (getUsers, getUser, createUser, updateUser, deleteUser are unchanged)

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Get single user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.status(200).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Create new user
// @route   POST /api/users
// @access  Private/Admin
exports.createUser = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already in use' });
        }

        const user = await User.create({ username, email, password, role });
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
    try {
        const { username, email, role } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        user.username = username || user.username;
        user.email = email || user.email;
        user.role = role || user.role;

        await user.save();
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        await user.remove();
        res.status(200).json({ success: true, message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


// --- NEW ADMIN FUNCTIONS ---

// @desc    Ban a user
// @route   PUT /api/users/:id/ban
// @access  Private/Admin
exports.banUser = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ success: false, message: 'Request body cannot be empty. Required fields are: reasonType, reasonDescription.' });
        }

        const { reasonType, reasonDescription } = req.body;
        if (!reasonType || !reasonDescription) {
            return res.status(400).json({ success: false, message: 'Reason type and description are required to ban a user.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.role === 'admin') {
            return res.status(400).json({ success: false, message: 'Admins cannot be banned.' });
        }

        if (user.status === 'banned') {
            return res.status(400).json({ success: false, message: `User ${user.username} is already banned.` });
        }

        // 1. Update user status
        user.status = 'banned';
        user.suspensionExpiresAt = null;
        await user.save();

        // --- NEW: Delete all logs for this user before creating fresh ban log ---
        await UserActionLog.deleteMany({ userId: user._id });

        // 2. Create fresh ban log
        await UserActionLog.create({
            userId: user._id,
            moderatorId: req.user.id,
            actionType: 'ban',
            reasonType,
            reasonDescription
        });

        res.status(200).json({ success: true, message: `User ${user.username} has been banned.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Unban a user
// @route   PUT /api/users/:id/unban
// @access  Private/Admin
exports.unbanUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.status === 'active') {
            return res.status(400).json({ success: false, message: `User ${user.username} is already active.` });
        }

        // 1. Update user status
        user.status = 'active';
        user.suspensionExpiresAt = null;
        await user.save();

        // --- NEW: Delete all logs for this user ---
        await UserActionLog.deleteMany({ userId: user._id });

        // Optional: create unban log if needed for record
        // await UserActionLog.create({
        //     userId: user._id,
        //     moderatorId: req.user.id,
        //     actionType: 'unban',
        //     reasonType: 'appeal_approved',
        //     reasonDescription: 'User was unbanned by an administrator.'
        // });

        res.status(200).json({ success: true, message: `User ${user.username} has been unbanned and is now active.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @desc    Suspend a user
// @route   PUT /api/users/:id/suspend
// @access  Private/Admin
exports.suspendUser = async (req, res) => {
    try {
        // --- NEW: Get reason from request body ---
        const { suspensionEndDate, reasonType, reasonDescription } = req.body;
        if (!suspensionEndDate || new Date(suspensionEndDate) <= new Date()) {
            return res.status(400).json({ success: false, message: 'Please provide a valid future date for the suspension to end.' });
        }
        if (!reasonType || !reasonDescription) {
            return res.status(400).json({ success: false, message: 'Reason type and description are required to suspend a user.' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.role === 'admin') {
            return res.status(400).json({ success: false, message: 'Admins cannot be suspended.' });
        }

        // 1. Update user status
        user.status = 'suspended';
        user.suspensionExpiresAt = suspensionEndDate;
        await user.save();

        // --- NEW: 2. Create a log entry for the action ---
        await UserActionLog.create({
            userId: user._id,
            moderatorId: req.user.id,
            actionType: 'suspend',
            reasonType,
            reasonDescription,
            expiresAt: suspensionEndDate // Also store expiry in the log
        });

        res.status(200).json({ success: true, message: `User ${user.username} has been suspended until ${new Date(suspensionEndDate).toLocaleString()}.` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};