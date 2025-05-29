// src/controllers/box.controller.js
const Box = require('../models/Box.model');
const Card = require('../models/Card.model'); // Needed for deleting cards with box
const Element = require('../models/Element.model');
const aiService = require('../services/ai.service');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// --- Constants (can be moved to a config file) ---
const CONCISE_DUMMY_DATA_SYSTEM_INSTRUCTION = `...`; // Your full instruction
const DEFAULT_BACKEND_PLACEHOLDER_IMAGE_URL = "https://via.placeholder.com/600x800.png?text=Image+Error";

function getClosestSupportedAspectRatio(width, height, supportedRatios) { /* ... same helper ... */ }

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
            return res.status(400).json({ message: "Box name is required and must be a valid string." });
        }
        if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim() === '') {
            return res.status(400).json({ message: "A user prompt is required." });
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
            return res.status(502).json({ message: "Both AI failed, no fallbacks available." });
        }
        
        let finalFrontImageToUse = aiFrontImageGeneratedSuccessfully ? aiFrontImageDataUri : (fallbackFrontImageBase64DataUri || DEFAULT_BACKEND_PLACEHOLDER_IMAGE_URL);
        let textItemsArray = []; /* ... populate textItemsArray or placeholders ... */
        const finalTextsForCards = []; /* ... ensure targetNumTexts ... */

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

        res.status(201).json(boxResponseObject);

    } catch (error) {
        console.error("Error in generateNewDeckAndBox Controller:", error.message, error.stack);
        if (!res.headersSent) {
            res.status(500).json({ message: "Error generating new deck and box.", error: error.message });
        }
    }
    console.log("CONTROLLER: generateNewDeckAndBox finished.");
};

exports.createBox = async (req, res) => {
    try {
        const { name, description, defaultCardWidthPx, defaultCardHeightPx } = req.body;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder
        if (!name) return res.status(400).json({ message: "Box name is required." });

        const newBox = new Box({
            name, description, userId,
            defaultCardWidthPx, defaultCardHeightPx
        });
        const savedBox = await newBox.save();
        res.status(201).json(savedBox);
    } catch (error) {
        console.error("Error creating box:", error);
        res.status(500).json({ message: "Failed to create box", error: error.message });
    }
};

exports.getUserBoxes = async (req, res) => {
    try {
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder
        const boxes = await Box.find({ userId }).sort({ updatedAt: -1 });
        res.status(200).json(boxes);
    } catch (error) { /* ... */ }
};

exports.getBoxById = async (req, res) => {
    try {
        const { boxId } = req.params;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d"; // Placeholder

        const box = await Box.findOne({ _id: boxId, userId }); // Ensure user owns the box
        if (!box) return res.status(404).json({ message: "Box not found or not authorized." });

        // Optionally populate cards
        const cardsInBox = await Card.find({ boxId: box._id }).sort({ orderInBox: 1 });

        res.status(200).json({ box, cards: cardsInBox });
    } catch (error) { /* ... */ }
};

exports.updateBox = async (req, res) => { /* ... update box details ... */ };
exports.deleteBox = async (req, res) => {
    try {
        const { boxId } = req.params;
        const userId = req.user?.id || "60c72b2f9b1e8b5a70d4834d";

        const box = await Box.findOneAndDelete({ _id: boxId, userId });
        if (!box) return res.status(404).json({ message: "Box not found or not authorized." });

        // Delete all cards associated with this box
        await Card.deleteMany({ boxId: boxId });
        console.log(`Deleted box ${boxId} and its associated cards.`);
        res.status(200).json({ message: "Box and associated cards deleted successfully." });
    } catch (error) { /* ... */ }
};

// TODO: addBoxElement, updateBoxElement, deleteBoxElement (for box art)
// These would modify box.boxFrontElements or box.boxBackElements
// Similar to how card elements are managed, but on the Box model.
exports.addBoxElement = async (req, res) => { /* ... */ };
exports.updateBoxElement = async (req, res) => { /* ... */ };
exports.deleteBoxElement = async (req, res) => { /* ... */ };