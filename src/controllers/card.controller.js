// src/controllers/card.controller.js
const Card = require('../models/Card.model');
const aiService = require('../services/ai.service');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION = `
You are a data generation assistant. Your ONLY task is to provide concise, raw data examples based on the user's request, suitable for populating fields on a card.
- Output must be like problem-solving game.
- Output ONLY the requested data items.
- Each distinct data item should be on a new line.
- Do NOT include any titles, headings, explanations, introductions, summaries, or conversational text (e.g., "Here are some examples:", "I hope this helps!").
- If the user asks for "examples of X", provide only the examples of X, not a description of X.
- If the user asks for "questions for Y", provide only the questions for Y.
- If the user asks for "stats for Z", provide only the stats for Z.
- Think of your output as directly filling a spreadsheet or a list on a game card.
- Adhere strictly to these formatting and content rules.
`;

exports.generateCardWithAI = async (req, res) => {
    try {
        const {
            prompt,
            name = "AI Generated Card",
            aspectRatio = "1:1",
            outputFormat = "png"
        } = req.body;

        if (!prompt) {
            return res.status(400).json({ message: "Prompt is required." });
        }

        const base64ImageDataUriFromAI = await aiService.generateImageWithStabilityAI(
            prompt,
            outputFormat,
            aspectRatio
        );

        console.log("Controller: Received Data URI from AI Service (first 100):", base64ImageDataUriFromAI.substring(0, 100) + "...");

        let displayWidth = 512;
        let displayHeight = 512;
        if (aspectRatio === "16:9") { displayWidth = 768; displayHeight = 432;}
        else if (aspectRatio === "9:16") { displayWidth = 432; displayHeight = 768;}

        const backgroundElement = {
            elementId: uuidv4(), // *** ADDED elementId HERE ***
            type: 'image',
            imageUrl: base64ImageDataUriFromAI,
            x: 0,
            y: 0,
            width: displayWidth,
            height: displayHeight,
            zIndex: 0,
            rotation: 0
        };

        const newCard = new Card({
            name: name,
            promptUsed: prompt,
            cardArtUrl: base64ImageDataUriFromAI, // You might deprecate this if background is always an element
            widthPx: displayWidth,
            heightPx: displayHeight,
            elements: [backgroundElement], // Initial background image
            metadata: {
                aspectRatio: aspectRatio,
                outputFormat: base64ImageDataUriFromAI.match(/^data:image\/([a-z]+);/i)[1] || outputFormat,
                backgroundColor: '#FFFFFF'
            }
        });

        await newCard.save();
        // res.status(201).json({ message: "Card generated successfully!", card: newCard });
        res.status(201).json({ message: "Card generated successfully!", card: newCard, artUrl: newCard.cardArtUrl });

    } catch (error) {
        console.error("Error in generateCardWithAI Controller:", error.message);
        // Handle specific errors thrown by ai.service.js or other issues
        if (error.message.includes("Stability AI returned an empty image")) {
            return res.status(502).json({ message: "AI service reported an empty image.", details: error.message });
        } else if (error.message.includes("Stability AI API key")) {
            return res.status(500).json({ message: "AI service not configured.", details: error.message });
        } else if (error.message.includes("Stability AI")) { // Catches other Stability/Axios errors
            return res.status(502).json({ message: "AI image generation failed.", details: error.message });
        }
        // Generic fallback
        res.status(500).json({ message: "Error generating card.", error: error.message });
    }
};

// NEW FUNCTION to add an element
exports.addElementToCard = async (req, res) => {
    try {
        const { cardId } = req.params;
        const { type, ...elementProps } = req.body; // Element type and its properties

        if (!mongoose.Types.ObjectId.isValid(cardId)) {
            return res.status(400).json({ message: 'Invalid Card ID format.' });
        }

        if (!type || !['text', 'image'].includes(type)) { // Add more types as you support them
            return res.status(400).json({ message: 'Invalid or missing element type.' });
        }

        const card = await Card.findById(cardId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found.' });
        }

        const newElement = {
            elementId: uuidv4(), // Generate a unique ID for the new element
            type: type,
            ...elementProps, // Spread the rest of the properties from req.body
        };

        // Validate required fields based on type (optional, but good practice)
        if (type === 'text' && (typeof newElement.content === 'undefined')) {
            // newElement.content = ''; // Or return error:
            return res.status(400).json({ message: 'Text content is required for text element.'});
        }
        if (type === 'image' && !newElement.imageUrl) {
            return res.status(400).json({ message: 'Image URL is required for image element.'});
        }


        // Add the new element to the card's elements array
        // card.elements.push(newElement); // Mongoose < 7 might need this
        // await card.save();

        // More direct update using $push for Mongoose 7+ (and older versions)
        const updatedCard = await Card.findByIdAndUpdate(
            cardId,
            { $push: { elements: newElement }, $set: { updatedAt: Date.now() } },
            { new: true, runValidators: true } // new: true returns the modified document
        );

        if (!updatedCard) { // Should not happen if findById worked, but good check
            return res.status(404).json({ message: 'Card not found after update attempt.' });
        }

        res.status(200).json({ message: 'Element added successfully', card: updatedCard });

    } catch (error) {
        console.error("Error in addElementToCard:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: "Validation Error", errors: error.errors });
        }
        res.status(500).json({ message: 'Error adding element to card', error: error.message });
    }
};


// ... rest of controller (getCardById, getAllCards)
// Add mongoose require if not there
// const mongoose = require('mongoose');

exports.getCardById = async (req, res) => {
    try 
    {
        console.log(res)
        const { cardId } = req.params;

        // Validate if cardId is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(cardId)) { // <--- THIS CHECK IS FAILING
            return res.status(400).json({ message: 'Invalid Card ID format.' });
        }

        const card = await Card.findById(cardId);

        // const { cardId } = req.params;
        // if (!mongoose.Types.ObjectId.isValid(cardId)) {
        //     return res.status(400).json({ message: 'Invalid Card ID format.' });
        // }
        // const card = await Card.findById(req.params.cardId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }
        res.status(200).json(card);
    } catch (error) {
        console.error("Error in getCardById:", error);
        if (error.name === 'CastError') {
             return res.status(400).json({ message: 'Invalid Card ID format (cast error).', error: error.message });
        }
        res.status(500).json({ message: 'Error fetching card', error: error.message });
    }
};

exports.getAllCards = async (req, res) => {
    try {
        const cards = await Card.find().sort({ createdAt: -1 });
        res.status(200).json(cards);
    } catch (error) {
        console.error("Error in getAllCards:", error);
        res.status(500).json({ message: 'Error fetching cards', error: error.message });
    }
};


exports.generateTextForCard = async (req, res) => {
    try {
        const userRawPrompt = req.body.prompt;

        if (!userRawPrompt || userRawPrompt.trim() === '') {
            return res.status(400).json({ message: "A prompt describing the desired card data is required." });
        }

        // Structure the prompt for the AI service
        const userPromptForService = `User Request: Generate dummy data for printable cards related to "${userRawPrompt}".\n\nData Items:`;

        const generatedText = await aiService.generateTextWithGemini(
            userPromptForService,
            undefined, // Use default model from ai.service.js (which reads from .env)
            CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION // Pass the universal system instruction
        );

        // Basic post-processing: trim whitespace.
        // More aggressive post-processing can be added if needed but good prompting is preferred.
        const cleanedText = generatedText.trim();

        res.status(200).json({
            message: "Dummy data generated successfully.",
            requestedTopic: userRawPrompt,
            // systemInstructionsUsed: CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION, // For debugging if needed
            generatedData: cleanedText,
        });

    } catch (error) {
        console.error("Error in generateTextForCard Controller:", error.message, error.stack);
        if (error.message.includes("Gemini API key not configured")) {
            return res.status(500).json({ message: "AI text service (Gemini) not configured." });
        } else if (error.message.includes("Gemini API Error") || error.message.includes("Gemini prompt blocked")) {
            return res.status(502).json({ message: "AI text generation failed.", details: error.message });
        }
        res.status(500).json({ message: "Error generating dummy card data.", error: error.message });
    }
};

// New function for combined generation
exports.generateFullCardFromPrompt = async (req, res) => {
    try {
        const {
            userPrompt, // This is the single, main prompt from the user
            cardName = "AI Generated Full Card",
            // Card Dimensions (NEW)
            cardWidthPx = 512,  // Default card width in pixels
            cardHeightPx = 768, // Default card height in pixels (e.g., a portrait card)

            // Image Generation Specifics
            imageAspectRatio = null, // Allow this to be null initially
            imageOutputFormat = "png",
        } = req.body;

        if (!userPrompt || userPrompt.trim() === '') {
            return res.status(400).json({ message: "A user prompt is required." });
        }

        // --- 1. Derive Prompts and Instructions for AI Services ---

        // For Image Generation (Stability AI)
        // Simple approach: append style keywords. More complex logic could go here.
        // --- 1. Derive Prompts and Determine Image Aspect Ratio for AI ---
        const imagePromptForStability = `${userPrompt}, card art, detailed, high quality, digital illustration`;
        console.log("Derived Image Prompt for Stability:", imagePromptForStability);

        let aspectRatioForAI = imageAspectRatio;
        if (!aspectRatioForAI) {
            // Calculate aspect ratio from card dimensions.
            // This is a simplified way; Stability AI might prefer specific string ratios like "1:1", "16:9".
            // For now, we'll use this to guide, but the actual image AI might still generate based on its closest supported ratio.
            // A more robust solution would map cardWidthPx/cardHeightPx to one of Stability's supported string ratios.
            if (cardHeightPx !== 0) { // Avoid division by zero
                const ratioValue = cardWidthPx / cardHeightPx;
                if (Math.abs(ratioValue - 1) < 0.05) aspectRatioForAI = "1:1";
                else if (Math.abs(ratioValue - (16/9)) < 0.05) aspectRatioForAI = "16:9";
                else if (Math.abs(ratioValue - (9/16)) < 0.05) aspectRatioForAI = "9:16";
                else if (Math.abs(ratioValue - (3/4)) < 0.05) aspectRatioForAI = "3:4";
                else if (Math.abs(ratioValue - (4/3)) < 0.05) aspectRatioForAI = "4:3";
                else aspectRatioForAI = "1:1"; // Fallback if no close match
                console.log(`Calculated imageAspectRatio for AI based on card dimensions: ${aspectRatioForAI}`);
            } else {
                aspectRatioForAI = "1:1"; // Default if height is 0
            
            }
        }

        // For Text Generation (Gemini)
        const textPromptForGemini = `User Request: Generate concise dummy data for a printable card related to "${userPrompt}". The card dimensions are approximately ${cardWidthPx}px wide and ${cardHeightPx}px tall.\n\nData Items:`;
        console.log("Derived Text Prompt for Gemini:", textPromptForGemini);
        // System instruction for Gemini remains CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION


        // --- 2. Call AI Services (Can be done in parallel) ---
        let generatedImageDataUri = null;
        let generatedTextData = null;
        let imageError = null;
        let textError = null;

        const imagePromise = aiService.generateImageWithStabilityAI(
            imagePromptForStability,
            imageOutputFormat,
            imageAspectRatio
        ).catch(err => {
            console.error("Stability AI Error (in parallel call):", err.message);
            imageError = err.message; // Capture error message
            return null; // Allow Promise.all to resolve
        });

        const textPromise = aiService.generateTextWithGemini(
            textPromptForGemini,
            undefined, // Use default model from ai.service.js
            CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION
        ).catch(err => {
            console.error("Gemini AI Error (in parallel call):", err.message);
            textError = err.message; // Capture error message
            return null; // Allow Promise.all to resolve
        });

        // Wait for both promises to settle
        [generatedImageDataUri, generatedTextData] = await Promise.all([imagePromise, textPromise]);

        // --- 3. Handle AI Service Results & Potential Errors ---
        if (!generatedImageDataUri && !generatedTextData) {
            return res.status(502).json({
                message: "Both AI image and text generation failed.",
                imageError: imageError || "Unknown image generation error.",
                textError: textError || "Unknown text generation error."
            });
        }
        if (!generatedImageDataUri) {
            console.warn("Image generation failed, but text generation might have succeeded.");
            // Decide if you want to proceed without an image, or return an error
            // For now, let's return an error if the primary image fails
            return res.status(502).json({ message: "AI image generation failed.", details: imageError || "No image data returned."});
        }
        // If text generation failed, we can still proceed with the image and perhaps a placeholder text.
        if (!generatedTextData) {
            console.warn("Text generation failed, using placeholder text.");
            generatedTextData = `Content for: ${userPrompt}`; // Placeholder
        }


        // --- 4. Construct Card Elements & Save Card ---
        let displayWidth = 512;
        let displayHeight = 512;
        if (imageAspectRatio === "16:9") { displayWidth = 768; displayHeight = 432;}
        else if (imageAspectRatio === "9:16") { displayWidth = 432; displayHeight = 768;}
        // Add more aspect ratio mappings as needed

        const elements = [];

        // Background Image Element
        elements.push({
            elementId: uuidv4(),
            type: 'image',
            imageUrl: generatedImageDataUri,
            x: 0,
            y: 0,
            width: cardWidthPx,  // Use card's width
            height: cardHeightPx, // Use card's height
            zIndex: 0,
            rotation: 0
        });

        // Text Element (simple placement for now)
        elements.push({
            elementId: uuidv4(),
            type: 'text',
            content: generatedTextData, // Text from Gemini
            x: Math.round(displayWidth * 0.1), // Example placement: 10% from left
            y: Math.round(displayHeight * 0.6), // Example placement: 60% from top
            width: Math.round(displayWidth * 0.8), // Example width: 80% of card width
            height: Math.round(displayHeight * 0.3), // Example height
            fontSize: "14px", // Default, can be configured
            fontFamily: "Arial",
            color: "#000000", // Default, perhaps choose based on image later
            textAlign: "left",
            zIndex: 1,
            rotation: 0
        });

        const newCard = new Card({
            name: cardName,
            promptUsed: userPrompt,
            widthPx: cardWidthPx,   // Save the card's dimensions
            heightPx: cardHeightPx, // Save the card's dimensions
            elements: elements,
            metadata: {
                // Store the aspect ratio used for AI generation, might differ from card's overall aspect ratio
                imageGenAspectRatio: aspectRatioForAI,
                outputFormat: generatedImageDataUri.match(/^data:image\/([a-z]+);/i)?.[1] || imageOutputFormat,
                backgroundColor: '#FFFFFF'
            }
        });

        await newCard.save();

        res.status(201).json({
            message: "Full card generated successfully!",
            card: newCard,
            // Optionally return direct links or data for quick access if frontend needs it
            // generatedImageUrl: generatedImageDataUri,
            // generatedText: generatedTextData
        });

    } catch (error) {
        console.error("Error in generateFullCardFromPrompt Controller:", error.message, error.stack);
        // More specific error handling can be added here if errors from Promise.all aren't caught as expected
        res.status(500).json({ message: "Error generating full card.", error: error.message });
    }
};