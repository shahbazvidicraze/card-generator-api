// src/controllers/card.controller.js
const Box = require('../models/Box.model'); // May need for auth/context
const Card = require('../models/Card.model');
const Element = require('../models/Element.model');
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


exports.getCardsByBox = async (req, res) => {
    try {
        const { boxId } = req.params;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder

        // Optional: Check if user owns the box
        const box = await Box.findOne({ _id: boxId, userId });
        if (!box) return res.status(404).json({ success:false, message: "Box not found or not authorized."});

        const cards = await Card.find({ boxId }).sort({ orderInBox: 1 });
        successResponse(res, "Cards for box retrieved.", cards);
    } catch (error) {
        errorResponse(res, "Failed to retrieve cards for box.", 500, "FETCH_CARDS_FAILED", error.message);
    }
};

// --- Standard Success Response ---
function successResponse(res, message, data, statusCode = 200, metadata = null) {
    const response = { success: true, message, data };
    if (metadata) response.metadata = metadata;
    res.status(statusCode).json(response);
}

// --- Standard Error Response ---
function errorResponse(res, message, statusCode = 500, errorCode = null, details = null) {
    const errorPayload = { details: details || message };
    if (errorCode) errorPayload.code = errorCode;
    res.status(statusCode).json({ success: false, message: errorPayload.details });
}

exports.createCardInBox = async (req, res) => {
    try {
        const { boxId } = req.params;
        const { name, widthPx, heightPx, cardFrontElements, cardBackElements, orderInBox } = req.body;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        const box = await Box.findOne({ _id: boxId, userId });
        if (!box) return res.status(404).json({ success:false, message: "Box not found or not authorized." });

        const newCard = new Card({
            name: name || 'New Card',
            boxId,
            userId,
            widthPx: widthPx || box.defaultCardWidthPx,
            heightPx: heightPx || box.defaultCardHeightPx,
            cardFrontElements: cardFrontElements || [], // Start with empty elements if not provided
            cardBackElements: cardBackElements || [],
            orderInBox: orderInBox || (await Card.countDocuments({ boxId })) // Simple way to append
        });
        const savedCard = await newCard.save();
        successResponse(res, "Card created successfully.", savedCard);
    } catch (error) { 
        errorResponse(res, "Failed to create card in box.", 500, "CREATE_CARD_FAILED", error.message);
     }
};

exports.updateCardDetails = async (req, res) => {
    console.log(`CARD_CONTROLLER: updateCardDetails called for cardId: ${req.params.cardId}`);
    try {
        const { cardId } = req.params;
        const { name, orderInBox, metadata } = req.body; // Whitelisted fields to update
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder for user ID

        if (!mongoose.Types.ObjectId.isValid(cardId)) {
            return res.status(400).json({ success:false, message: "Invalid Card ID format." });
        }

        const updates = {};
        if (name !== undefined && typeof name === 'string') updates.name = name.trim();
        if (orderInBox !== undefined && typeof orderInBox === 'number') updates.orderInBox = orderInBox;
        if (metadata && typeof metadata === 'object') {
            // For nested metadata, you might need to merge or set specific sub-fields
            // Simple approach: replace the whole metadata object if provided
            // More complex: use dot notation for specific fields e.g., "metadata.someKey"
            updates.metadata = metadata;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success:false, message: "No valid fields provided for update." });
        }

        updates.updatedAt = Date.now(); // Manually update if not relying solely on Mongoose timestamps for this

        // Find the card and ensure the authenticated user owns it (via box or direct userId on card)
        // This authorization check depends on your exact data model and auth strategy.
        // For now, assuming userId is directly on the Card model for simplicity of this check.
        const card = await Card.findOne({ _id: cardId, userId });
        if (!card) {
            return res.status(404).json({ success:false, message: "Card not found or you are not authorized to update it." });
        }

        // If card belongs to a box, you might re-verify box ownership:
        // const box = await Box.findOne({ _id: card.boxId, userId });
        // if (!box) {
        //     return res.status(403).json({ message: "Not authorized to update cards in this box." });
        // }

        const updatedCard = await Card.findByIdAndUpdate(
            cardId,
            { $set: updates },
            { new: true, runValidators: true } // new: true returns the modified document
        ).populate('cardFrontElementIds').populate('cardBackElementIds'); // Populate for response

        if (!updatedCard) { // Should be caught by the findOne check above, but good safety
            return res.status(404).json({ success:false, message: "Card not found after update attempt." });
        }
        
        // Similar to getCardById, structure the response
        const cardResponseObject = updatedCard.toObject();
        cardResponseObject.cardFrontElements = (updatedCard.cardFrontElementIds || []).map(el => el.toObject ? el.toObject() : el);
        cardResponseObject.cardBackElements = (updatedCard.cardBackElementIds || []).map(el => el.toObject ? el.toObject() : el);
        // If you want to keep the IDs arrays as well:
        cardResponseObject.cardFrontElementIds = (updatedCard.cardFrontElementIds || []).map(el => el._id);
        cardResponseObject.cardBackElementIds = (updatedCard.cardBackElementIds || []).map(el => el._id);


        successResponse(res, "Card details updated successfully.", cardResponseObject);
        console.log(`CARD_CONTROLLER: Card ${cardId} details updated successfully.`);

    } catch (error) {
        console.error("Error in updateCardDetails Controller:", error.message, error.stack);
        if (error.name === 'ValidationError') {
            errorResponse(res, "Failed to update card details for box.", 400, "UPDATE_CARD_DEETAILS_VALIDATION_FAILED", error.message);
        }
        errorResponse(res, "Error updating card details.", 500, "UPDATE_CARD_DEETAILS_VALIDATION_FAILED", error.message);
    }
};

exports.deleteCard = async (req, res) => {
    console.log(`CARD_CONTROLLER: deleteCard called for cardId: ${req.params.cardId}`);
    try {
        const { cardId } = req.params;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder for user ID

        if (!mongoose.Types.ObjectId.isValid(cardId)) {
            return res.status(400).json({ success:false, message: "Invalid Card ID format." });
        }

        // 1. Find the card to ensure user ownership and to get element IDs for deletion
        const cardToDelete = await Card.findOne({ _id: cardId, userId });

        if (!cardToDelete) {
            return res.status(404).json({ success:false, message: "Card not found or you are not authorized to delete it." });
        }

        // 2. Collect all element IDs associated with this card
        const elementIdsToDelete = [
            ...(cardToDelete.cardFrontElementIds || []),
            ...(cardToDelete.cardBackElementIds || [])
        ];

        // 3. Delete the associated elements from the Element collection
        if (elementIdsToDelete.length > 0) {
            const deleteResult = await Element.deleteMany({ 
                _id: { $in: elementIdsToDelete },
                userId: userId // Extra safety: ensure user owns these elements too
            });
            console.log(`CARD_CONTROLLER: Deleted ${deleteResult.deletedCount} elements associated with card ${cardId}.`);
        }

        // 4. Delete the card itself
        await Card.findByIdAndDelete(cardId); // cardToDelete._id is the same as cardId

        successResponse(res, `Card ${cardId} and its elements deleted successfully.`);
        console.log(`CARD_CONTROLLER: Card ${cardId} deleted successfully.`);

    } catch (error) {
        console.error("Error in deleteCard Controller:", error.message, error.stack);
        errorResponse(res, "Error deleting card.", 500, "DELETE_CARD_FAILED", error.message);
    }
};

// Helper function (if not already global or imported)
const getElementArrayPath = (face) => {
    return face === 'back' ? 'cardBackElementIds' : 'cardFrontElementIds';
};

exports.addCardElement = async (req, res) => {
    console.log(`CARD_CONTROLLER: addCardElement called for cardId: ${req.params.cardId}, query:`, req.query);
    try {
        const { cardId } = req.params;
        // const { face = 'front' } = req.query; // Default to 'front' if not specified
        // const { type, ...elementProps } = req.body;
        const { face = 'front' } = req.query; // Get 'face' from query as a default/fallback
        const { 
            type, 
            isFrontElement: isFrontElementFromBody, // Destructure isFrontElement from body
            ...elementProps 
        } = req.body;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder

        console.log("Payload for new card element:", { type, isFrontElementFromBody, ...elementProps });

        if (!mongoose.Types.ObjectId.isValid(cardId)) {
            return res.status(400).json({ success:false, message: 'Invalid Card ID format.' });
        }
        if (!type || !['text', 'image', 'shape'].includes(type)) {
            return res.status(400).json({ success:false, message: `Invalid or missing element type. Received: ${type}` });
        }

        // 1. Find the parent card and verify ownership
        const card = await Card.findOne({ _id: cardId, userId });
        if (!card) {
            console.log("Card not found or user not authorized for cardId:", cardId);
            return res.status(404).json({ success:false, message: "Card not found or not authorized." });
        }
        console.log("Found parent card:", card.name);

        // --- Determine finalIsFront ---
        let finalIsFront;
        if (typeof isFrontElementFromBody === 'boolean') {
            finalIsFront = isFrontElementFromBody; // Body value takes precedence
            console.log(`CARD_CONTROLLER: Using isFrontElement from BODY: ${finalIsFront}`);
        } else {
            finalIsFront = face.toLowerCase() === 'front'; // Fallback to query param logic
            console.log(`CARD_CONTROLLER: Using isFrontElement from QUERY param ('${face}'): ${finalIsFront}`);
        }

        // 2. Create the new Element document
        const newElementData = {
            cardId: card._id,
            boxId: card.boxId, // Get from parent card
            userId: card.userId, // Inherit from card, or use req.user.id directly
            isFrontElement: finalIsFront, // Use the determined boolean
            type,
            ...elementProps
        };
        console.log("Data for new Element document:", newElementData);

        const newElementDoc = new Element(newElementData);
        const savedElement = await newElementDoc.save();
        console.log("New Element saved, ID:", savedElement._id);

        // 3. Add the new element's ID to the card's appropriate element ID array
        const elementIdArrayPath = getElementArrayPath(face); // 'cardFrontElementIds' or 'cardBackElementIds'
        console.log("Pushing element ID to path:", elementIdArrayPath);

        const updatedCard = await Card.findByIdAndUpdate(
            cardId,
            { $push: { [elementIdArrayPath]: savedElement._id }, $set: { updatedAt: Date.now() } },
            { new: true, runValidators: true }
        )
        .populate('cardFrontElementIds') // Populate for the response
        .populate('cardBackElementIds');

        if (!updatedCard) { // Should be rare if previous check passed
            console.error("Failed to update card after adding element ID. CardId:", cardId);
            // Potentially roll back element creation if card update fails
            await Element.findByIdAndDelete(savedElement._id);
            return res.status(500).json({ success:false, message: "Failed to link element to card." });
        }
        
        console.log("Card updated with new element ID. Responding with populated card.");
        // Structure response like getCardById
        const cardResponseObject = updatedCard.toObject();
        cardResponseObject.cardFrontElements = (updatedCard.cardFrontElementIds || []).map(el => el.toObject ? el.toObject() : el);
        cardResponseObject.cardBackElements = (updatedCard.cardBackElementIds || []).map(el => el.toObject ? el.toObject() : el);
        cardResponseObject.cardFrontElementIds = (updatedCard.cardFrontElementIds || []).map(el => el._id); // Keep original IDs
        cardResponseObject.cardBackElementIds = (updatedCard.cardBackElementIds || []).map(el => el._id);

        successResponse(res, "Card element added successfully.", cardResponseObject);

    } catch (error) {
        console.error("Error in addCardElement Controller:", error.message, error.stack);
        if (error.name === 'ValidationError') { // Mongoose validation error for Element or Card
            errorResponse(res, "Validation Error adding element", 400, "ADD_CARD_ELEMENT_VALIDATION_FAILED", error.message);
        }

        errorResponse(res, 'Error adding element to card', 500, "ADD_CARD_ELEMENT_FAILED", error.message);
    }
};

exports.updateCardElement = async (req, res) => {
    try {
        const { cardId, elementId } = req.params; // elementId here is our custom uuid
        const { face = 'front' } = req.query;
        const updates = req.body; // e.g., { x: 10, y: 20, content: "New Text" }
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        const elementArrayPath = getElementArrayPath(face);
        const setUpdates = {};
        for (const key in updates) {
            setUpdates[`${elementArrayPath}.$.${key}`] = updates[key];
        }
        setUpdates[`${elementArrayPath}.$.updatedAt`] = Date.now(); // If elements had timestamps

        const updatedCard = await Card.findOneAndUpdate(
            { _id: cardId, userId, [`${elementArrayPath}.elementId`]: elementId },
            { $set: setUpdates },
            { new: true, runValidators: true }
        );
        if (!updatedCard) return res.status(404).json({ success:false, message: "Card or element not found, or not authorized." });
        successResponse(res, "Card element updated successfully.", updatedCard);
    } catch (error) { 
        errorResponse(res, "Failed to update card element.", 500, "UPDATE_CARD_ELEMENT_FAILED", error.message);
     }
};

exports.deleteCardElement = async (req, res) => {
    try {
        const { cardId, elementId } = req.params;
        const { face = 'front' } = req.query;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        const elementArrayPath = getElementArrayPath(face);
        const updatedCard = await Card.findOneAndUpdate(
            { _id: cardId, userId },
            { $pull: { [elementArrayPath]: { elementId: elementId } } },
            { new: true }
        );
        if (!updatedCard) return res.status(404).json({ success:false, message: "Card not found or not authorized." });
        successResponse(res, "Card element deleted successfully.", updatedCard);
    } catch (error) { 
        errorResponse(res, "Failed to delete card element.", 500, "DELETE_CARD_ELEMENT_FAILED", error.message);
     }
};


exports.generateCardWithAI = async (req, res) => {
    try {
        const {
            prompt,
            name = "AI Generated Card",
            aspectRatio = "1:1",
            outputFormat = "png"
        } = req.body;

        if (!prompt) {
            return res.status(400).json({ success:false, message: "Prompt is required." });
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
        res.status(201).json({ success:true, message: "Card generated successfully!", card: newCard, artUrl: newCard.cardArtUrl });

    } catch (error) {
        console.error("Error in generateCardWithAI Controller:", error.message);
        // Handle specific errors thrown by ai.service.js or other issues
        if (error.message.includes("Stability AI returned an empty image")) {
            return res.status(502).json({ success:false, message: "AI service reported an empty image.", details: error.message });
        } else if (error.message.includes("Stability AI API key")) {
            return res.status(500).json({ success:false, message: "AI service not configured.", details: error.message });
        } else if (error.message.includes("Stability AI")) { // Catches other Stability/Axios errors
            return res.status(502).json({ success:false, message: "AI image generation failed.", details: error.message });
        }
        // Generic fallback
        res.status(500).json({ success:false, message: error.message });
    }
};

// NEW FUNCTION to add an element
exports.addElementToCard = async (req, res) => {
    try {
        const { cardId } = req.params;
        const { type, ...elementProps } = req.body; // Element type and its properties

        if (!mongoose.Types.ObjectId.isValid(cardId)) {
            return res.status(400).json({ success:false, message: 'Invalid Card ID format.' });
        }

        if (!type || !['text', 'image'].includes(type)) { // Add more types as you support them
            return res.status(400).json({ success:false, message: 'Invalid or missing element type.' });
        }

        const card = await Card.findById(cardId);
        if (!card) {
            return res.status(404).json({ success:false, message: 'Card not found.' });
        }

        const newElement = {
            elementId: uuidv4(), // Generate a unique ID for the new element
            type: type,
            ...elementProps, // Spread the rest of the properties from req.body
        };

        // Validate required fields based on type (optional, but good practice)
        if (type === 'text' && (typeof newElement.content === 'undefined')) {
            // newElement.content = ''; // Or return error:
            return res.status(400).json({ success:false, message: 'Text content is required for text element.'});
        }
        if (type === 'image' && !newElement.imageUrl) {
            return res.status(400).json({ success:false, message: 'Image URL is required for image element.'});
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
            return res.status(404).json({ success:false, message: 'Card not found after update attempt.' });
        }

        successResponse(res, 'Element added successfully', updatedCard);

    } catch (error) {
        console.error("Error in addElementToCard:", error);
        if (error.name === 'ValidationError') {
            errorResponse(res, "Failed to add elements to card.", 400, "ADD_CARD_ELEMENT_VALIDATION_FAILED", error.message);
        }
        errorResponse(res, "Failed to add elements to card.", 500, "ADD_CARD_ELEMENT_VALIDATION_FAILED", error.message);
    }
};

exports.getCardById = async (req, res) => {
    console.log(`CARD_CONTROLLER: getCardById called for cardId: ${req.params.cardId}`);
    try {
        const { cardId } = req.params;
        // Assuming userId would be checked if cards are user-specific, e.g., through box ownership
        // const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; 

        if (!mongoose.Types.ObjectId.isValid(cardId)) {
            return res.status(400).json({ success:false, message: "Invalid Card ID format." });
        }

        // 1. Find the Card and populate its element ID fields
        const cardFromDB = await Card.findById(cardId)
            // .findOne({ _id: cardId, userId }) // If you need to check ownership via userId on the card
            .populate('cardFrontElementIds') // Populate with Element documents
            .populate('cardBackElementIds')   // Populate with Element documents
            .lean(); // Get a plain JavaScript object

        if (!cardFromDB) {
            return res.status(404).json({ success:false, message: "Card not found or not authorized." });
        }
        console.log(`CARD_CONTROLLER: Found card ${cardId}.`);

        // 2. Construct the response object with the desired structure
        // 'cardFromDB' is already a plain JS object due to .lean()
        // The populated 'cardFrontElementIds' and 'cardBackElementIds' now hold arrays of Element objects.

        const cardResponseObject = {
            _id: cardFromDB._id,
            name: cardFromDB.name,
            boxId: cardFromDB.boxId,
            userId: cardFromDB.userId,
            orderInBox: cardFromDB.orderInBox,
            widthPx: cardFromDB.widthPx,
            heightPx: cardFromDB.heightPx,
            metadata: cardFromDB.metadata,
            createdAt: cardFromDB.createdAt,
            updatedAt: cardFromDB.updatedAt,
            __v: cardFromDB.__v, // If you wish to include it

            // A. Store the populated elements in the desired fields
            cardFrontElements: cardFromDB.cardFrontElementIds || [], // After populate, this holds Element objects
            cardBackElements: cardFromDB.cardBackElementIds || [],   // After populate, this holds Element objects

            // B. Re-extract just the IDs for the *_ElementIds fields from the populated arrays
            cardFrontElementIds: (cardFromDB.cardFrontElementIds || []).map(element => element._id),
            cardBackElementIds: (cardFromDB.cardBackElementIds || []).map(element => element._id),
        };
        
        // If you also store originalDeckRequest or promptUsed on the card model, add them here:
        if (cardFromDB.originalDeckRequest) {
            cardResponseObject.originalDeckRequest = cardFromDB.originalDeckRequest;
        }
        if (cardFromDB.promptUsed) {
            cardResponseObject.promptUsed = cardFromDB.promptUsed;
        }


        successResponse(res, "Card retrieved successfully.", cardResponseObject);
        console.log("CARD_CONTROLLER: Sent populated card data.");

    } catch (error) {
        console.error("Error in getCardById Controller:", error.message, error.stack);
        errorResponse(res, "Error fetching card details.", 500, "FETCH_CARD_FAILED", error.message);
    }
};

exports.getAllCards = async (req, res) => {
    try {
        const cards = await Card.find().sort({ createdAt: -1 });
        successResponse(res, 'Cards retrieved successfully', cards);
    } catch (error) {
        console.error("Error in getAllCards:", error);
        errorResponse(res, 'Error fetching cards', 500, "FETCH_CARD_FAILED", error.message);
    }
};


exports.generateTextForCard = async (req, res) => {
    try {
        const userRawPrompt = req.body.prompt;

        if (!userRawPrompt || userRawPrompt.trim() === '') {
            return res.status(400).json({ success:false, message: "A prompt describing the desired card data is required." });
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
            success: true,
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

exports.generateFullCardFromPromptOldOld = async (req, res) => {
    try {
        const {
            userPrompt,
            cardName = "AI Generated Card",
            cardWidthPx = 512,
            cardHeightPx = 768,
            imageAspectRatio = null,
            imageOutputFormat = "png",
            numCardsInDeck = 1,
            defaultTextColor = "#333333",
            cardBackImageDataUri = null, // For the card's back
            fallbackImageBase64DataUri = null // NEW: Fallback for FRONT image, sent by frontend
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

        // --- Determine the final image URL for the card FRONT ---
        let finalFrontImageUrl;
        if (aiImageGeneratedSuccessfully) {
            finalFrontImageUrl = aiGeneratedImageDataUri;
            console.log("CONTROLLER: Using AI Generated Image for card front.");
        } else if (fallbackImageBase64DataUri && fallbackImageBase64DataUri.startsWith('data:image')) {
            finalFrontImageUrl = fallbackImageBase64DataUri;
            console.log("CONTROLLER: AI Image failed, using fallbackImageBase64DataUri from frontend for card front.");
        } else {
            finalFrontImageUrl = "";
            console.log("CONTROLLER: AI Image failed, no valid frontend fallback, using backend's default placeholder for card front.");
        }

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
            const individualCardText = finalTextsForCards[i] || `[Default Text Card ${i+1}]`;
            
            const cardFrontElements = [];
            // Card Front Background Image Element
            cardFrontElements.push({
                elementId: uuidv4(), type: 'image', imageUrl: finalFrontImageUrl,
                x: 0, y: 0, width: cardWidthPx, height: cardHeightPx, zIndex: 0, rotation: 0
            });
            // Card Front Text Element
            const textPaddingHorizontal = Math.round(cardWidthPx * 0.1);
            let textBlockHeight = !aiImageGeneratedSuccessfully ? Math.round(cardHeightPx * 0.80) : Math.round(cardHeightPx * 0.45);
            textBlockHeight = Math.max(30, textBlockHeight);
            const textBlockWidth = cardWidthPx - (2 * textPaddingHorizontal);
            const textBlockX = textPaddingHorizontal;
            const textBlockY = Math.round((cardHeightPx - textBlockHeight) / 2);
            cardFrontElements.push({
                elementId: uuidv4(), type: 'text', content: individualCardText,
                x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
                fontSize: "22px", fontFamily: "Arial", color: defaultTextColor,
                textAlign: "center", zIndex: 1, rotation: 0
            });

            // --- Construct cardBackElements ---
            const cardBackElements = [];
            if (cardBackImageDataUri && cardBackImageDataUri.startsWith('data:image')) {
                cardBackElements.push({
                    elementId: uuidv4() + "-back", // Ensure unique ID
                    type: 'image',
                    imageUrl: cardBackImageDataUri,
                    x: 0, y: 0,
                    width: cardWidthPx, // Back image covers the whole card
                    height: cardHeightPx,
                    zIndex: 0,
                    rotation: 0
                });
            } else {
                // Optionally add a default placeholder text element if no back image
                console.log(`Card ${i+1}: No valid cardBackImageDataUri provided. Card back will be blank or use default BG.`);
                // Or add a default placeholder image element for the back if you have one
                // cardBackElements.push({ elementId: uuidv4() + "-back-placeholder", type: 'image', imageUrl: "URL_TO_DEFAULT_BACK_DESIGN", ... });
            }

            const newCard = new Card({
                name: `${cardName} - ${i + 1}/${numCardsInDeck}`,
                promptUsed: userPrompt,
                originalDeckRequest: { baseName: cardName, indexInDeck: i + 1, totalInDeck: numCardsInDeck },
                widthPx: cardWidthPx,
                heightPx: cardHeightPx,
                cardFrontElements: cardFrontElements, // Use new field name
                cardBackElements: cardBackElements,   // Use new field name
                metadata: {
                    imageGenAspectRatio: aspectRatioForAI,
                    outputFormat: (finalFrontImageUrl && finalFrontImageUrl.startsWith('data:image/'))
                                    ? (finalFrontImageUrl.match(/^data:image\/([a-z]+);/i)?.[1] || imageOutputFormat)
                                    : "url_placeholder_or_fallback",
                    backgroundColor: '#FFFFFF',
                    imageGenerationStatus: aiImageGeneratedSuccessfully ? "AI Success" : (fallbackImageBase64DataUri ? "Frontend Fallback Used by Backend" : `AI Failed/Backend Placeholder: ${imageGenerationError || 'Unknown'}`),
                    textGenerationStatus: textListGeneratedSuccessfully ? "Success" : `List Gen Failed: ${textGenerationError || 'Unknown'}`
                }
            });
            // ... (save card with try-catch as before) ...
            try {
                const savedCard = await newCard.save();
                generatedCardsArray.push(savedCard);
            } catch (dbError) { console.error(`DB Save Error for card ${i+1}:`, dbError); generatedCardsArray.push({error: dbError.message}); }
        }
        
        const successfullySavedCards = generatedCardsArray.filter(card => card && !card.error);
        // ... (response logic based on successfullySavedCards) ...

        res.status(201).json({
            message: `Deck of ${successfullySavedCards.length}/${numCardsInDeck} cards processed...`,
            cards: successfullySavedCards,
            imageWasAIgenerated: aiImageGeneratedSuccessfully,
            textListWasGenerated: textListGeneratedSuccessfully
        });

    } catch (error) {
        console.error("Error in generateFullCardFromPrompt Controller:", error.message, error.stack);
        res.status(500).json({ message: "Error generating full card deck.", error: error.message });
    }
};