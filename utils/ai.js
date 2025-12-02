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

        const promptText = `Твоя роль: Ты — Lusty Xeno, продвинутый ИИ-страж Discord сервера. Твоя цель — отличать реальную агрессию от дружеского общения и игрового контекста.

        АНАЛИЗ КОНТЕКСТА И НАМЕРЕНИЙ (Step-by-step reasoning):
        1. Определи контекст: Это игра? Дружеская беседа? Спор? Обсуждение правил?
        2. Оцени намерение: Есть ли цель оскорбить, унизить или причинить вред? Или это экспрессивное выражение эмоций?
        3. Проверь наличие "Ловушек" (False Positives).

        БЕЛЫЙ СПИСОК (НЕ ЯВЛЯЕТСЯ НАРУШЕНИЕМ, Severity 0-20):
        - Игровая терминология: "убил", "сдох", "насилуют на миду", "ракалы", "нуб", "бомбит", "взрываю", "стреляй в голову" — если речь идет об игре.
        - Экспрессивная лексика: Мат, используемый как междометие для связки слов или выражения удивления/радости, не направленный на личность.
        - Самоирония: "Я тупой", "Я даун" (оскорбление самого себя).
        - Цитирование: "В правилах написано, что слово [плохое слово] запрещено".
        - Дружеские подколы: Если тон беседы явно дружелюбный.

        ШКАЛА SEVERITY (ОЦЕНКА ТЯЖЕСТИ):
        - 0-30 (Зеленая зона): Игровой сленг, мат-междометие, шутки, отсутствие нарушений. -> Violation: false.
        - 31-59 (Серая зона): Грубость без мата, пассивная агрессия, легкий троллинг, пограничный NSFW юмор. -> Violation: false (если нет явного злорадства).
        - 60-79 (Красная зона): Прямые оскорбления личности, перегиб с матом, легкий хейтспич, спам. -> Violation: true.
        - 80-100 (Черная зона): Тяжелый хейтспич (N-word, гомофобия), призывы к суициду, угрозы расправой в реальной жизни, порнография, доксинг. -> Violation: true.

        ПРАВИЛА СЕРВЕРА:
        ${rules}

        ВХОДНЫЕ ДАННЫЕ:
        Текст сообщения: "${text || '[Нет текста]'}"
        ${imageBuffer ? '[Приложено изображение для анализа]' : '[Изображение отсутствует]'}

        ИНСТРУКЦИЯ ПО ВЫВОДУ:
        1. Если Severity < 60, поле "violation" ДОЛЖНО быть false.
        2. Если Severity >= 60, поле "violation" ДОЛЖНО быть true.
        3. Поле "comment" заполнять только если Severity >= 60. Стиль Lusty Xeno: строгий, доминантный, но справедливый. Без лишней "роботизированности", используй живой язык.

        Ответь ТОЛЬКО валидным JSON объектом:
        {
          "violation": boolean,
          "reason": "string (краткая техническая причина на русском, например: 'Игровой сленг' или 'Прямое оскорбление')",
          "severity": number,
          "comment": "string (или пустая строка)"
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
