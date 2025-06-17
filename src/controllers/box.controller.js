// src/controllers/box.controller.js
const Box = require('../models/Box.model');
const Card = require('../models/Card.model'); // Needed for deleting cards with box
const Element = require('../models/Element.model');
const aiService = require('../services/ai.service');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken'); // For optional token check
const User = require('../models/User.model'); // For optional token check

// --- Constants (can be moved to a config file) ---
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

const DEFAULT_BACKEND_PLACEHOLDER_IMAGE_URL ="";

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

// This is the function we worked on, moved here
exports.generateNewDeckAndBox = async (req, res) => {
    console.log("BOX_CONTROLLER: generateNewDeckAndBox started.");
     try {
        const {
            boxName, boxDescription = "", userPrompt, genre = "Educational",
            accentColorHex = "#333333", defaultCardWidthPx = 315, defaultCardHeightPx = 440,
            imageAspectRatioForDeck = null, imageOutputFormatForDeck = "png",
            numCardsInDeck = 1, cardBackImageDataUri = null,
            fallbackFrontImageBase64DataUri = null
        } = req.body;

        let userId = null;
        let isGuest = true;

        // Optional: Check for an auth token even if route isn't protected
        // This allows logged-in users to have their creations immediately associated.
        // This part requires a "soft" auth check middleware or direct token verification here.
        // For simplicity, let's assume for now: if no token, it's a guest.
        // If you send a token, you'd need to verify it here (similar to 'protect' but not failing if no token).

        // Let's assume for now: if req.user exists (e.g. if you make 'protect' middleware optional)
        if (req.user && req.user.id) { // req.user would be set by a modified/optional protect middleware
            userId = req.user.id;
            isGuest = false;
        }
        // OR, if you want to handle the token explicitly in this controller:
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);
                if (user) {
                    userId = user._id;
                    isGuest = false;
                }
            } catch (err) {
                // Token invalid or expired, proceed as guest
                console.log('Optional token check failed, proceeding as guest:', err.message);
            }
        }

        if (typeof boxName !== 'string' || boxName.trim() === '') {
            return res.status(400).json({ success: false, message: "Box name is required and must be a valid string." });
        }
        if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
            return res.status(400).json({ success: false, message: "A user prompt is required." });
        }
        // ... other validations for numCardsInDeck etc. ...

        // --- 1. Determine AI Settings & Prepare Prompts ---
        const supportedStabilityRatios = [
            { string: "21:9", value: 21/9 }, { string: "16:9", value: 16/9 }, { string: "3:2", value: 3/2 },
            { string: "5:4", value: 5/4 }, { string: "1:1", value: 1/1 }, { string: "4:5", value: 4/5 },
            { string: "2:3", value: 2/3 }, { string: "9:16", value: 9/16 }, { string: "9:21", value: 9/21 }
        ];
        let finalAspectRatioForAI = getClosestSupportedAspectRatio(defaultCardWidthPx, defaultCardHeightPx, supportedStabilityRatios);
        if (imageAspectRatioForDeck && supportedStabilityRatios.some(r => r.string === imageAspectRatioForDeck)) {
            finalAspectRatioForAI = imageAspectRatioForDeck;
        }

        const aiSettingsForThisBox = { // Renamed for clarity, or keep as boxAISettings
            userPrompt: userPrompt, 
            genre: genre, 
            accentColorHex: accentColorHex,
            imageAspectRatio: finalAspectRatioForAI, 
            imageOutputFormat: imageOutputFormatForDeck,
            cardBackImage: cardBackImageDataUri // This is the default for the deck being generated
        };
        
        const imageGenPromptForStability = userPrompt; // Assuming frontend combines style prompts into userPrompt
        const textListPromptForGemini = `User Request: Generate ${numCardsInDeck} unique, concise but complete data items, max 100 characters long each item... related to "${userPrompt}"...\n\nData Items List: (never include headings, descriptions, only provide single line per item.)`;

        // --- 2. Call AI Services ---
        let aiFrontImageDataUri, generatedTextListData;
        let imageGenError = null, textGenError = null;
        // ... (Promise.all for imagePromise and textPromise - same as before) ...
        const imagePromise = aiService.generateImageWithStabilityAI(imageGenPromptForStability, imageOutputFormatForDeck, finalAspectRatioForAI)
            .catch(err => { imageGenError = err.message; return null; });
        const textPromise = aiService.generateTextWithGemini(textListPromptForGemini, undefined, CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION)
            .catch(err => { textGenError = err.message; return null; });
        [aiFrontImageDataUri, generatedTextListData] = await Promise.all([imagePromise, textPromise]);

        // --- 3. Process AI Results ---
        const aiFrontImageGeneratedSuccessfully = !!aiFrontImageDataUri;
        const textListGeneratedSuccessfully = !!generatedTextListData;

        if (!aiFrontImageGeneratedSuccessfully && !textListGeneratedSuccessfully && !fallbackFrontImageBase64DataUri && !DEFAULT_BACKEND_PLACEHOLDER_IMAGE_URL) {
            return res.status(502).json({ success: false, message: "Both AI failed, no fallbacks available." });
        }
        
        let finalFrontImageToUse = aiFrontImageGeneratedSuccessfully ? aiFrontImageDataUri : (fallbackFrontImageBase64DataUri || DEFAULT_BACKEND_PLACEHOLDER_IMAGE_URL);
        let textItemsArray = []; /* ... populate textItemsArray or placeholders ... */
        const finalTextsForCards = []; /* ... ensure targetNumTexts ... */

        if (textListGeneratedSuccessfully && typeof generatedTextListData === 'string') {
            // Split Gemini's multi-line response into an array of individual text items
            textItemsArray = generatedTextListData.split('\n')
                                            .map(item => item.trim()) // Remove leading/trailing whitespace from each item
                                            .filter(item => item.length > 0); // Remove any empty lines
        } else {
            for (let i = 0; i < numCardsInDeck; i++) {
                textItemsArray.push(`[Placeholder - Text Gen Failed - Card ${i + 1} - Topic: ${userPrompt} - Error: ${textGenerationError || 'Unknown'}]`);
            }
        }

        for (let i = 0; i < numCardsInDeck; i++) {
            if (i < textItemsArray.length && textItemsArray[i]) { // Check if item exists and is not empty
                finalTextsForCards.push(textItemsArray[i]);
            } else {
                finalTextsForCards.push(`[Placeholder - Card ${i + 1} - Item missing or empty from AI]`);
            }
        }
        // --- 4. Create Box Document (without cards initially) ---
        const newBoxData = {
            name: boxName.trim(), description: boxDescription, userId,
            isGuestBox: isGuest,
            defaultCardWidthPx, defaultCardHeightPx, aiSettingsForThisBox
        };
        const newBox = new Box(newBoxData);
        const savedBox = await newBox.save();
        console.log("BOX_CONTROLLER: Box saved, ID:", savedBox._id);
        // We don't save the box yet, or we save it and then update it with card IDs if needed.
        // For returning a populated box, it's easier to construct the object in memory.

        // --- 5. Create Card Data (in memory, not saved yet individually if we want to embed in box response) ---
        const generatedCardsDataForResponse = [];
        for (let i = 0; i < numCardsInDeck; i++) {
            
            const cardFrontElements = [
                { elementId: uuidv4(), type: 'image', imageUrl: finalFrontImageToUse, x: 0, y: 0, width: defaultCardWidthPx, height: defaultCardHeightPx, zIndex: 0, rotation: 0 }
            ];
            const individualCardText = finalTextsForCards[i] || `Card ${i+1} Content`;
            const tempCardId = new mongoose.Types.ObjectId(); // Pre-generate ID for linking elements

            // Create FRONT Elements
            const cardFrontElementDocsData = [];
            // Front Image Element Data
            const frontImageElementData = {
                cardId: tempCardId, boxId: savedBox._id, isGuestElement: isGuest, userId: savedBox.userId, isFrontElement: true,
                type: 'image', imageUrl: finalFrontImageToUse,
                x: 0, y: 0, width: defaultCardWidthPx, height: defaultCardHeightPx, zIndex: 0, rotation: 0
            };
            cardFrontElementDocsData.push(frontImageElementData);

            // Front Text Element Data
            // ... (calculate textBlockX, Y, Width, Height) ...
            const textContentForCard = finalTextsForCards[i] || `Card ${i+1} Text`;
            const textBlockX = Math.round(defaultCardWidthPx * 0.1); // Simplified
            const textBlockY = Math.round((defaultCardHeightPx - (defaultCardHeightPx * 0.45)) / 2);
            const textBlockWidth = Math.round(defaultCardWidthPx * 0.8);
            const textBlockHeight = Math.round(defaultCardHeightPx * 0.45);
            cardFrontElements.push({
                elementId: uuidv4(), type: 'text', content: textContentForCard, isGuestElement: isGuest,
                x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
                fontSize: "22px", fontFamily: "Arial", color: accentColorHex,
                textAlign: "center", zIndex: 1, rotation: 0
            });
            const frontTextElementData = {
                cardId: tempCardId, boxId: savedBox._id, isGuestElement: isGuest, userId: savedBox.userId, isFrontElement: true,
                type: 'text', content: individualCardText, /* ...other text props... */
                x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
                fontSize: "22px", fontFamily: "Arial", color: accentColorHex, textAlign: "center", zIndex: 1
            };
            cardFrontElementDocsData.push(frontTextElementData);
            
            // Create BACK Elements
            const cardBackElementDocsData = [];
            if (cardBackImageDataUri) {
                cardBackElementDocsData.push({
                    cardId: tempCardId, boxId: savedBox._id, isGuestElement: isGuest, userId: savedBox.userId, isFrontElement: false, // Mark as back
                    type: 'image', imageUrl: cardBackImageDataUri,
                    x: 0, y: 0, width: defaultCardWidthPx, height: defaultCardHeightPx, zIndex: 0, rotation: 0
                });
            }

            // Save all elements for this card (front and back)
            // For performance, can use Element.insertMany() if creating many at once
            let savedFrontElements = [];
            if (cardFrontElementDocsData.length > 0) {
                savedFrontElements = await Element.insertMany(cardFrontElementDocsData);
            }
            let savedBackElements = [];
            if (cardBackElementDocsData.length > 0) {
                savedBackElements = await Element.insertMany(cardBackElementDocsData);
            }
            
            const cardToSave = new Card({
                _id: tempCardId, // Use the pre-generated ID
                name: `${savedBox.name} - Card ${i + 1}`,
                boxId: savedBox._id, userId: savedBox.userId,isGuestCard: isGuest, orderInBox: i,
                widthPx: defaultCardWidthPx, heightPx: defaultCardHeightPx,
                cardFrontElementIds: savedFrontElements.map(el => el._id), // Store IDs
                cardBackElementIds: savedBackElements.map(el => el._id),   // Store IDs
                metadata: {
                    aiFrontImagePromptUsed: imageGenPromptForStability,
                    aiTextPromptUsed: textListPromptForGemini.split('\n\nData Items List:')[0], // Store just the request part
                    frontImageSource: aiFrontImageGeneratedSuccessfully ? 'ai' : (fallbackFrontImageBase64DataUri ? 'frontend_fallback' : 'backend_placeholder'),
                    imageGenerationStatus: imageGenError || (aiFrontImageGeneratedSuccessfully ? "AI Success" : "Used Fallback/Placeholder"),
                    textGenerationStatus: textGenError || (textListGeneratedSuccessfully ? "Success" : "Failed/Placeholder")
                }
            });
            const savedCard = await cardToSave.save();
            
            // For the response, populate the elements
            const cardForResponse = savedCard.toObject();
            cardForResponse.cardFrontElements = savedFrontElements.map(el => el.toObject());
            cardForResponse.cardBackElements = savedBackElements.map(el => el.toObject());
            generatedCardsDataForResponse.push(cardForResponse);
        }

        // --- Construct and Send Final Response ---
        const boxResponseObject = savedBox.toObject();
        boxResponseObject.cards = generatedCardsDataForResponse; // Embed fully populated cards

        // Add flags to top-level data if preferred, or keep in metadata of box/cards
        const responseData = {
            box: boxResponseObject, // The primary data is the box with its cards
            imageWasAIgenerated: aiFrontImageGeneratedSuccessfully,
            textListWasGenerated: textListGeneratedSuccessfully,
            rawText: generatedTextListData
        };
        
        successResponse(res, `Box "${savedBox.name}" and ${generatedCardsDataForResponse.length} cards created.`, responseData, 201);

    } catch (error) {
        console.error("Error in generateNewDeckAndBox Controller:", error.message, error.stack);
        errorResponse(res, "Error generating new deck and box.", 500, "DECK_GENERATION_FAILED", error.message);
    }
    console.log("CONTROLLER: generateNewDeckAndBox finished.");
};

exports.claimBox = async (req, res) => {
    const { boxId } = req.params;
    const userId = req.user.id; // From protect middleware

    try {
        const box = await Box.findById(boxId);
        if (!box) return errorResponse(res, 'Box not found.', 404, "BOX_NOT_FOUND");
        if (box.userId && box.userId.toString() !== userId.toString()) {
            return errorResponse(res, 'This box is already owned by another user.', 403, "BOX_OWNED_BY_OTHER");
        }
        if (box.userId && !box.isGuestBox) {
             return successResponse(res, 'Box already associated with your account.', {box});
        }

        box.userId = userId;
        box.isGuestBox = false;
        await box.save();

        const cardsInBox = await Card.find({ boxId: box._id });
        const cardIds = cardsInBox.map(c => c._id);

        await Card.updateMany(
            { _id: { $in: cardIds }, isGuestCard: true },
            { $set: { userId: userId, isGuestCard: false } }
        );
        await Element.updateMany(
            { boxId: box._id, isGuestElement: true }, // Elements directly on box OR on cards in this box
            { $set: { userId: userId, isGuestElement: false } }
        );
        
        // Refetch data to return fully populated and updated structures
        const updatedBox = await Box.findById(boxId).populate('boxFrontElementIds').populate('boxBackElementIds').lean();
        const updatedCards = await Card.find({ boxId: boxId }).populate('cardFrontElementIds').populate('cardBackElementIds').lean();
        
        const populatedCards = updatedCards.map(card => ({
            ...card,
            cardFrontElements: card.cardFrontElementIds || [],
            cardBackElements: card.cardBackElementIds || [],
            cardFrontElementIds: (card.cardFrontElementIds || []).map(el => el._id),
            cardBackElementIds: (card.cardBackElementIds || []).map(el => el._id)
        }));
        const populatedBox = {
            ...updatedBox,
            boxFrontElements: updatedBox.boxFrontElementIds || [],
            boxBackElements: updatedBox.boxBackElementIds || [],
            boxFrontElementIds: (updatedBox.boxFrontElementIds || []).map(el => el._id),
            boxBackElementIds: (updatedBox.boxBackElementIds || []).map(el => el._id)
        };

        successResponse(res, 'Box, cards, and elements successfully claimed.', { box: populatedBox, cards: populatedCards });
    } catch (error) {
        errorResponse(res, 'Server error while claiming box.', 500, "CLAIM_BOX_FAILED", error.message);
    }
};


exports.createBox = async (req, res) => {
    try {
        const { name, description, defaultCardWidthPx, defaultCardHeightPx } = req.body;
        let userId = null;
        let isGuest = true;
        if (req.user && req.user.id) { userId = req.user.id; isGuest = false; }

        if (!name) return errorResponse(res, "Box name is required.", 400);

        const newBox = new Box({
            name, description, userId, isGuestBox: isGuest,
            defaultCardWidthPx, defaultCardHeightPx
        });
        const savedBox = await newBox.save();
        successResponse(res, "Box created successfully.", savedBox, 201);
    } catch (error) {
        errorResponse(res, "Failed to create box.", 500, "BOX_CREATION_FAILED", error.message);
    }
};

exports.getUserBoxes = async (req, res) => {
    try {
        if (!req.user || !req.user.id) return errorResponse(res, "User not authenticated.", 401);
        const userId = req.user.id;

        const boxesFromDB = await Box.find({ userId }) // Only user's boxes
            .populate('boxFrontElementIds')
            .populate('boxBackElementIds')
            .sort({ updatedAt: -1 })
            .lean();

        const boxesForResponse = boxesFromDB.map(box => ({
            ...box,
            boxFrontElements: box.boxFrontElementIds || [],
            boxBackElements: box.boxBackElementIds || [],
            boxFrontElementIds: (box.boxFrontElementIds || []).map(el => el._id),
            boxBackElementIds: (box.boxBackElementIds || []).map(el => el._id),
        }));
        successResponse(res, "User boxes retrieved successfully.", boxesForResponse);
    } catch (error) {
        errorResponse(res, "Failed to retrieve user boxes.", 500, "FETCH_BOXES_FAILED", error.message);
    }
};

exports.exportBoxAsJson = async (req, res) => {
    console.log(`BOX_CONTROLLER: exportBoxAsJson called for boxId: ${req.params.boxId}`);
    try {
        const { boxId } = req.params;
        const userId = req.user.id; // From protect middleware, user must be authenticated

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return errorResponse(res, "Invalid Box ID format.", 400, "INVALID_ID");
        }

        // 1. Fetch the Box and populate its own elements
        // We use .lean() for performance as we're just sending data.
        const box = await Box.findOne({ _id: boxId, userId: userId })
            .populate('boxFrontElementIds') // Populate with full Element documents
            .populate('boxBackElementIds')  // Populate with full Element documents
            .lean();

        if (!box) {
            return errorResponse(res, "Box not found or you are not authorized to export it.", 404, "NOT_FOUND_OR_UNAUTHORIZED");
        }

        // 2. Fetch all Cards for this Box, and populate their Elements
        const cards = await Card.find({ boxId: box._id, userId: userId }) // Ensure cards also belong to the user
            .populate('cardFrontElementIds') // Populate with full Element documents
            .populate('cardBackElementIds')  // Populate with full Element documents
            .sort({ orderInBox: 1 })
            .lean();

        // 3. Structure the data for JSON response
        // The .lean() and .populate() calls have already given us most of what we need.
        // We just need to ensure the arrays of element objects are named consistently
        // if the frontend expects `boxFrontElements` and `cardFrontElements` etc.

        const boxForExport = {
            ...box,
            // Rename populated ID arrays to the arrays of full element objects
            boxFrontElements: box.boxFrontElementIds || [],
            boxBackElements: box.boxBackElementIds || [],
            // Optionally, remove the ID-only arrays if they are redundant for export
            // delete box.boxFrontElementIds;
            // delete box.boxBackElementIds;
        };

        const cardsForExport = cards.map(card => {
            const cardObject = { ...card };
            cardObject.cardFrontElements = card.cardFrontElementIds || [];
            cardObject.cardBackElements = card.cardBackElementIds || [];
            // Optionally remove ID-only arrays from cards too
            // delete cardObject.cardFrontElementIds;
            // delete cardObject.cardBackElementIds;
            return cardObject;
        });

        const exportData = {
            box: boxForExport,
            cards: cardsForExport
        };

        // 4. Send JSON response
        // The successResponse helper will handle sending this as JSON.
        // No need for Content-Disposition headers for a JSON API response.
        // If the frontend wants to trigger a download of this JSON, it can do so.
        successResponse(res, "Box data exported successfully as JSON.", exportData);

    } catch (error) {
        console.error("Error in exportBoxAsJson Controller:", error.message, error.stack);
        errorResponse(res, "Error exporting box data.", 500, "JSON_EXPORT_FAILED", error.message);
    }
};

exports.getBoxById = async (req, res) => {
    console.log(`BOX_CONTROLLER: getBoxById called for boxId: ${req.params.boxId}`);
    try {
        const { boxId } = req.params;
        let currentUserId = null; // Assume guest initially
        let isAuthenticated = false;

        // Optional token check to determine if a user is logged in
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            try {
                const jwt = require('jsonwebtoken'); // require if not at top
                const User = require('../models/User.model'); // require if not at top

                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id).lean();
                if (user) {
                    currentUserId = user._id.toString();
                    isAuthenticated = true;
                }
            } catch (err) {
                // Token invalid or expired, proceed as guest for public access
                console.log('Optional token check failed for getBoxById, proceeding as guest-can-view:', err.message);
            }
        }

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return errorResponse(res, "Invalid Box ID format.", 400, "INVALID_ID");
        }

        const boxFromDB = await Box.findById(boxId)
            .populate('boxFrontElementIds')
            .populate('boxBackElementIds')
            .lean();

        if (!boxFromDB) {
            return errorResponse(res, "Box not found.", 404, "NOT_FOUND");
        }

        // Authorization Logic:
        if (!boxFromDB.isGuestBox) { // If the box is NOT a guest box (i.e., it has an owner or should have one)
            if (!isAuthenticated) {
                return errorResponse(res, "Not authorized to view this box (login required).", 401, "AUTH_REQUIRED");
            }
            if (boxFromDB.userId && boxFromDB.userId.toString() !== currentUserId) {
                return errorResponse(res, "Not authorized to view this box (ownership mismatch).", 403, "UNAUTHORIZED_ACCESS");
            }
            // If boxFromDB.userId is null but isGuestBox is false, it implies an inconsistent state,
            // but for safety, if authenticated and userId doesn't match, deny.
        }
        // If it's a guest box (boxFromDB.isGuestBox is true), anyone can view it.
        // If the user is authenticated and it's a guest box, they can still view it.

        console.log(`BOX_CONTROLLER: Found box ${boxId}. Populating its cards and their elements...`);

        const cardQuery = { boxId: boxFromDB._id };
        // If the box is owned, only show cards owned by that user (or guest cards if box was just claimed)
        // If the box is guest, only show guest cards
        if (boxFromDB.userId) {
            cardQuery.userId = boxFromDB.userId;
        } else {
            cardQuery.isGuestCard = true;
        }

        const cardsFromDB = await Card.find(cardQuery)
            .populate('cardFrontElementIds')
            .populate('cardBackElementIds')
            .sort({ orderInBox: 1 })
            .lean();
        
        const cardsForResponse = cardsFromDB.map(card => {
            const responseCard = { ...card };
            responseCard.cardFrontElements = card.cardFrontElementIds || [];
            responseCard.cardBackElements = card.cardBackElementIds || [];
            responseCard.cardFrontElementIds = (card.cardFrontElementIds || []).map(element => element._id);
            responseCard.cardBackElementIds = (card.cardBackElementIds || []).map(element => element._id);
            return responseCard;
        });

        const boxResponseObject = { ...boxFromDB };
        boxResponseObject.boxFrontElements = boxFromDB.boxFrontElementIds || [];
        boxResponseObject.boxBackElements = boxFromDB.boxBackElementIds || [];
        boxResponseObject.boxFrontElementIds = (boxFromDB.boxFrontElementIds || []).map(element => element._id);
        boxResponseObject.boxBackElementIds = (boxFromDB.boxBackElementIds || []).map(element => element._id);
        boxResponseObject.cards = cardsForResponse;

        successResponse(res, "Box details retrieved successfully.", boxResponseObject);

    } catch (error) {
        console.error("Error in getBoxById Controller:", error.message, error.stack);
        errorResponse(res, "Error fetching box details.", 500, "FETCH_BOX_FAILED", error.message);
    }
};

exports.updateBox = async (req, res) => {
    try {
        const { boxId } = req.params;
        const updates = req.body; // name, description, defaults, baseAISettings
        let userId = null;
        if (req.user && req.user.id) userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return errorResponse(res, "Invalid Box ID format.", 400);
        }
        if (Object.keys(updates).length === 0) {
            return errorResponse(res, "No update fields provided.", 400);
        }
        // Sanitize updates - prevent changing userId or isGuestBox directly here
        delete updates.userId; delete updates.isGuestBox;
        delete updates.cards; // Cards are managed separately

        updates.updatedAt = Date.now();

        const boxQuery = { _id: boxId };
        if (userId) boxQuery.userId = userId; else boxQuery.isGuestBox = true;

        const updatedBox = await Box.findOneAndUpdate(boxQuery, { $set: updates }, { new: true, runValidators: true })
            .populate('boxFrontElementIds').populate('boxBackElementIds').lean();

        if (!updatedBox) {
            return errorResponse(res, "Box not found or not authorized to update.", 404);
        }
        
        const boxResponseObject = {...updatedBox};
        boxResponseObject.boxFrontElements = updatedBox.boxFrontElementIds || [];
        boxResponseObject.boxBackElements = updatedBox.boxBackElementIds || [];
        boxResponseObject.boxFrontElementIds = (updatedBox.boxFrontElementIds || []).map(el => el._id);
        boxResponseObject.boxBackElementIds = (updatedBox.boxBackElementIds || []).map(el => el._id);

        successResponse(res, "Box updated successfully.", boxResponseObject);
    } catch (error) {
        errorResponse(res, "Error updating box.", 500, "BOX_UPDATE_FAILED", error.message);
    }
};

exports.deleteBox = async (req, res) => {
    try {
        const { boxId } = req.params;
        let userId = null;
        if (req.user && req.user.id) userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return errorResponse(res, "Invalid Box ID format.", 400);
        }

        const boxQuery = { _id: boxId };
        if (userId) boxQuery.userId = userId; else boxQuery.isGuestBox = true;

        const boxToDelete = await Box.findOne(boxQuery);
        if (!boxToDelete) return errorResponse(res, "Box not found or not authorized.", 404);

        // 1. Find all cards in the box
        const cardsInBox = await Card.find({ boxId: boxToDelete._id });
        const cardIdsInBox = cardsInBox.map(c => c._id);

        // 2. Collect all element IDs from cards in the box and from the box itself
        let allElementIdsToDelete = [
            ...(boxToDelete.boxFrontElementIds || []),
            ...(boxToDelete.boxBackElementIds || [])
        ];
        cardsInBox.forEach(card => {
            allElementIdsToDelete.push(...(card.cardFrontElementIds || []));
            allElementIdsToDelete.push(...(card.cardBackElementIds || []));
        });
        allElementIdsToDelete = [...new Set(allElementIdsToDelete.map(id => id.toString()))]; // Unique IDs

        // 3. Delete all collected elements
        if (allElementIdsToDelete.length > 0) {
            const elementQueryDel = { _id: { $in: allElementIdsToDelete } };
            if (userId) elementQueryDel.userId = userId; else elementQueryDel.isGuestElement = true;
            await Element.deleteMany(elementQueryDel);
        }

        // 4. Delete all cards in the box
        if (cardIdsInBox.length > 0) {
            const cardQueryDel = { _id: { $in: cardIdsInBox } };
            if (userId) cardQueryDel.userId = userId; else cardQueryDel.isGuestCard = true;
            await Card.deleteMany(cardQueryDel);
        }

        // 5. Delete the box itself
        await Box.findByIdAndDelete(boxId);

        successResponse(res, "Box, associated cards, and elements deleted successfully.", { boxId });
    } catch (error) {
        errorResponse(res, "Error deleting box and its contents.", 500, "BOX_DELETE_CASCADE_FAILED", error.message);
    }
};
// TODO: addBoxElement, updateBoxElement, deleteBoxElement (for box art)
// These would modify box.boxFrontElements or box.boxBackElements
// Similar to how card elements are managed, but on the Box model.
// Helper function to get the correct element array path for Box elements
const getBoxElementArrayPath = (face) => {
    return face === 'back' ? 'boxBackElementIds' : 'boxFrontElementIds';
};

// --- Box Element Management ---
exports.addBoxElement = async (req, res) => {
    try {
        const { boxId } = req.params;
        const { isFrontElement, type, ...elementProps } = req.body;
        let userId = null;
        let isGuest = true;
        if (req.user && req.user.id) { userId = req.user.id; }

        if (!mongoose.Types.ObjectId.isValid(boxId)) return errorResponse(res, 'Invalid Box ID.', 400);
        if (typeof isFrontElement !== 'boolean') return errorResponse(res, "isFrontElement (true/false) is required.", 400);
        if (!type || !['text', 'image', 'shape'].includes(type)) return errorResponse(res, 'Invalid element type.', 400);

        const boxQuery = { _id: boxId };
        if (userId) boxQuery.userId = userId; else boxQuery.isGuestBox = true;
        const box = await Box.findOne(boxQuery);
        if (!box) return errorResponse(res, "Box not found or not authorized.", 404);

        if (box.userId) isGuest = false; // If box is owned, element is not guest

        const newElement = new Element({
            ...elementProps, type,
            boxId: box._id,
            cardId: null, // Explicitly null for box elements
            userId: box.userId, // Inherit userId from box (can be null for guest box)
            isGuestElement: box.isGuestBox, // Match box's guest status
            isFrontElement
        });
        const savedElement = await newElement.save();

        const arrayPath = getBoxElementArrayPath(isFrontElement);
        await Box.findByIdAndUpdate(boxId, { $push: { [arrayPath]: savedElement._id } });
        
        const updatedBox = await Box.findById(boxId)
            .populate('boxFrontElementIds').populate('boxBackElementIds').lean();
        
        const boxForResponse = {
            ...updatedBox,
            boxFrontElements: updatedBox.boxFrontElementIds || [],
            boxBackElements: updatedBox.boxBackElementIds || [],
            boxFrontElementIds: (updatedBox.boxFrontElementIds || []).map(el => el._id),
            boxBackElementIds: (updatedBox.boxBackElementIds || []).map(el => el._id),
        };
        successResponse(res, "Element added to box.", boxForResponse, 201);
    } catch (error) {
        errorResponse(res, "Failed to add element to box.", 500, "ADD_BOX_ELEMENT_FAILED", error.message);
    }
};

exports.updateBoxElement = async (req, res) => {
    try {
        const { elementId } = req.params; // Element's _id
        const updates = req.body;
        let userId = null;
        if (req.user && req.user.id) userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(elementId)) return errorResponse(res, "Invalid Element ID.", 400);
        if (Object.keys(updates).length === 0) return errorResponse(res, "No updates provided.", 400);
        
        delete updates.cardId; delete updates.boxId; delete updates.userId;
        delete updates.isFrontElement; delete updates.isGuestElement;

        const elementQuery = { _id: elementId, cardId: null }; // Ensure it's a box element
        if (userId) elementQuery.userId = userId; else elementQuery.isGuestElement = true;
        
        const updatedElement = await Element.findOneAndUpdate(elementQuery, { $set: updates }, { new: true });
        if (!updatedElement) return errorResponse(res, "Box element not found or not authorized.", 404);
        
        const parentBox = await Box.findById(updatedElement.boxId)
            .populate('boxFrontElementIds').populate('boxBackElementIds').lean();
        
        const boxForResponse = {
            ...parentBox,
            boxFrontElements: parentBox.boxFrontElementIds || [],
            boxBackElements: parentBox.boxBackElementIds || [],
            boxFrontElementIds: (parentBox.boxFrontElementIds || []).map(el => el._id),
            boxBackElementIds: (parentBox.boxBackElementIds || []).map(el => el._id),
        };
        successResponse(res, "Box element updated.", boxForResponse);
    } catch (error) {
        errorResponse(res, "Failed to update box element.", 500, "UPDATE_BOX_ELEMENT_FAILED", error.message);
    }
};

exports.deleteBoxElement = async (req, res) => {
    try {
        const { elementId } = req.params; // Element's _id
        let userId = null;
        if (req.user && req.user.id) userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(elementId)) return errorResponse(res, "Invalid Element ID.", 400);

        const elementQuery = { _id: elementId, cardId: null }; // Box element
        if (userId) elementQuery.userId = userId; else elementQuery.isGuestElement = true;

        const elementToDelete = await Element.findOne(elementQuery);
        if (!elementToDelete) return errorResponse(res, "Box element not found or not authorized.", 404);

        const boxId = elementToDelete.boxId;
        const arrayPath = getBoxElementArrayPath(elementToDelete.isFrontElement);

        await Element.findByIdAndDelete(elementId);
        const updatedBox = await Box.findByIdAndUpdate(boxId, 
            { $pull: { [arrayPath]: elementId }, $set: {updatedAt: Date.now()} }, 
            { new: true }
        ).populate('boxFrontElementIds').populate('boxBackElementIds').lean();

        const responseBox = { ...updatedBox };
        responseBox.boxFrontElements = updatedBox.boxFrontElementIds || [];
        responseBox.boxBackElements = updatedBox.boxBackElementIds || [];
        responseBox.boxFrontElementIds = (updatedBox.boxFrontElementIds || []).map(el => el._id);
        responseBox.boxBackElementIds = (updatedBox.boxBackElementIds || []).map(el => el._id);
        
        successResponse(res, "Box element deleted.", responseBox);
    } catch (error) {
        errorResponse(res, "Error deleting box element.", 500, error.message);
    }
};