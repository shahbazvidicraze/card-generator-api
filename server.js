// server.js
require('dotenv').config(); // Load environment variables AT THE VERY TOP
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./src/config/db');
const mainRouter = require('./src/routes'); // We'll create this soon
const authRoutes = require('./src/routes/auth.routes'); // Import auth routes
const userRoutes = require('./src/routes/user.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();



// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // For parsing application/json
app.use(express.urlencoded({ limit: '50mb', extended: true })); // For parsing application/x-www-form-urlencoded
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', mainRouter); // Mount the main router at /api
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);


// Basic root route for testing
app.get('/', (req, res) => {
    res.send('Card Generator API is alive!');
});

// Simple error handler (can be improved later)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Something broke!', error: err.message });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});