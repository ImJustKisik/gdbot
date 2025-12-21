const axios = require('axios');
const { GENAI_API_KEYS, IMAGE_API_KEY } = require('./config');
const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize keys
const apiKeys = GENAI_API_KEYS || [];
if (apiKeys.length === 0) {
    console.error('DEBUG: API_KEY or API_KEYS is MISSING in process.env. Please check your .env file.');
}

if (!IMAGE_API_KEY) {
    console.warn('DEBUG: IMAGE_API_KEY is MISSING in process.env. Image analysis might fail or use default keys if implemented fallback.');
}

// Round-robin counter
let currentKeyIndex = 0;

function getNextKey() {
    if (apiKeys.length === 0) return null;
    const key = apiKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
    return key;
}

// --- Python Detoxify Bridge ---
let pythonProcess = null;
let pythonReady = false;
const pendingRequests = new Map(); // id -> resolve/reject

function startPythonBridge() {
    console.log("[AI Bridge] Starting Python Detoxify service...");
    // Try python3 first (standard on Linux), fallback to python (Windows)
    const command = process.platform === 'win32' ? 'python' : 'python3';
    
    pythonProcess = spawn(command, ['toxicity_server.py'], {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
    });

    pythonProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.status === 'loading') {
                    console.log(`[AI Bridge] ${msg.message}`);
                } else if (msg.status === 'ready') {
                    console.log(`[AI Bridge] ${msg.message}`);
                    pythonReady = true;
                } else if (msg.status === 'error') {
                    console.error(`[AI Bridge] Error: ${msg.message}`);
                } else if (msg.status === 'ok' && msg.id) {
                    const resolver = pendingRequests.get(msg.id);
                    if (resolver) {
                        resolver(msg.results);
                        pendingRequests.delete(msg.id);
                    }
                }
            } catch (e) {
                console.error(`[AI Bridge] Failed to parse JSON: ${line}`, e);
            }
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`[AI Bridge Stderr] ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`[AI Bridge] Process exited with code ${code}`);
        pythonReady = false;
        pythonProcess = null;
        // Auto-restart after delay
        setTimeout(startPythonBridge, 5000);
    });
}

// Start the bridge
startPythonBridge();

async function getToxicityScores(text) {
    if (!pythonReady || !pythonProcess) return null;
    
    const id = uuidv4();

    return new Promise((resolve, reject) => {
        // Store resolver
        pendingRequests.set(id, resolve);
        
        // Send request
        const payload = JSON.stringify({ id, text }) + '\n';
        pythonProcess.stdin.write(payload);
        
        // Timeout
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                resolve(null); // Timeout
            }
        }, 5000);
    });
}

const DEFAULT_RULES = `
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

const DEFAULT_PROMPT = `
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
{{RULES}}

Ответь ТОЛЬКО JSON объектом:
{ 
    "violation": boolean, 
    "reason": "string (укажи номер нарушенного правила, например 'Правило 4.1: Политика')", 
    "severity": number (0-100),
    "comment": "string (Комментарий в стиле Lusty Xeno: строгий, но справедливый. Заполнять ТОЛЬКО если violation=true)" 
}`;

async function analyzeContent(text, imageBuffer = null, mimeType = null, options = {}) {
    const apiKey = getNextKey();
    if (!apiKey) {
        console.error("AI Error: No API keys available.");
        return null;
    }

    const { prompt = DEFAULT_PROMPT, rules = DEFAULT_RULES } = options;

    // Локальная проверка Detoxify
    let localScores = "";
    try {
        if (text) {
            const scores = await getToxicityScores(text);
            if (scores) {
                const maxScore = Math.max(...Object.values(scores));
                const significant = Object.entries(scores)
                    .filter(([k, v]) => v > 0.01)
                    .map(([k, v]) => `${k}: ${(v * 100).toFixed(1)}%`)
                    .join(", ");
                if (significant) {
                    localScores = significant;
                    console.log(`[Detoxify] Scores for "${text.substring(0, 20)}...": ${localScores}`);
                }
                if (!imageBuffer && maxScore < 0.7) {
                    console.log(`[AI] Skipping OpenRouter: Max toxicity ${(maxScore * 100).toFixed(1)}% < 70%`);
                    return null;
                }
            } else {
                console.log("[Detoxify] No response or timeout. Proceeding to OpenRouter.");
            }
        }
    } catch (e) {
        console.error("Local AI Error:", e);
    }

    // --- Разделение логики для текста и изображений ---
    try {
        if (imageBuffer && mimeType) {
            // Проверка изображения через Gemini (или LLaVA)
            const imageModel = "google/gemini-2.0-flash-001"; // или другую подходящую
            const systemPrompt = "Ты — Lusty Xeno, ИИ-страж Discord. Проверь изображение на NSFW, экстремизм, политику, метагейминг. Ответь ТОЛЬКО JSON: { violation: boolean, reason: string, severity: number, comment: string }";
            const userContent = [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBuffer.toString('base64')}` } }
            ];
            if (text) {
                userContent.push({ type: "text", text: `Текст: \"${text}\"` });
            }
            if (localScores) {
                userContent.push({ type: "text", text: `\n[Detoxify]: ${localScores}` });
            }
            
            // Use dedicated IMAGE_API_KEY if available, otherwise fallback to standard rotation
            const token = IMAGE_API_KEY || apiKey;
            
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: imageModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ]
            }, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://discord.com",
                    "X-Title": "Discord Guardian Bot"
                }
            });
            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : content;
            return JSON.parse(jsonStr);
        } else {
            // Проверка текста через deepseek-r1t2-chimera
            const systemPrompt = prompt.replace('{{RULES}}', rules);

            const userContent = [
                { type: "text", text: `Текст: "${text || '[Нет текста]'}"` }
            ];
            if (localScores) {
                userContent.push({ type: "text", text: `\n[Detoxify]: ${localScores}` });
            }
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: "tngtech/deepseek-r1t2-chimera:free",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ]
            }, {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://discord.com",
                    "X-Title": "Discord Guardian Bot"
                }
            });
            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : content;
            return JSON.parse(jsonStr);
        }
    } catch (error) {
        console.error("AI Error:", error.response?.data || error.message);
        if (apiKeys.length > 1) {
            console.log("Retrying with next API key...");
            return analyzeContent(text, imageBuffer, mimeType);
        }
        return null;
    }
}

const APPEAL_FILTER_PROMPT = `
Ты — AI-фильтр для системы апелляций Discord сервера.
Твоя задача — проверить текст апелляции на адекватность.

Критерии ОТКЛОНЕНИЯ (valid: false):
1. Бессмысленный набор букв/символов ("ываыва", "123123").
2. Спам или реклама.
3. Прямые оскорбления без аргументации ("админ лох", "пошли нахер").
4. Троллинг ("разбаньте пж я больше не буду" - если это выглядит как явный рофл).
5. Слишком короткий текст, не несущий смысла ("нет", "не согласен").

Критерии ОДОБРЕНИЯ (valid: true):
1. Любая попытка объяснить свою позицию.
2. Эмоциональный, но осмысленный текст.
3. "Я не знал правил", "Это был не я" и т.д.

Ответь ТОЛЬКО JSON объектом:
{
    "valid": boolean,
    "reason": "string (краткая причина отклонения для пользователя, на русском)"
}
`;

const APPEAL_SUMMARY_PROMPT = `
Ты — AI-ассистент для модераторов. Твоя задача — составить краткое, нейтральное резюме апелляции.

Контекст наказания:
{{CONTEXT}}

Твоя задача:
1. Выдели суть претензии пользователя (почему он не согласен).
2. Оцени тон сообщения (агрессивный, вежливый, раскаяние).
3. Составь краткое резюме (2-3 предложения) для модератора.

Ответь ТОЛЬКО JSON объектом:
{
    "summary": "string (твое резюме)",
    "tone": "string (тон сообщения)",
    "recommendation": "string (твое мнение: стоит ли пересмотреть, исходя из логики, или аргументы слабые)"
}
`;

async function askAI(systemPrompt, userText, model = "google/gemini-2.0-flash-001") {
    const apiKey = getNextKey();
    if (!apiKey) return null;

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://discord.com",
                "X-Title": "Discord Guardian Bot"
            }
        });
        const content = response.data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (error) {
        console.error("AI Request Error:", error.response?.data || error.message);
        return null;
    }
}

async function checkAppealValidity(text) {
    return await askAI(APPEAL_FILTER_PROMPT, `Текст апелляции: "${text}"`);
}

async function createAppealSummary(appealText, punishmentContext) {
    const prompt = APPEAL_SUMMARY_PROMPT.replace('{{CONTEXT}}', punishmentContext);
    return await askAI(prompt, `Текст апелляции: "${appealText}"`);
}

module.exports = { analyzeContent, DEFAULT_PROMPT, DEFAULT_RULES, checkAppealValidity, createAppealSummary };
