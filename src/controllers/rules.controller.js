// src/controllers/rules.controller.js
const RuleSet = require('../models/RuleSet.model');
const mongoose = require('mongoose');
const aiService = require('../services/ai.service'); // <-- Import AI Service

// --- Constants & Helpers for AI Rule Generation ---
const GAME_RULES_SYSTEM_INSTRUCTION = `
You are a game design assistant. Your task is to generate a set of core game rules based on a user's prompt for a card game.
- The output MUST follow this strict format: Each rule is a heading on its own line, followed by a description in parentheses on the next line.
- Do NOT include any conversational text, introductions, summaries, or any text outside of this heading/description format.
- Do NOT number the headings.
- Example Output Format:
Heading One
(Description for rule one goes here.)
Heading Two
(Description for rule two goes here.)
- Generate between 3 to 5 core rules.
- The rules should be clear, concise, and suitable for the game described in the user's prompt.
`;

function parseRulesFromAiText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const rules = [];
    const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('(') && !lines[i].endsWith(')')) {
            const heading = lines[i];
            if (i + 1 < lines.length && lines[i + 1].startsWith('(') && lines[i + 1].endsWith(')')) {
                const description = lines[i + 1].slice(1, -1).trim();
                rules.push({ heading, description, status: 'enabled' });
                i++;
            }
        }
    }
    return rules;
}

// --- Standard Response Helpers ---
function successResponse(res, message, data, statusCode = 200) {
    res.status(statusCode).json({ success: true, message, data });
}
function errorResponse(res, message, statusCode = 500, details = null) {
    res.status(statusCode).json({ success: false, message, details });
}

// @desc    Create a new RuleSet with AI-generated rules
// @route   POST /api/rules
// @access  Private
exports.createRuleSet = async (req, res) => {
    try {
        // Updated destructuring: 'name' is gone, 'prompt_for_rules' is used directly.
        const { prompt_for_rules, difficulty_level, game_roles } = req.body;
        
        const userId = req.user ? req.user.id : null;
        const isGuest = !userId;

        // Updated validation to check for prompt_for_rules instead of name.
        if (!prompt_for_rules) {
            return errorResponse(res, 'A prompt for ruleset is required.', 400);
        }

        // Updated validation to check for prompt_for_rules instead of name.
        if (!difficulty_level) {
            return errorResponse(res, 'Difficulty level for ruleset is required.', 400);
        }

        // Updated validation to check for prompt_for_rules instead of name.
        if (!game_roles) {
            return errorResponse(res, 'No. of roles/players for ruleset is required.', 400);
        }

        // AI generation and parsing logic remains the same.
        const rulesPromptForGemini = `The game is: "${prompt_for_rules}". Generate rules based on this.`;
        const generatedRulesText = await aiService.generateTextWithGemini(rulesPromptForGemini, undefined, GAME_RULES_SYSTEM_INSTRUCTION);
        let parsedRulesData = parseRulesFromAiText(generatedRulesText);
        if (parsedRulesData.length === 0) {
            parsedRulesData.push({ heading: 'Fallback Objective', description: `The objective of the game is based on the theme: ${prompt_for_rules}.`, status: 'enabled' });
        }
        
        // Updated object for the new schema.
        const newRuleSet = new RuleSet({
            prompt_for_rules,
            userId,
            isGuestRuleSet: isGuest,
            difficulty_level,
            game_roles,
            rules_data: parsedRulesData
        });

        const savedRuleSet = await newRuleSet.save();
        successResponse(res, 'New RuleSet created successfully.', savedRuleSet, 201);

    } catch (error) {
        errorResponse(res, 'Server error while creating RuleSet.', 500, error.message);
    }
};

// @desc    Get all RuleSets for the logged-in user
// @route   GET /api/rules
// @access  Private
exports.getUserRuleSets = async (req, res) => {
    try {
        const userId = req.user.id;
        const ruleSets = await RuleSet.find({ userId: userId }).sort({ name: 1 });
        successResponse(res, 'User RuleSets retrieved successfully.', ruleSets);
    } catch (error) {
        errorResponse(res, 'Server error fetching RuleSets.', 500, error.message);
    }
};

// @desc    Get a single RuleSet by its ID
// @route   GET /api/rules/:ruleSetId
// @access  Private
exports.getRuleSetById = async (req, res) => {
    try {
        const { ruleSetId } = req.params;
        const userId = req.user.id;
        const ruleSet = await RuleSet.findOne({ _id: ruleSetId, userId: userId });
        if (!ruleSet) {
            return errorResponse(res, 'RuleSet not found or not authorized.', 404);
        }
        successResponse(res, 'RuleSet retrieved successfully.', ruleSet);
    } catch (error) {
        errorResponse(res, 'Server error fetching RuleSet.', 500, error.message);
    }
};

// @desc    Update a RuleSet
// @route   PUT /api/rules/:ruleSetId
// @access  Private
exports.updateRuleSet = async (req, res) => {
    try {
        const { ruleSetId } = req.params;
        const updates = req.body;
        const userId = req.user.id;

        // Prevent changing ownership
        delete updates.userId;

        const updatedRuleSet = await RuleSet.findOneAndUpdate(
            { _id: ruleSetId, userId: userId },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedRuleSet) {
            return errorResponse(res, 'RuleSet not found or not authorized.', 404);
        }
        
        successResponse(res, 'RuleSet updated successfully.', updatedRuleSet);
    } catch (error) {
        errorResponse(res, 'Server error updating RuleSet.', 500, error.message);
    }
};

// @desc    Delete a RuleSet
// @route   DELETE /api/rules/:ruleSetId
// @access  Private
exports.deleteRuleSet = async (req, res) => {
    try {
        const { ruleSetId } = req.params;
        const userId = req.user.id;

        const deleted = await RuleSet.findOneAndDelete({ _id: ruleSetId, userId: userId });

        if (!deleted) {
            return errorResponse(res, 'RuleSet not found or not authorized.', 404);
        }
        
        successResponse(res, 'RuleSet deleted successfully.', { ruleSetId });
    } catch (error) {
        errorResponse(res, 'Server error deleting RuleSet.', 500, error.message);
    }
};