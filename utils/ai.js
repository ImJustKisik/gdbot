const axios = require('axios');
const { GENAI_API_KEYS } = require('./config');
const { spawn } = require('child_process');
const path = require('path');

// Initialize keys
const apiKeys = GENAI_API_KEYS || [];
if (apiKeys.length === 0) {
    console.error('DEBUG: API_KEY or API_KEYS is MISSING in process.env. Please check your .env file.');
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
                } else if (msg.status === 'ok' && pendingRequests.has('latest')) {
                    // Simple single-request handling for now (since we process messages sequentially mostly)
                    // Ideally we'd use IDs, but for simplicity we'll just resolve the last pending
                    const resolver = pendingRequests.get('latest');
                    resolver(msg.results);
                    pendingRequests.delete('latest');
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
    
    return new Promise((resolve, reject) => {
        // Store resolver
        pendingRequests.set('latest', resolve);
        
        // Send request
        const payload = JSON.stringify({ text }) + '\n';
        pythonProcess.stdin.write(payload);
        
        // Timeout
        setTimeout(() => {
            if (pendingRequests.has('latest')) {
                pendingRequests.delete('latest');
                resolve(null); // Timeout
            }
        }, 3000);
    });
}

async function analyzeContent(text, imageBuffer = null, mimeType = null) {
    const apiKey = getNextKey();
    if (!apiKey) {
        console.error("AI Error: No API keys available.");
        return null;
    }

    // Log usage stats
    console.log(`[AI LB] Using key ...${apiKey.slice(-4)}`);

    // Run local toxicity check (Python Detoxify)
    let localScores = "";
    try {
        if (text) {
            const scores = await getToxicityScores(text);
            
            if (scores) {
                // scores: { toxicity: 0.9, severe_toxicity: 0.1, ... }
                const maxScore = Math.max(...Object.values(scores));
                
                // Format significant scores
                const significant = Object.entries(scores)
                    .filter(([k, v]) => v > 0.01)
                    .map(([k, v]) => `${k}: ${(v * 100).toFixed(1)}%`)
                    .join(", ");
                
                if (significant) {
                    localScores = significant;
                    console.log(`[Detoxify] Scores for "${text.substring(0, 20)}...": ${localScores}`);
                }

                // SKIP AI if toxicity is low (< 70%) and no image
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

        const systemPrompt = `
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

Ответь ТОЛЬКО JSON объектом:
{ 
    "violation": boolean, 
    "reason": "string (укажи номер нарушенного правила, например 'Правило 4.1: Политика')", 
    "severity": number (0-100),
    "comment": "string (Комментарий в стиле Lusty Xeno: строгий, но справедливый. Заполнять ТОЛЬКО если violation=true)" 
}`;

        const userContent = [
            { type: "text", text: `Текст: "${text || '[Нет текста]'}"` }
        ];

        if (imageBuffer && mimeType) {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                }
            });
        }
        
        if (localScores) {
            userContent.push({
                type: "text",
                text: `\n[ВАЖНО] Локальный анализ токсичности (Detoxify): ${localScores}\nИспользуй эти данные как подсказку, но принимай решение на основе контекста.`
            });
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
                "HTTP-Referer": "https://discord.com", // Optional
                "X-Title": "Discord Guardian Bot" // Optional
            }
        });

        const content = response.data.choices[0].message.content;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("AI Error:", error.response?.data || error.message);
        // Simple retry logic: if one key fails, try the next one immediately
        if (apiKeys.length > 1) {
            console.log("Retrying with next API key...");
            return analyzeContent(text, imageBuffer, mimeType); 
        }
        return null;
    }
}

module.exports = { analyzeContent };
