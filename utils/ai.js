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
        const prompt = `Analyze the following text for toxicity or rule violations. If it's a violation, suggest a severity score from 1 to 10. Text: "${text}"`;
        const result = await genAIModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("AI Error:", error);
        return null;
    }
}

module.exports = {
    analyzeText
};
