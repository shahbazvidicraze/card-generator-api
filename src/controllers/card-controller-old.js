// src/controllers/card.controller.js
const Card = require('../models/Card.model');
const aiService = require('../services/ai.service');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION = `
You are a data generation assistant. Your ONLY task is to provide concise, raw data examples based on the user's request, suitable for populating fields on a card.
- Output must be like problem-solving game.
- Alway change scenarios and also don't include answers.
- keep the questions basic and non-conceptual.
- keep the game level to most basic.
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

// Helper function to find the closest supported aspect ratio string
function getClosestSupportedAspectRatio(width, height, supportedRatios) {
    if (height === 0) return "1:1";
    const targetRatio = width / height;
    let closestRatioString = "1:1";
    let smallestDifference = Infinity;
    supportedRatios.forEach(ratioObj => {
        const difference = Math.abs(targetRatio - ratioObj.value);
        if (difference < smallestDifference) {
            smallestDifference = difference;
            closestRatioString = ratioObj.string;
        }
    });
    console.log(`Target ratio for image: ${targetRatio.toFixed(2)}, Chosen supported Stability AI ratio string: ${closestRatioString}`);
    return closestRatioString;
}

exports.generateFullCardFromPromptOld = async (req, res) => {
    try {
        const {
            userPrompt,
            cardName = "AI Generated Full Card",
            cardWidthPx = 512,
            cardHeightPx = 768,
            imageAspectRatio = null, // User can explicitly provide one of the supported strings for AI
            imageOutputFormat = "png",
            numItemsToGenerate = 1,
            defaultTextColor = "#333333" // Received from frontend
            // `forcePredefinedImage` is no longer needed from req.body for this backend logic
        } = req.body;

        if (!userPrompt || userPrompt.trim() === '') {
            return res.status(400).json({ message: "A user prompt is required." });
        }

        const imagePromptForStability = `${userPrompt}, card art, detailed, high quality, digital illustration`;

        const supportedStabilityRatios = [
            { string: "21:9", value: 21 / 9 }, { string: "16:9", value: 16 / 9 },
            { string: "3:2", value: 3 / 2 }, { string: "5:4", value: 5 / 4 },
            { string: "1:1", value: 1 / 1 }, { string: "4:5", value: 4 / 5 },
            { string: "2:3", value: 2 / 3 }, { string: "9:16", value: 9 / 16 },
            { string: "9:21", value: 9 / 21 }
        ];

        let aspectRatioForAI;
        if (imageAspectRatio && supportedStabilityRatios.some(r => r.string === imageAspectRatio)) {
            aspectRatioForAI = imageAspectRatio;
            console.log(`Using user-provided valid imageAspectRatio for AI: ${aspectRatioForAI}`);
        } else {
            if (imageAspectRatio) {
                console.warn(`User-provided imageAspectRatio "${imageAspectRatio}" is not directly supported or is invalid. Calculating closest match from card dimensions.`);
            }
            aspectRatioForAI = getClosestSupportedAspectRatio(cardWidthPx, cardHeightPx, supportedStabilityRatios);
        }

        const textPromptForGemini = `User Request: Generate ${numItemsToGenerate} concise dummy data item(s) for a printable card related to "${userPrompt}". The card dimensions are approximately ${cardWidthPx}px wide and ${cardHeightPx}px tall. The visual theme aims for an aspect ratio of ${aspectRatioForAI}.\n\nData Items:`;

        // --- 2. Call AI Services (Parallel) ---
        let aiGeneratedImageDataUri = null; // Specifically for AI generated image
        let generatedTextData = null;
        let imageGenerationError = null;
        let textGenerationError = null;

        console.log("Attempting to generate image with Stability AI...");
        const imagePromise = aiService.generateImageWithStabilityAI(
            imagePromptForStability,
            imageOutputFormat,
            aspectRatioForAI
        ).catch(err => {
            console.error("Stability AI Error (in parallel call):", err.message);
            imageGenerationError = err.message || "Stability AI image generation failed.";
            return null; // AI call failed, will resolve to null
        });

        console.log("Attempting to generate text with Gemini AI...");
        const textPromise = aiService.generateTextWithGemini(
            textPromptForGemini,
            undefined, // Use default model from ai.service.js (which reads from .env)
            CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION
        ).catch(err => {
            console.error("Gemini AI Error (in parallel call):", err.message);
            textGenerationError = err.message || "Gemini AI text generation failed.";
            return null;
        });

        [aiGeneratedImageDataUri, generatedTextData] = await Promise.all([imagePromise, textPromise]);

        // --- 3. Handle AI Service Results & Determine final image URL ---
        const aiImageGeneratedSuccessfully = !!aiGeneratedImageDataUri; // True if AI image service returned data
        const textGeneratedSuccessfully = !!generatedTextData;

        if (!aiImageGeneratedSuccessfully && !textGeneratedSuccessfully) {
            // If both critical AI services fail
            return res.status(502).json({
                message: "Both AI image and text generation failed.",
                imageError: imageGenerationError,
                textError: textGenerationError
            });
        }

        // Determine the final image URL to be used for the card element
        const finalImageUrl = aiImageGeneratedSuccessfully ? aiGeneratedImageDataUri : "";
        const finalTextContent = textGeneratedSuccessfully ? generatedTextData : `[Text generation failed for: ${userPrompt} - ${textGenerationError || 'Unknown error'}]`;

        // --- 4. Construct Card Elements & Save Card ---
        const elements = [];

        // Background Image Element (always added, uses AI image or backend's placeholder)
        elements.push({
            elementId: uuidv4(), type: 'image', imageUrl: finalImageUrl,
            x: 0, y: 0, width: cardWidthPx, height: cardHeightPx, zIndex: 0, rotation: 0
        });

        // Text Element
        const textPaddingHorizontal = Math.round(cardWidthPx * 0.1);
        let textBlockHeight = !aiImageGeneratedSuccessfully ? Math.round(cardHeightPx * 0.80) : Math.round(cardHeightPx * 0.45);
        textBlockHeight = Math.max(30, textBlockHeight); // Min height
        const textBlockWidth = cardWidthPx - (2 * textPaddingHorizontal);
        const textBlockX = textPaddingHorizontal;
        const textBlockY = Math.round((cardHeightPx - textBlockHeight) / 2);

        elements.push({
            elementId: uuidv4(), type: 'text', content: finalTextContent,
            x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
            fontSize: "22px", fontFamily: "Arial", color: defaultTextColor, // Use color from req.body
            textAlign: "center", zIndex: 1, rotation: 0
        });

        const newCard = new Card({
            name: cardName,
            promptUsed: userPrompt,
            widthPx: cardWidthPx,
            heightPx: cardHeightPx,
            elements: elements,
            metadata: {
                imageGenAspectRatio: aspectRatioForAI,
                outputFormat: (finalImageUrl && finalImageUrl.startsWith('data:image/')) // Check if it's a data URI
                                ? (finalImageUrl.match(/^data:image\/([a-z]+);/i)?.[1] || imageOutputFormat)
                                : "url_placeholder", // Indicate it's a placeholder URL from backend
                backgroundColor: '#FFFFFF',
                imageGenerationStatus: aiImageGeneratedSuccessfully ? "AI Success" : `AI Failed: ${imageGenerationError || 'Unknown'}`,
                textGenerationStatus: textGeneratedSuccessfully ? "Success" : `Failed: ${textGenerationError || 'Unknown'}`
            }
        });

        await newCard.save();

        res.status(201).json({
            message: `Card generation attempt complete. AI Image: ${aiImageGeneratedSuccessfully ? 'OK' : 'Failed/Placeholder'}. Text: ${textGeneratedSuccessfully ? 'OK' : 'Failed/Placeholder'}.`,
            card: newCard,
            imageWasAIgenerated: aiImageGeneratedSuccessfully, // Crucial flag for frontend
            textGeneratedSuccessfully: textGeneratedSuccessfully
        });

    } catch (error) {
        console.error("Error in generateFullCardFromPrompt Controller:", error.message, error.stack);
        res.status(500).json({ message: "Error generating full card.", error: error.message });
    }
};

function getClosestSupportedAspectRatio(width, height, supportedRatios) {
    if (height === 0) return "1:1";
    const targetRatio = width / height;
    let closestRatioString = "1:1";
    let smallestDifference = Infinity;
    supportedRatios.forEach(ratioObj => {
        const difference = Math.abs(targetRatio - ratioObj.value);
        if (difference < smallestDifference) {
            smallestDifference = difference;
            closestRatioString = ratioObj.string;
        }
    });
    console.log(`Target ratio for image: ${targetRatio.toFixed(2)}, Chosen supported Stability AI ratio string: ${closestRatioString}`);
    return closestRatioString;
}

exports.generateFullCardFromPrompt = async (req, res) => {
    try {
        const {
            userPrompt,
            cardName = "AI Generated Card", // Base name for the deck
            cardWidthPx = 512,
            cardHeightPx = 768,
            imageAspectRatio = null,
            imageOutputFormat = "png",
            numCardsInDeck = 1, // Received from frontend's "numItemsToGenerate"
            defaultTextColor = "#333333"
        } = req.body;

        if (!userPrompt || userPrompt.trim() === '') {
            return res.status(400).json({ message: "A user prompt is required." });
        }
        if (numCardsInDeck < 1 || numCardsInDeck > 50) { // Sensible limit for a single request
            return res.status(400).json({ message: "Number of cards per deck must be between 1 and 50." });
        }

        const imagePromptForStability = `${userPrompt}, card art, detailed, high quality, digital illustration`;
        const supportedStabilityRatios = [
            { string: "21:9", value: 21/9 }, { string: "16:9", value: 16/9 }, { string: "3:2", value: 3/2 },
            { string: "5:4", value: 5/4 }, { string: "1:1", value: 1/1 }, { string: "4:5", value: 4/5 },
            { string: "2:3", value: 2/3 }, { string: "9:16", value: 9/16 }, { string: "9:21", value: 9/21 }
        ];
        let aspectRatioForAI;
        if (imageAspectRatio && supportedStabilityRatios.some(r => r.string === imageAspectRatio)) {
            aspectRatioForAI = imageAspectRatio;
        } else {
            aspectRatioForAI = getClosestSupportedAspectRatio(cardWidthPx, cardHeightPx, supportedStabilityRatios);
        }

        // Ask Gemini for a list of text items, one for each card
        const textPromptForGemini = `User Request: Generate ${numCardsInDeck} distinct, concise data items suitable for individual game cards related to "${userPrompt}". Each item should be on a new line. The card dimensions are approximately ${cardWidthPx}px wide and ${cardHeightPx}px tall. The visual theme aims for an aspect ratio of ${aspectRatioForAI}.\n\nData Items List:`;

        // --- 2. Call AI Services ---
        let aiGeneratedImageDataUri = null;
        let generatedTextListData = null; // This will hold the multi-line string from Gemini
        let imageGenerationError = null;
        let textGenerationError = null;

        console.log("Attempting to generate base image with Stability AI...");
        const imagePromise = aiService.generateImageWithStabilityAI(
            imagePromptForStability, imageOutputFormat, aspectRatioForAI
        ).catch(err => {
            console.error("Stability AI Error:", err.message);
            imageGenerationError = err.message || "Stability AI image generation failed.";
            return null;
        });

        console.log("Attempting to generate text list with Gemini AI...");
        const textPromise = aiService.generateTextWithGemini(
            textPromptForGemini, undefined, CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION
        ).catch(err => {
            console.error("Gemini AI Error:", err.message);
            textGenerationError = err.message || "Gemini AI text generation failed.";
            return null;
        });

        [aiGeneratedImageDataUri, generatedTextListData] = await Promise.all([imagePromise, textPromise]);

        // --- 3. Handle AI Service Results ---
        const aiImageGeneratedSuccessfully = !!aiGeneratedImageDataUri;
        const textListGeneratedSuccessfully = !!generatedTextListData;

        if (!aiImageGeneratedSuccessfully && !textListGeneratedSuccessfully) {
            return res.status(502).json({
                message: "Both AI image and text generation failed.",
                imageError: imageGenerationError, textError: textGenerationError
            });
        }

        const finalBaseImageUrl = aiImageGeneratedSuccessfully ? aiGeneratedImageDataUri : "";
        
        let textItemsArray = [];
        if (textListGeneratedSuccessfully) {
            textItemsArray = generatedTextListData.split('\n').map(item => item.trim()).filter(item => item.length > 0);
            console.log(`Gemini returned ${textItemsArray.length} text items for the deck.`);
        } else {
            console.warn("Text generation failed for list. Using placeholders for deck.");
            for (let i = 0; i < numCardsInDeck; i++) {
                textItemsArray.push(`[Placeholder text for card ${i + 1} of deck - Topic: ${userPrompt} - Error: ${textGenerationError || 'Unknown'}]`);
            }
        }
        
        // Ensure we have enough text items, or truncate if too many
        const targetNumTexts = numCardsInDeck;
        const finalTextsForCards = [];
        for (let i = 0; i < targetNumTexts; i++) {
            if (i < textItemsArray.length) {
                finalTextsForCards.push(textItemsArray[i]);
            } else {
                finalTextsForCards.push(`[Placeholder - Card ${i + 1} - Not enough text items generated]`);
            }
        }


        // --- 4. Create and Save Multiple Card Documents ---
        const generatedCardsArray = [];
        for (let i = 0; i < numCardsInDeck; i++) {
            const individualCardText = finalTextsForCards[i];

            const elements = [];
            elements.push({
                elementId: uuidv4(), type: 'image', imageUrl: finalBaseImageUrl, // Same image for all
                x: 0, y: 0, width: cardWidthPx, height: cardHeightPx, zIndex: 0, rotation: 0
            });

            const textPaddingHorizontal = Math.round(cardWidthPx * 0.1);
            let textBlockHeight = !aiImageGeneratedSuccessfully ? Math.round(cardHeightPx * 0.80) : Math.round(cardHeightPx * 0.45);
            textBlockHeight = Math.max(30, textBlockHeight);
            const textBlockWidth = cardWidthPx - (2 * textPaddingHorizontal);
            const textBlockX = textPaddingHorizontal;
            const textBlockY = Math.round((cardHeightPx - textBlockHeight) / 2);

            elements.push({
                elementId: uuidv4(), type: 'text', content: individualCardText,
                x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
                fontSize: "22px", fontFamily: "Arial", color: defaultTextColor,
                textAlign: "center", zIndex: 1, rotation: 0
            });

            const newCard = new Card({
                name: `${cardName} - ${i + 1}/${numCardsInDeck}`, // e.g., "Math Deck - 1/5"
                promptUsed: userPrompt,
                originalDeckRequest: { baseName: cardName, indexInDeck: i + 1, totalInDeck: numCardsInDeck },
                widthPx: cardWidthPx, heightPx: cardHeightPx, elements: elements,
                metadata: {
                    imageGenAspectRatio: aspectRatioForAI,
                    outputFormat: (finalBaseImageUrl && finalBaseImageUrl.startsWith('data:image/'))
                                    ? (finalBaseImageUrl.match(/^data:image\/([a-z]+);/i)?.[1] || imageOutputFormat)
                                    : "url_placeholder",
                    backgroundColor: '#FFFFFF',
                    imageGenerationStatus: aiImageGeneratedSuccessfully ? "AI Success" : `AI Failed: ${imageGenerationError || 'Unknown'}`,
                    textGenerationStatus: textListGeneratedSuccessfully ? "Success" : `List Gen Failed: ${textGenerationError || 'Unknown'}`
                }
            });
            await newCard.save(); // In a production app, you might Promise.all(savePromises)
            generatedCardsArray.push(newCard);
        }

        res.status(201).json({
            message: `Deck of ${generatedCardsArray.length} cards generated. AI Image: ${aiImageGeneratedSuccessfully ? 'OK' : 'Failed/Placeholder'}. Text List: ${textListGeneratedSuccessfully ? 'OK' : 'Generated/Placeholders'}.`,
            cards: generatedCardsArray, // Returns an array of card objects
            imageWasAIgenerated: aiImageGeneratedSuccessfully,
            textListWasGenerated: textListGeneratedSuccessfully 
        });

    } catch (error) {
        console.error("Error in generateFullCardFromPrompt Controller:", error.message, error.stack);
        res.status(500).json({ message: "Error generating full card deck.", error: error.message });
    }
};