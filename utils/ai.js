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

// Local Toxicity Model (Lazy loaded)
let toxicityClassifier = null;

async function getToxicityClassifier() {
    if (!toxicityClassifier) {
        console.log("Loading local toxicity model (Xenova/toxic-bert)...");
        const { pipeline } = await import('@xenova/transformers');
        toxicityClassifier = await pipeline('text-classification', 'Xenova/toxic-bert');
        console.log("Local toxicity model loaded.");
    }
    return toxicityClassifier;
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

    // Run local toxicity check
    let localScores = "";
    try {
        if (text) {
            const classifier = await getToxicityClassifier();
            const results = await classifier(text, { topk: null }); 
            // results is array of { label: string, score: number }
            
            // Calculate max toxicity score
            const maxScore = Math.max(...results.map(r => r.score));

            // Filter significant scores
            const significant = results.filter(r => r.score > 0.01).map(r => `${r.label}: ${(r.score * 100).toFixed(1)}%`);
            if (significant.length > 0) {
                localScores = significant.join(", ");
                console.log(`[Local AI] Scores for "${text.substring(0, 20)}...": ${localScores}`);
            }

            // SKIP GEMINI if toxicity is low and no image is present
            // Threshold: 70% (0.7)
            if (!imageBuffer && maxScore < 0.7) {
                console.log(`[AI] Skipping Gemini: Max toxicity ${(maxScore * 100).toFixed(1)}% < 70%`);
                return null;
            }
        }
    } catch (e) {
        console.error("Local AI Error:", e);
    }

    try {
        // Правила переписаны слово в слово из вашего скриншота для точности
        const rules = `
Общие правила:
0. Не будьте мудаком.
1. Участники обязаны соблюдать правила вне зависимости от ролей.
1.1. Неадекватное поведение/рецидив -> перманентная блокировка.
1.2. Запрещен обход наказаний.

Использование каналов:
2. Запрещены оффтоп, флуд, чрезмерный капс.
2.1. Запрещены рофлопредложения и рофложалобы (нарушающие принципы, непроработанные, провокационные).
2.2. МЕТАГЕЙМИНГ: Запрещено распространять игровую информацию из ТЕКУЩЕГО раунда (кроме доступной из лобби).
2.3. Запрещена реклама и спам.
2.4. Запрещено NSFW в любом проявлении.

Коммуникация:
3. Запрещены оскорбления и провокации.
3.1. Избегайте ненужных упоминаний (пингов) пользователей и администрации.
3.2. Уважение к администрации.

Политика и экстремизм:
4. Запрещена пропаганда нацизма, фашизма, экстремизма.
4.1. ПОЛИТИКА: Запрещены любые обсуждения текущих политических событий и провокации на эту тему.
`;

        const promptText = `
Ты — Lusty Xeno, ИИ-страж игрового Discord сервера. Твоя задача — защищать чат от реальной грязи, политики и сливов игры, но не душнить за локальные мемы.

ГЛАВНЫЕ ПРИОРИТЕТЫ (УРОВНИ УГРОЗЫ):

🔴 КРИТИЧЕСКИЕ НАРУШЕНИЯ (Severity 80-100) -> Violation: TRUE
1. ПОЛИТИКА (Правило 4, 4.1): Любые упоминания войн, текущих конфликтов, политиков, провокационных лозунгов. ZERO TOLERANCE.
2. NSFW (Правило 2.4): Порнография, гуро, жестокость.
3. МЕТАГЕЙМИНГ (Правило 2.2): Слив информации из текущего раунда (кто предатель, коды, локация, "меня убили в техах"). Важно: Обсуждение ПРОШЛЫХ раундов разрешено.
4. ЭКСТРЕМИЗМ (Правило 4): Символика, зиги, радикальные лозунги.

🟠 СЕРЬЕЗНЫЕ НАРУШЕНИЯ (Severity 60-79) -> Violation: TRUE
1. Прямые оскорбления (Правило 3): Агрессия направленная на ЛИЧНОСТЬ ("@User ты урод").
2. Травля/Токсичность (Правило 0, 1.1): Целенаправленное унижение.
3. Спам/Флуд (Правило 2, 2.3): Массовое засорение чата, реклама.

🟢 БЕЗОПАСНАЯ ЗОНА / ИГНОР (Severity 0-45) -> Violation: FALSE
ВАЖНО: Игнорируй следующее, если это не спам на весь экран:
- "Шитпостинг" и безадресный мат: ("гей гей пидор", "жопа", "блять" как связка слов). Если нет жертвы — нет нарушения.
- Игровой сленг: "Клоун", "СБ сосатб", "Нюкер", "Синди", "Васян" (в контексте ролевой игры).
- Рофлы без злобы: Дружеские подколы, ирония, мемные фразы ("кожаный ублюдок").
- Обсуждение механик игры.

ЛОГИКА ПРИНЯТИЯ РЕШЕНИЯ:
1. Проверь Политику/NSFW. Есть? -> БАН (Severity 100).
2. Проверь Метагейминг. Это инфа о текущем раунде? -> ВАРН (Severity 70).
3. Проверь Оскорбления. Это атака на конкретного человека? 
   - ДА -> Violation: TRUE.
   - НЕТ (просто крик души или мем) -> Violation: FALSE.

ПРИМЕРЫ РЕШЕНИЙ (FEW-SHOT LEARNING):
- "СБ сосатб" -> { violation: false, severity: 10, reason: "Игровой сленг/мем" }
- "Код от арсенала 1234" -> { violation: true, severity: 70, reason: "Правило 2.2: Метагейминг (код)" }
- "Слава [Стране]!" -> { violation: true, severity: 100, reason: "Правило 4.1: Политика" }
- "@User ты ничтожество, удали игру" -> { violation: true, severity: 65, reason: "Правило 3: Прямое оскорбление" }
- "Ну ты и бот конечно" (в ответ на фейл в игре) -> { violation: false, severity: 20, reason: "Дружеский подкол" }
- "Админы дауны" -> { violation: true, severity: 60, reason: "Правило 3.2: Неуважение к администрации" }

ПРАВИЛА СЕРВЕРА:
${rules}

КОНТЕНТ ДЛЯ АНАЛИЗА:
Текст: "${text || '[Нет текста]'}"
${imageBuffer ? '[Приложено изображение]' : ''}
${localScores ? `\n[ВАЖНО] Локальный анализ токсичности (BERT): ${localScores}\nИспользуй эти данные как подсказку, но принимай решение на основе контекста.` : ''}

Ответь ТОЛЬКО JSON объектом:
{ 
    "violation": boolean, 
    "reason": "string (укажи номер нарушенного правила, например 'Правило 4.1: Политика')", 
    "severity": number (0-100),
    "comment": "string (Комментарий в стиле Lusty Xeno: строгий, но справедливый. Заполнять ТОЛЬКО если violation=true)" 
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
