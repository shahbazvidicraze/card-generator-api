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
const DEFAULT_PLACEHOLDER_IMAGE_URL = "https://i.pinimg.com/736x/c6/2a/3e/c62a3e65a0c8c38ef695144b447cd7dc.jpg";
// const PREDEFINED_IMAGE_URLS = [
//     "https://i.pinimg.com/736x/c6/2a/3e/c62a3e65a0c8c38ef695144b447cd7dc.jpg",
//     "https://i.pinimg.com/736x/b5/1c/99/b51c99f3d03d029d1dea464b89b4329c.jpg",
//     "https://image.slidesdocs.com/responsive-images/docs/stationery-for-education-in-a-bubble-page-border-background-word-template_3737a7d4a6__1131_1600.jpg",
//     "https://image.slidesdocs.com/responsive-images/docs/simplifying-math-with-a-touch-of-green-page-border-background-word-template_3241e560c8__1131_1600.jpg",
//     "https://clipart-library.com/images/pi7r57ndT.jpg",
//     "https://i.pinimg.com/736x/bb/94/11/bb94116a9f46a6e4a54533f082bf4cfb.jpg",
//     "https://wallpapers.com/images/hd/school-picture-background-3w7ny3s5pak6kw2l.jpg"
// ];

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
            imageAspectRatio = null, // This is the user's direct input, could be null or an unsupported string
            imageOutputFormat = "png",
            numItemsToGenerate = 1,
            forcePredefinedImage,
            defaultTextColor = "#333333"
        } = req.body;

        if (!userPrompt || userPrompt.trim() === '') {
            return res.status(400).json({ message: "A user prompt is required." });
        }

        // Determine if we should use predefined images
        const usePredefinedImages = forcePredefinedImage === true || // If client explicitly requests it
                                   process.env.USE_PREDEFINED_IMAGES === 'true' || // Or if env var is set
                                   !process.env.STABILITY_API_KEY; // Or if Stability key is missing (good for dev)

        if (usePredefinedImages) {
            console.log("Condition met to use predefined images or fallback due to config.");
        }

        const imagePromptForStability = `${userPrompt}, card art, detailed, high quality, digital illustration`;

        const supportedStabilityRatios = [
            { string: "21:9", value: 21 / 9 }, { string: "16:9", value: 16 / 9 },
            { string: "3:2", value: 3 / 2 }, { string: "5:4", value: 5 / 4 },
            { string: "1:1", value: 1 / 1 }, { string: "4:5", value: 4 / 5 },
            { string: "2:3", value: 2 / 3 }, { string: "9:16", value: 9 / 16 },
            { string: "9:21", value: 9 / 21 }
        ];

        // Declare aspectRatioForAI here so it's in scope for the whole try block
        let aspectRatioForAI; // <<<<<<<<<<<<<<<<<<< DECLARED HERE

        if (imageAspectRatio && supportedStabilityRatios.some(r => r.string === imageAspectRatio)) {
            aspectRatioForAI = imageAspectRatio; // <<<<<<<<<<<<<<<<<<< ASSIGNED HERE
            console.log(`Using user-provided valid imageAspectRatio for AI: ${aspectRatioForAI}`);
        } else {
            if (imageAspectRatio) { // Log if user provided an unsupported one
                console.warn(`User-provided imageAspectRatio "${imageAspectRatio}" is not directly supported or is invalid. Calculating closest match from card dimensions.`);
            }
            aspectRatioForAI = getClosestSupportedAspectRatio(cardWidthPx, cardHeightPx, supportedStabilityRatios); // <<<<<< ASSIGNED HERE
        }

        // Now aspectRatioForAI is guaranteed to be defined and one of the supported strings
        const textPromptForGemini = `User Request: Generate ${numItemsToGenerate} concise dummy data item(s) for a printable card related to "${userPrompt}". The card dimensions are approximately ${cardWidthPx}px wide and ${cardHeightPx}px tall. The visual theme aims for an aspect ratio of ${aspectRatioForAI}.\n\nData Items:`;
        //                                                                                                                                                                                           ^^^^^^^^^^^^^^^^^^ USED HERE

        // --- 2. Call AI Services / Get Predefined Image ---
        let generatedImageDataUri = null; // This will now be a URL string or data URI
        let generatedTextData = null;
        let imageGenerationError = null;
        let textGenerationError = null;
        let imageIsFromPredefined = false;

        let imagePromise;

        if (usePredefinedImages || PREDEFINED_IMAGE_URLS.length > 0 && !process.env.STABILITY_API_KEY /* Another condition example */) {
            console.log("Using predefined image URL.");
            if (PREDEFINED_IMAGE_URLS.length > 0) {
                const randomIndex = Math.floor(Math.random() * PREDEFINED_IMAGE_URLS.length);
                generatedImageDataUri = PREDEFINED_IMAGE_URLS[randomIndex];
                imageIsFromPredefined = true;
                imagePromise = Promise.resolve(generatedImageDataUri); // Resolve immediately
            } else {
                console.warn("Attempted to use predefined images, but the list is empty. Using default placeholder.");
                generatedImageDataUri = DEFAULT_PLACEHOLDER_IMAGE_URL;
                imageIsFromPredefined = true; // Still considered "predefined" in terms of not calling AI
                imageGenerationError = "Predefined image list is empty.";
                imagePromise = Promise.resolve(generatedImageDataUri);
            }
        } else {
            console.log("Attempting to generate image with Stability AI...");
            imagePromise = aiService.generateImageWithStabilityAI(
                imagePromptForStability,
                imageOutputFormat,
                aspectRatioForAI
            ).catch(err => {
                console.error("Stability AI Error (in parallel call):", err.message);
                imageGenerationError = err.message || "Stability AI image generation failed.";
                // Fallback to predefined if AI fails
                if (PREDEFINED_IMAGE_URLS.length > 0) {
                    console.log("Stability AI failed, falling back to predefined image URL.");
                    const randomIndex = Math.floor(Math.random() * PREDEFINED_IMAGE_URLS.length);
                    imageIsFromPredefined = true;
                    return PREDEFINED_IMAGE_URLS[randomIndex]; // Return a predefined URL
                }
                imageIsFromPredefined = true; // No AI image, and no predefined, so it will be placeholder
                return DEFAULT_PLACEHOLDER_IMAGE_URL; // Ultimate fallback
            });
        }

        console.log("Attempting to generate text with Gemini AI...");
        const textPromise = aiService.generateTextWithGemini(
            textPromptForGemini,
            undefined,
            CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION
        ).catch(err => {
            console.error("Gemini AI Error (in parallel call):", err.message);
            textGenerationError = err.message || "Gemini AI text generation failed.";
            return null; // Allow Promise.all to resolve
        });

        // Wait for promises to settle
        // The result of imagePromise will now be either a data URI from AI or a predefined URL string
        [generatedImageDataUri, generatedTextData] = await Promise.all([imagePromise, textPromise]);


        // --- 3. Handle AI Service Results ---
        // generatedImageDataUri will always have a value here (either AI, predefined, or placeholder)
        let imageSuccess = !imageGenerationError && !imageIsFromPredefined; // True only if AI generated successfully
        let textSuccess = !!generatedTextData && !textGenerationError;

        // If using predefined or placeholder, imageGenerationError might be set from the catch block
        // or it might be null if we directly chose a predefined image.
        // The key is that `generatedImageDataUri` will have a value.

        if (!generatedImageDataUri && !textSuccess) { // Only if generatedImageDataUri somehow became null AND text failed
            return res.status(502).json({ /* ... both failed (less likely for image now) ... */ });
        }

        let finalImageUrl = generatedImageDataUri; // Already holds AI, predefined, or placeholder
        let finalTextContent = textSuccess ? generatedTextData : `[Text generation failed: ${textGenerationError || 'Unknown'}]`;

        // --- 4. Construct Card Elements & Save Card ---
        const elements = [];
        elements.push({
            elementId: uuidv4(), type: 'image', imageUrl: finalImageUrl, // This is now a URL or data URI
            x: 0, y: 0, width: cardWidthPx, height: cardHeightPx, zIndex: 0, rotation: 0
        });
        // ... (text element construction remains the same as your last working version) ...
        const textPaddingHorizontal = Math.round(cardWidthPx * 0.1);
        let textBlockHeight = imageIsFromPredefined || imageGenerationError ? Math.round(cardHeightPx * 0.80) : Math.round(cardHeightPx * 0.45);
        textBlockHeight = Math.max(30, textBlockHeight);
        const textBlockWidth = cardWidthPx - (2 * textPaddingHorizontal);
        const textBlockX = textPaddingHorizontal;
        const textBlockY = Math.round((cardHeightPx - textBlockHeight) / 2);
        // const textBlockY = Math.round((cardHeightPx - 50) / 2);

       elements.push({
            elementId: uuidv4(),
            type: 'text',
            content: finalTextContent,
            x: textBlockX,
            y: textBlockY,
            width: textBlockWidth,
            height: textBlockHeight,
            fontSize: "22px",
            fontFamily: "Arial",
            color: defaultTextColor, // <<<< USE THE INCOMING TEXT COLOR HERE
            textAlign: "center",
            zIndex: 1,
            rotation: 0
        });

        const newCard = new Card({
            name: cardName,
            promptUsed: userPrompt,
            widthPx: cardWidthPx,
            heightPx: cardHeightPx,
            elements: elements,
            metadata: {
                imageGenAspectRatio: aspectRatioForAI,
                outputFormat: (finalImageUrl && finalImageUrl.startsWith('data:image/'))
                                ? (finalImageUrl.match(/^data:image\/([a-z]+);/i)?.[1] || imageOutputFormat)
                                : (imageIsFromPredefined ? "predefined_url" : imageOutputFormat),
                backgroundColor: '#FFFFFF', // Consider if this should also be influenced by theme color
                selectedThemeColorHex: defaultTextColor, // Store the chosen text color
                imageGenerationStatus: imageGenerationError ? `Failed: ${imageGenerationError}` : (imageIsFromPredefined ? "Predefined/Fallback" : "AI Success"),
                textGenerationStatus: textGenerationError ? `Failed: ${textGenerationError}` : "Success"
            }
        });

        await newCard.save();

        res.status(201).json({
            message: `Card generation complete. Image: ${imageGenerationError ? (imageIsFromPredefined ? 'Predefined Used after AI Fail' : 'Placeholder Used') : (imageIsFromPredefined ? 'Predefined Used' : 'AI OK')}. Text: ${textGenerationError ? 'Placeholder Used' : 'OK'}.`,
            card: newCard,
            imageWasAIgenerated: imageSuccess,
            imageIsPredefined: imageIsFromPredefined,
            textGeneratedSuccessfully: textSuccess
        });

    } catch (error) {
        console.error("Error in generateFullCardFromPrompt Controller:", error.message, error.stack);
        res.status(500).json({ message: "Error generating full card.", error: error.message });
    }
};

exports.generateFullCardFromPrompt = async (req, res) => {
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
        const finalImageUrl = aiImageGeneratedSuccessfully ? aiGeneratedImageDataUri : DEFAULT_PLACEHOLDER_IMAGE_URL;
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