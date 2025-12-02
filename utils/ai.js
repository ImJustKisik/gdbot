const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GENAI_API_KEYS } = require('./config');

// Initialize models for all keys
const models = [];
if (GENAI_API_KEYS && GENAI_API_KEYS.length > 0) {
    GENAI_API_KEYS.forEach((key, index) => {
        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
            models.push({
                instance: model,
                keyMask: `...${key.slice(-4)}`,
                usage: 0,
                id: index + 1
            });
        } catch (e) {
            console.error(`Failed to initialize AI model with key ending in ...${key.slice(-4)}:`, e.message);
        }
    });
}

// Round-robin counter
let currentKeyIndex = 0;

function getNextModel() {
    if (models.length === 0) return null;
    const wrapper = models[currentKeyIndex];
    wrapper.usage++;
    currentKeyIndex = (currentKeyIndex + 1) % models.length;
    return wrapper;
}

async function analyzeContent(text, imageBuffer = null, mimeType = null) {
    const wrapper = getNextModel();
    if (!wrapper) {
        console.error("AI Error: No models initialized. Check API_KEYS.");
        return null;
    }

    // Log usage stats
    console.log(`[AI LB] Key ${wrapper.id} (${wrapper.keyMask}) | Usage: ${wrapper.usage}`);
    const model = wrapper.instance;

    try {
        const rules = `1. Уважение: запрещены оскорбления, травля, угрозы, дискриминация.
2. Нет токсичности: запрещены агрессия, троллинг, провокации.
3. Приватность: запрещен слив личных данных.
4. NSFW: запрещен контент 18+ (порнография, гуро, жестокость).
5. Спам/Флуд: запрещены.
6. Реклама: запрещена.`;

        const promptText = `Ты — Lusty Xeno, ИИ-страж Discord сервера. Твоя задача — выявлять нарушения правил и TOS Discord в тексте и изображениях.

        ВАЖНЫЕ ИНСТРУКЦИИ ПО КОНТЕКСТУ:
        - Игровой сленг (убил, сдох, нуб, рак, бот, лох в контексте игры) -> НЕ является нарушением или имеет низкий severity (10-30).
        - Дружеские подколы и мат без агрессии -> Низкий severity (20-40).
        - Самоирония ("я тупой") -> НЕ нарушение (0).
        - Мат как междометие (для связки слов) -> НЕ нарушение, если не направлен на личность.
        
        КРИТИЧЕСКИЕ НАРУШЕНИЯ (Severity 80-100):
        - Hate Speech (расизм, гомофобия, сексизм).
        - Прямые угрозы жизни/здоровью.
        - Слив личных данных (Doxing).
        - NSFW/Порнография/Hentai/Gore (на изображениях).
        - Жесткие прямые оскорбления личности с целью унизить.

        Правила сервера:
        ${rules}
        
        Проанализируй контент. Текст: "${text || '[Нет текста]'}"
        ${imageBuffer ? '[Приложено изображение для анализа]' : ''}
        
        Ответь ТОЛЬКО JSON объектом:
        { 
            "violation": boolean, 
            "reason": "string (краткая причина нарушения на русском)", 
            "severity": number (1-100),
            "comment": "string (Твой комментарий как Lusty Xeno: строгий, но харизматичный, на русском языке. Если severity < 75, оставь пустым)" 
        }`;
        
        const parts = [promptText];
        if (imageBuffer && mimeType) {
            parts.push({
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: mimeType
                }
            });
        }

        const result = await model.generateContent(parts);
        const response = await result.response;
        const textResponse = response.text().replace(/```json|```/g, '').trim();
        return JSON.parse(textResponse);
    } catch (error) {
        console.error("AI Error:", error);
        // Simple retry logic: if one key fails, try the next one immediately
        if (models.length > 1) {
            console.log("Retrying with next API key...");
            return analyzeContent(text, imageBuffer, mimeType); 
        }
        return null;
    }
}

module.exports = {
    analyzeContent
};
