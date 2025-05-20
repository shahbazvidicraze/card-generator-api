// server.js
require('dotenv').config(); // Load environment variables AT THE VERY TOP
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const mainRouter = require('./src/routes'); // We'll create this soon

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// API Routes
app.use('/api', mainRouter); // Mount the main router at /api

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