const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GENAI_API_KEYS } = require('./config');

const models = [];

if (GENAI_API_KEYS && GENAI_API_KEYS.length > 0) {
    for (const key of GENAI_API_KEYS) {
        if (key) {
            const genAI = new GoogleGenerativeAI(key);
            models.push(genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" }));
        }
    }
    console.log(`AI: Initialized ${models.length} model instances.`);
}

async function analyzeText(text) {
    if (models.length === 0) {
        console.error("AI Error: No models initialized. Check API_KEY.");
        return null;
    }

    // Pick a random model to distribute load
    const genAIModel = models[Math.floor(Math.random() * models.length)];

    try {
        const prompt = `Analyze the following text for toxicity, insults, or rule violations. 
        Respond ONLY with a JSON object in this format: { "violation": boolean, "reason": "string", "severity": number (1-10) }. 
        Do not include Markdown formatting.
        Text: "${text}"`;
        
        const result = await genAIModel.generateContent(prompt);
        const response = await result.response;
        const textResponse = response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("AI Error:", error);
        return null;
    }
}

module.exports = {
    analyzeText
};
