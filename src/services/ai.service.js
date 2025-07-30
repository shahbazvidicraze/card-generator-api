// src/services/ai.service.js
const axios = require('axios');
const FormData = require('form-data');

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const STABILITY_API_HOST_V2 = 'https://api.stability.ai/v2beta/stable-image/generate/ultra';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL;
const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com/v1beta';

// --- Pixian Constants (New) ---
const PIXIAN_API_KEY = process.env.PIXIAN_API_KEY;
const PIXIAN_API_SECRET = process.env.PIXIAN_API_SECRET;
const PIXIAN_API_HOST = 'https://api.pixian.ai/api/v2/remove-background';


async function generateImageWithStabilityAI_V2(prompt, requestedOutputFormat = 'png', aspectRatio = '1:1') {
    // Ensure requestedOutputFormat is a safe, known value for the data URI
    const validOutputFormat = ['png', 'jpeg', 'webp'].includes(requestedOutputFormat.toLowerCase()) ? requestedOutputFormat.toLowerCase() : 'png';

    console.log(`AI Service INPUT: prompt="${prompt}", outputFormatForDataUri="${validOutputFormat}", aspectRatio="${aspectRatio}", requestedStabilityFormat="${requestedOutputFormat}"`);

    if (!STABILITY_API_KEY) {
        console.error('Stability AI API key (v2) not configured.');
        throw new Error('Stability AI API key (v2) not configured.');
    }

    const formData = new FormData();
    formData.append('prompt', prompt);
    // We send the user's requested format to Stability, which might be different from our fallback for the data URI mime type
    formData.append('output_format', requestedOutputFormat);
    formData.append('aspect_ratio', aspectRatio);

    try {
        console.log(`Calling Stability AI v2beta with prompt: "${prompt}", StabilityOutputFormat: ${requestedOutputFormat}, Aspect Ratio: ${aspectRatio}`);
        const response = await axios.post(
            STABILITY_API_HOST_V2,
            formData,
            {
                responseType: 'arraybuffer',
                headers: {
                    ...formData.getHeaders(),
                    Authorization: `Bearer ${STABILITY_API_KEY}`,
                    Accept: 'image/*',
                },
                timeout: 60000,
            }
        );

        if (response.status === 200) {
            const imageBuffer = Buffer.from(response.data);
            console.log(`AI Service: Received imageBuffer. Length: ${imageBuffer.length}`);

            if (imageBuffer.length === 0) {
                console.error("AI Service Error: Image buffer received from Stability AI is empty!");
                throw new Error("AI Service: Stability AI returned an empty image."); // Clear error
            }

            const base64String = imageBuffer.toString('base64');
            if (base64String.length === 0) { // Should not happen if imageBuffer.length > 0, but good check
                console.error("AI Service Error: Conversion to base64 resulted in an empty string!");
                throw new Error("AI Service: Failed to convert image buffer to base64 string."); // Clear error
            }
            console.log(`AI Service: Base64 string length: ${base64String.length}`);

            // Use the validated validOutputFormat for the MIME type part of the Data URI
            const finalDataUri = `data:image/${validOutputFormat};base64,${base64String}`;
            console.log(`AI Service: Constructed Data URI (first 100 chars): ${finalDataUri.substring(0,100)}...`);

            // Final structural check (redundant if above logic is sound, but safe)
            const testMatches = finalDataUri.match(/^data:image\/([a-z]+);base64,(.+)$/i); // made regex simpler for common types
            if (!testMatches || testMatches[1].length === 0 || testMatches[2].length === 0) {
                 console.error("AI Service: FATAL - Constructed Data URI is malformed or critical parts are empty JUST BEFORE RETURN!");
                 throw new Error("AI Service: Internal error constructing valid Data URI. Mime or Base64 part is empty.");
            }
            console.log("AI Service: Constructed Data URI appears structurally valid. Mime type: " + testMatches[1]);
            return finalDataUri; // This should now always be structurally valid if no error was thrown
        } else {
            // This block handles non-200 statuses that weren't thrown as Axios errors
            const errorData = response.data ? Buffer.from(response.data).toString() : 'Unknown error structure';
            console.error(`Stability AI API v2 Unexpected Non-200 Status: ${response.status} - ${errorData}`);
            throw new Error(`Stability AI API v2 Unexpected Status: ${response.status} - ${errorData}`);
        }
    } catch (error) {
        console.error('--- Stability AI v2 API Call Failed (within ai.service.js) ---');
        if (axios.isAxiosError(error)) {
            // ... (your existing detailed Axios error handling here) ...
            // Example snippet:
            if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
                throw new Error('Stability AI request timed out.');
            }
            if (error.response) {
                const statusCode = error.response.status;
                let responseBody = 'No error body';
                if (error.response.data) {
                    responseBody = Buffer.isBuffer(error.response.data) ? Buffer.from(error.response.data).toString('utf-8') : JSON.stringify(error.response.data);
                }
                throw new Error(`Stability AI v2 API Error (${statusCode}): ${responseBody}`);
            }
            throw new Error(`Axios error during Stability AI call: ${error.message}`);
        }
        // If it's not an Axios error but was thrown by our logic (e.g., "empty image buffer")
        // or some other unexpected JS error
        console.error('Non-Axios error during Stability AI call:', error.message);
        throw error; // Re-throw the specific error (e.g., "Stability AI returned an empty image.")
    }
}

// New function for Gemini text generation
async function generateTextWithGemini(promptText, model = GEMINI_TEXT_MODEL, systemInstructionText = null) {
    if (!GEMINI_API_KEY) {
        console.error('Gemini API key not configured.');
        throw new Error('Gemini API key not configured.');
    }

    const apiUrl = `${GEMINI_API_HOST}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: promptText,
                    },
                ],
            },
        ],
        // Optional: Add generationConfig for more control
        // generationConfig: {
        //   temperature: 0.7,
        //   topK: 1,
        //   topP: 1,
        //   maxOutputTokens: 256, // Adjust as needed
        //   stopSequences: [],
        // },
        // Optional: Add safetySettings
        // safetySettings: [
        //   { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        //   { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        //   // ... more categories
        // ],
    };

    // Add system_instruction if provided
    if (systemInstructionText && typeof systemInstructionText === 'string' && systemInstructionText.trim() !== '') {
        requestBody.system_instruction = {
            parts: [{ text: systemInstructionText }]
        };
        console.log(`Gemini using system instruction: "${systemInstructionText.substring(0, 50)}..."`);
    }

    try {
        console.log(`Calling Gemini API (${model}) with prompt: "${promptText.substring(0, 50)}..."`);
        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 seconds timeout
        });

        if (response.status === 200 && response.data) {
            // The response structure for Gemini can be nested.
            // Typically, the text is in response.data.candidates[0].content.parts[0].text
            if (
                response.data.candidates &&
                response.data.candidates.length > 0 &&
                response.data.candidates[0].content &&
                response.data.candidates[0].content.parts &&
                response.data.candidates[0].content.parts.length > 0 &&
                response.data.candidates[0].content.parts[0].text
            ) {
                const generatedText = response.data.candidates[0].content.parts[0].text;
                console.log(`Gemini response received. Text length: ${generatedText.length}`);
                return generatedText;
            } else if (response.data.promptFeedback && response.data.promptFeedback.blockReason) {
                // Handle cases where the prompt was blocked
                const blockReason = response.data.promptFeedback.blockReason;
                const safetyRatings = response.data.promptFeedback.safetyRatings;
                console.warn(`Gemini prompt blocked. Reason: ${blockReason}`, safetyRatings);
                throw new Error(`Gemini prompt blocked due to: ${blockReason}. Check safety ratings.`);
            } else {
                console.error('Gemini API response in unexpected format:', JSON.stringify(response.data, null, 2));
                throw new Error('Gemini API response in unexpected format.');
            }
        } else {
            // This block might not be hit if axios throws for non-200 by default
            console.error(`Gemini API Error (Non-200): ${response.status} - ${response.statusText}`, response.data);
            throw new Error(`Gemini API Error: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('--- Gemini API Call Failed ---');
        if (axios.isAxiosError(error)) {
            console.error('Axios error details calling Gemini:', error.message);
            if (error.response) {
                const statusCode = error.response.status;
                const statusText = error.response.statusText;
                let responseBody = 'No response body or body is not plain text/JSON.';
                if (error.response.data) {
                    responseBody = (typeof error.response.data === 'object') ? JSON.stringify(error.response.data, null, 2) : String(error.response.data);
                }
                console.error(`Gemini API HTTP Error: ${statusCode} ${statusText}`);
                console.error('Error Response Body from Gemini:', responseBody);
                // Try to extract a more specific error message from Gemini's JSON error
                let readableError = responseBody;
                try {
                    const parsedJsonError = (typeof error.response.data === 'object') ? error.response.data : JSON.parse(responseBody);
                    if (parsedJsonError.error && parsedJsonError.error.message) {
                        readableError = parsedJsonError.error.message;
                    }
                } catch (e) { /* Not a parsable JSON error */ }
                throw new Error(`Gemini API Error (${statusCode}): ${readableError}`);
            } else if (error.request) {
                console.error('Gemini API Error: No response received. Request data:', error.request);
                throw new Error('No response received from Gemini API. Check network or Gemini status.');
            } else {
                throw new Error(`Error setting up Gemini request: ${error.message}`);
            }
        } else {
            console.error('Non-Axios error during Gemini call:', error.message, error.stack);
            throw error;
        }
    }
}

/**
 * Removes the background from an image using the Pixian API.
 * @param {Buffer} imageBuffer - The buffer of the original image.
 * @returns {Promise<string|null>} A promise that resolves to a Base64 data URI of the transparent PNG, or null on failure.
 */
async function removeBackgroundWithPixian(imageBuffer) {
    if (!PIXIAN_API_KEY || !PIXIAN_API_SECRET) {
        console.error('Pixian API key or secret not configured. Skipping background removal.');
        return null;
    }
    if (!imageBuffer || imageBuffer.length === 0) {
        console.warn('Received empty buffer for background removal. Skipping.');
        return null;
    }

    const formData = new FormData();
    formData.append('image', imageBuffer, 'image-to-clean.png');
    formData.append('test', 'true'); // For Test Devolepment

    try {
        console.log('Calling Pixian API to remove background...');
        const response = await axios.post(PIXIAN_API_HOST, formData, {
            responseType: 'arraybuffer',
            headers: {
                ...formData.getHeaders(),
            },
            // This 'auth' block correctly uses your credentials for Basic HTTP Auth
            auth: {
                username: PIXIAN_API_KEY,
                password: PIXIAN_API_SECRET
            },
            timeout: 60000,
        });

        if (response.status === 200) {
            const cleanedImageBuffer = Buffer.from(response.data);
            const base64String = cleanedImageBuffer.toString('base64');
            console.log('Pixian background removal successful.');
            return `data:image/png;base64,${base64String}`;
        }
        return null;
    } catch (error) {
        console.error('--- Pixian API Call Failed ---');
        if (axios.isAxiosError(error) && error.response) {
            const errorText = Buffer.from(error.response.data).toString('utf-8');
            console.error(`Pixian API Error (${error.response.status}): ${errorText}`);
        } else {
            console.error(error.message);
        }
        return null;
    }
}



module.exports = {
    generateImageWithStabilityAI: generateImageWithStabilityAI_V2,
    generateImageWithStabilityAI_V2,
    generateTextWithGemini,
    removeBackgroundWithPixian,
};