const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GENAI_API_KEYS } = require('./config');

// Initialize models for all keys
const models = [];
if (GENAI_API_KEYS && GENAI_API_KEYS.length > 0) {
    GENAI_API_KEYS.forEach(key => {
        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            models.push(model);
        } catch (e) {
            console.error(`Failed to initialize AI model with key ending in ...${key.slice(-4)}:`, e.message);
        }
    });
}

// Round-robin counter
let currentKeyIndex = 0;

function getNextModel() {
    if (models.length === 0) return null;
    const model = models[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % models.length;
    return model;
}

async function analyzeText(text) {
    const model = getNextModel();
    if (!model) {
        console.error("AI Error: No models initialized. Check API_KEYS.");
        return null;
    }
    try {
        const prompt = `Analyze the following text for toxicity, insults, or rule violations. 
        Respond ONLY with a JSON object in this format: { "violation": boolean, "reason": "string", "severity": number (1-10) }. 
        Do not include Markdown formatting.
        Text: "${text}"`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("AI Error:", error);
        // Simple retry logic: if one key fails, try the next one immediately
        if (models.length > 1) {
            console.log("Retrying with next API key...");
            return analyzeText(text); // Recursive retry (be careful with infinite loops, but here it's limited by stack)
        }
        return null;
    }
}

module.exports = {
    analyzeText
};
