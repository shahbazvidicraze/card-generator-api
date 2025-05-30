// src/controllers/box.controller.js
const Box = require('../models/Box.model');
const Card = require('../models/Card.model'); // Needed for deleting cards with box
const Element = require('../models/Element.model');
const aiService = require('../services/ai.service');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

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

        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder

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
        const textListPromptForGemini = `User Request: Generate ${numCardsInDeck} distinct, concise data items ... related to "${userPrompt}"...\n\nData Items List:`;

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
                cardId: tempCardId, boxId: savedBox._id, userId: savedBox.userId, isFrontElement: true,
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
                elementId: uuidv4(), type: 'text', content: textContentForCard,
                x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
                fontSize: "22px", fontFamily: "Arial", color: accentColorHex,
                textAlign: "center", zIndex: 1, rotation: 0
            });
            const frontTextElementData = {
                cardId: tempCardId, boxId: savedBox._id, userId: savedBox.userId, isFrontElement: true,
                type: 'text', content: individualCardText, /* ...other text props... */
                x: textBlockX, y: textBlockY, width: textBlockWidth, height: textBlockHeight,
                fontSize: "22px", fontFamily: "Arial", color: accentColorHex, textAlign: "center", zIndex: 1
            };
            cardFrontElementDocsData.push(frontTextElementData);
            
            // Create BACK Elements
            const cardBackElementDocsData = [];
            if (cardBackImageDataUri) {
                cardBackElementDocsData.push({
                    cardId: tempCardId, boxId: savedBox._id, userId: savedBox.userId, isFrontElement: false, // Mark as back
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
                boxId: savedBox._id, userId: savedBox.userId, orderInBox: i,
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
            textListWasGenerated: textListGeneratedSuccessfully
        };
        
        successResponse(res, `Box "${savedBox.name}" and ${generatedCardsDataForResponse.length} cards created.`, responseData, 201);

    } catch (error) {
        console.error("Error in generateNewDeckAndBox Controller:", error.message, error.stack);
        errorResponse(res, "Error generating new deck and box.", 500, "DECK_GENERATION_FAILED", error.message);
    }
    console.log("CONTROLLER: generateNewDeckAndBox finished.");
};

exports.createBox = async (req, res) => {
    try {
        const { name, description, defaultCardWidthPx, defaultCardHeightPx } = req.body;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder
        if (!name) return res.status(400).json({ success: false, message: "Box name is required." });

        const newBox = new Box({
            name, description, userId,
            defaultCardWidthPx, defaultCardHeightPx
        });
        const savedBox = await newBox.save();
        successResponse(res, "Box created successfully.", savedBox, 201);
    } catch (error) {
        if (error.name === 'ValidationError') {
            return errorResponse(res, "Validation failed.", 400, "VALIDATION_ERROR", error.errors);
        }
        errorResponse(res, "Failed to create box.", 500, "BOX_CREATION_FAILED", error.message);
    }
};

exports.getUserBoxes = async (req, res) => {
    try {
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder
        const boxes = await Box.find({ userId }).sort({ updatedAt: -1 });
         successResponse(res, "User boxes retrieved successfully.", boxes);
    } catch (error) {
        errorResponse(res, "Failed to retrieve user boxes.", 500, "FETCH_BOXES_FAILED", error.message);
    }
};

exports.getBoxById = async (req, res) => {
    console.log(`BOX_CONTROLLER: getBoxById called for boxId: ${req.params.boxId}`);
    try {
        const { boxId } = req.params;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; 

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return res.status(400).json({ success: false, message: "Invalid Box ID format." });
        }

        const box = await Box.findOne({ _id: boxId, userId });
        if (!box) {
            return res.status(404).json({ success: false, message: "Box not found or not authorized." });
        }

        // Fetch cards and populate both front and back element IDs
        const cardsFromDB = await Card.find({ boxId: box._id })
            .populate('cardFrontElementIds') // This will populate with Element documents
            .populate('cardBackElementIds')   // This will populate with Element documents
            .sort({ orderInBox: 1 })
            .lean(); // Get plain JavaScript objects

        console.log(`BOX_CONTROLLER: Found ${cardsFromDB.length} cards for box ${boxId}.`);

        // Now, cardsFromDB has cardFrontElementIds and cardBackElementIds as arrays of Element objects.
        // We need to reconstruct the response to have both the IDs and the full objects under different names.

        const cardsForResponse = cardsFromDB.map(card => {
            // 'card' is already a plain JS object because of .lean()
            
            // Create the new structure for the response
            const responseCard = {
                _id: card._id,
                name: card.name,
                boxId: card.boxId,
                userId: card.userId,
                orderInBox: card.orderInBox,
                widthPx: card.widthPx,
                heightPx: card.heightPx,
                metadata: card.metadata,
                createdAt: card.createdAt,
                updatedAt: card.updatedAt,
                __v: card.__v, // If you want to include it

                // 1. Store the populated elements in the desired fields
                cardFrontElements: card.cardFrontElementIds || [], // After populate, this holds Element objects
                cardBackElements: card.cardBackElementIds || [],   // After populate, this holds Element objects

                // 2. Re-extract just the IDs for the *_ElementIds fields
                //    The populated card.cardFrontElementIds now contains objects, so we map back to their _id
                cardFrontElementIds: (card.cardFrontElementIds || []).map(element => element._id),
                cardBackElementIds: (card.cardBackElementIds || []).map(element => element._id),
            };
            return responseCard;
        });

        const boxResponseObject = box.toObject(); // Get plain object for the box
        boxResponseObject.cards = cardsForResponse;

        successResponse(res, "Box details retrieved successfully.", boxResponseObject);
    } catch (error) {
        errorResponse(res, "Error fetching box details.", 500, "FETCH_BOX_FAILED", error.message);
    }
};

exports.updateBox = async (req, res) => {
    console.log(`BOX_CONTROLLER: updateBox called for boxId: ${req.params.boxId}`);
    try {
        const { boxId } = req.params;
        const { 
            name, 
            description, 
            defaultCardWidthPx, 
            defaultCardHeightPx
            // Potentially other fields like baseAISettings if you want to update them here
        } = req.body;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder for user ID

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return res.status(400).json({success: false, message: "Invalid Box ID format." });
        }

        const updates = {};
        if (name !== undefined) {
            if (typeof name === 'string' && name.trim() !== '') {
                updates.name = name.trim();
            } else {
                return res.status(400).json({ success: false, message: "Box name, if provided, must be a non-empty string." });
            }
        }
        if (description !== undefined) updates.description = description; // Allow empty string for description
        if (defaultCardWidthPx !== undefined) {
            if (typeof defaultCardWidthPx === 'number' && defaultCardWidthPx > 0) {
                updates.defaultCardWidthPx = defaultCardWidthPx;
            } else {
                 return res.status(400).json({ success: false, message: "Default card width, if provided, must be a positive number." });
            }
        }
        if (defaultCardHeightPx !== undefined) {
             if (typeof defaultCardHeightPx === 'number' && defaultCardHeightPx > 0) {
                updates.defaultCardHeightPx = defaultCardHeightPx;
            } else {
                 return res.status(400).json({ success: false, message: "Default card height, if provided, must be a positive number." });
            }
        }
        // Add logic here if you want to update parts of baseAISettings, e.g.:
        // if (req.body.baseAISettings && typeof req.body.baseAISettings.userPrompt === 'string') {
        //     updates['baseAISettings.userPrompt'] = req.body.baseAISettings.userPrompt;
        // }


        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields provided for update." });
        }

        updates.updatedAt = Date.now(); // Explicitly set for good measure

        const updatedBox = await Box.findOneAndUpdate(
            { _id: boxId, userId: userId }, // Ensure user owns the box
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedBox) {
            return res.status(404).json({ success: false, message: "Box not found or you are not authorized to update it." });
        }

        // If you want to return the box with its cards populated (like getBoxById):
        // const cardsInBox = await Card.find({ boxId: updatedBox._id })
        //     .populate('cardFrontElementIds')
        //     .populate('cardBackElementIds')
        //     .sort({ orderInBox: 1 })
        //     .lean();
        // const boxResponseObject = updatedBox.toObject();
        // boxResponseObject.cards = cardsInBox.map(card => { /* ... map to desired card structure ... */ });
        // res.status(200).json(boxResponseObject);
        
        // For a simpler update response, just return the updated box:
       successResponse(res, "Box updated successfully.", updatedBox);

    } catch (error) {
        console.error("Error in updateBox Controller:", error.message, error.stack);
        if (error.name === 'ValidationError') {
            errorResponse(res, "Validation Error", 400, "VALIDATION_ERROR", error.message);
        }
        errorResponse(res, "Error updating box.", 500, "BOX_UPDATE_FAILED", error.message);
    }
};

exports.deleteBox = async (req, res) => {
    try {
        const { boxId } = req.params;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        const box = await Box.findOneAndDelete({ _id: boxId, userId });
        if (!box) return res.status(404).json({ message: "Box not found or not authorized." });

        // Delete all cards associated with this box
        await Card.deleteMany({ boxId: boxId });
        console.log(`Deleted box ${boxId} and its associated cards.`);
        successResponse(res, "Box and associated cards deleted successfully.", { boxId });
    } catch (error) { 
        errorResponse(res, "Error deleting box.", 500, "BOX_DELETE_FAILED", error.message);
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
    console.log(`BOX_CONTROLLER: addBoxElement called for boxId: ${req.params.boxId}, query:`, req.query);
    try {
        const { boxId } = req.params;
        // const { face = 'front' } = req.query; // ?face=front or ?face=back
        // const { type, ...elementProps } = req.body;
        
        const { face = 'front' } = req.query; // Still get from query as a potential default
        const { type, isFrontElement: isFrontElementFromBody, ...elementProps } = req.body;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder from auth

        if (!mongoose.Types.ObjectId.isValid(boxId)) {
            return res.status(400).json({ message: 'Invalid Box ID format.' });
        }
        if (!type || !['text', 'image', 'shape'].includes(type)) {
            return res.status(400).json({ message: `Invalid or missing element type. Received: ${type}` });
        }

        // 1. Find the parent box and verify ownership
        const box = await Box.findOne({ _id: boxId, userId });
        if (!box) {
            console.log("Box not found or user not authorized for boxId:", boxId);
            return res.status(404).json({ message: "Box not found or not authorized." });
        }
        console.log("Found parent box:", box.name);

        let finalIsFront;
        if (typeof isFrontElementFromBody === 'boolean') {
            finalIsFront = isFrontElementFromBody; // Body value takes precedence
            console.log(`Using isFrontElement from BODY: ${finalIsFront}`);
        } else {
            finalIsFront = face.toLowerCase() === 'front'; // Fallback to query param logic
            console.log(`Using isFrontElement from QUERY param ('${face}'): ${finalIsFront}`);
        }

        // 2. Create the new Element document for the Box
        const newElementData = {
            // cardId: null, // Explicitly null as this element belongs to a Box
            boxId: box._id, // Link to this box
            userId: box.userId, // Inherit userId
            isFrontElement: finalIsFront, // Could be for box front/back
            type,
            ...elementProps
        };
        console.log("Data for new Box Element document:", newElementData);

        const newElementDoc = new Element(newElementData);
        const savedElement = await newElementDoc.save();
        console.log("New Box Element saved, ID:", savedElement._id);

        // 3. Add the new element's ID to the box's appropriate element ID array
        const elementIdArrayPath = getBoxElementArrayPath(face); // 'boxFrontElementIds' or 'boxBackElementIds'
        console.log("Pushing element ID to Box path:", elementIdArrayPath);

        const updatedBox = await Box.findByIdAndUpdate(
            boxId,
            { $push: { [elementIdArrayPath]: savedElement._id }, $set: { updatedAt: Date.now() } },
            { new: true, runValidators: true }
        )
        .populate('boxFrontElementIds') // Populate for the response
        .populate('boxBackElementIds');

        if (!updatedBox) {
            await Element.findByIdAndDelete(savedElement._id); // Rollback element creation
            return res.status(500).json({ message: "Failed to link element to box." });
        }
        
        // Prepare response similarly to getBoxById if you want populated elements
        const boxResponseObject = updatedBox.toObject();
        boxResponseObject.boxFrontElements = (updatedBox.boxFrontElementIds || []).map(el => el.toObject ? el.toObject() : el);
        boxResponseObject.boxBackElements = (updatedBox.boxBackElementIds || []).map(el => el.toObject ? el.toObject() : el);
        // Keep original IDs arrays if frontend needs them
        // boxResponseObject.boxFrontElementIds = (updatedBox.boxFrontElementIds || []).map(el => el._id);
        // boxResponseObject.boxBackElementIds = (updatedBox.boxBackElementIds || []).map(el => el._id);


        successResponse(res, "Element added to box successfully.", boxResponseObject, 200);
    } catch (error) {
        if (error.name === 'ValidationError') {
            return errorResponse(res, "Validation Error adding box element.", 400, "VALIDATION_ERROR", error.errors);
        }
        errorResponse(res, 'Error adding element to box.', 500, "ADD_BOX_ELEMENT_FAILED", error.message);
    }
};

exports.updateBoxElement = async (req, res) => {
    console.log(`BOX_CONTROLLER: updateBoxElement called for boxId: ${req.params.boxId}, elementId: ${req.params.elementId}`);
    try {
        const { boxId, elementId } = req.params; // elementId is Element's _id
        // const { face = 'front' } = req.query; // Not strictly needed if elementId is globally unique
        const updates = req.body; // e.g., { x: 10, y: 20, content: "New Text" }
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        if (!mongoose.Types.ObjectId.isValid(boxId) || !mongoose.Types.ObjectId.isValid(elementId)) {
            return res.status(400).json({ message: "Invalid Box or Element ID format." });
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No update fields provided." });
        }

        // 1. Verify user owns the box (optional, but good for security)
        const box = await Box.findOne({ _id: boxId, userId });
        if (!box) {
            return res.status(404).json({ message: "Box not found or not authorized." });
        }

        // 2. Find and update the Element document
        // Ensure the element belongs to this user and this box
        const updatedElement = await Element.findOneAndUpdate(
            { _id: elementId, boxId: boxId, userId: userId },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!updatedElement) {
            return res.status(404).json({ message: "Element not found on this box, or not authorized to update it." });
        }
        
        // Return the updated Box with populated elements for context
        const updatedBoxWithPopulatedElements = await Box.findById(boxId)
            .populate('boxFrontElementIds')
            .populate('boxBackElementIds');

        const boxResponseObject = updatedBoxWithPopulatedElements.toObject();
        boxResponseObject.boxFrontElements = (updatedBoxWithPopulatedElements.boxFrontElementIds || []).map(el => el.toObject ? el.toObject() : el);
        boxResponseObject.boxBackElements = (updatedBoxWithPopulatedElements.boxBackElementIds || []).map(el => el.toObject ? el.toObject() : el);

        console.log(`Box Element ${elementId} updated.`);
        successResponse(res, "Box element updated successfully.", boxResponseObject, 200);
    } catch (error) {
        if (error.name === 'ValidationError') {
            return errorResponse(res, "Validation Error updating box element.", 400, "VALIDATION_ERROR", error.errors);
        }
        errorResponse(res, 'Error updating element to box.', 500, "UPDATE_BOX_ELEMENT_FAILED", error.message);
    }
};

exports.deleteBoxElement = async (req, res) => {
    console.log(`BOX_CONTROLLER: deleteBoxElement called for boxId: ${req.params.boxId}, elementId: ${req.params.elementId}`);
    try {
        const { boxId, elementId } = req.params;
        // const { face = 'front' } = req.query; // Needed to know which array to $pull from
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        if (!mongoose.Types.ObjectId.isValid(boxId) || !mongoose.Types.ObjectId.isValid(elementId)) {
            return res.status(400).json({ message: "Invalid Box or Element ID format." });
        }
        
        // 1. Find the element to determine if it's front or back (and for auth)
        const elementToDelete = await Element.findOne({ _id: elementId, boxId: boxId, userId: userId });
        if (!elementToDelete) {
            return res.status(404).json({ message: "Element not found on this box or not authorized." });
        }

        // 2. Delete the Element document itself
        await Element.findByIdAndDelete(elementId);
        console.log(`Box Element ${elementId} deleted from Elements collection.`);

        // 3. Pull the element's ID from the Box's appropriate array
        const elementIdArrayPath = elementToDelete.isFrontElement ? 'boxFrontElementIds' : 'boxBackElementIds';
        
        const updatedBox = await Box.findByIdAndUpdate(
            boxId,
            { $pull: { [elementIdArrayPath]: elementId }, $set: {updatedAt: Date.now()} },
            { new: true }
        )
        .populate('boxFrontElementIds')
        .populate('boxBackElementIds');

        if (!updatedBox) {
             // This case should be rare if the box was found earlier, but means the $pull didn't modify anything
            console.error("Box not found during $pull operation for element deletion, or element was already removed.");
            return res.status(404).json({ message: "Box not found or element already removed." });
        }

        const boxResponseObject = updatedBox.toObject();
        boxResponseObject.boxFrontElements = (updatedBox.boxFrontElementIds || []).map(el => el.toObject ? el.toObject() : el);
        boxResponseObject.boxBackElements = (updatedBox.boxBackElementIds || []).map(el => el.toObject ? el.toObject() : el);

        successResponse(res, "Box element deleted successfully.", boxResponseObject, 200);
    } catch (error) {
        errorResponse(res, 'Error deleting box.', 500, "DELETE_BOX_ELEMENT_FAILED", error.message);
    }
};