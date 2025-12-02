const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GENAI_API_KEY } = require('./config');

let genAIModel = null;
if (GENAI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GENAI_API_KEY);
    genAIModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
}

async function analyzeText(text) {
    if (!genAIModel) return null;
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
