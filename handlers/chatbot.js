const axios = require('axios');
const logger = require('../utils/logger');
const { getMessageText, isDmJid } = require('../utils/helpers');

// Memory Caches
const offlineNoticeCache = new Map(); 
const pausedChats = new Map(); // Remembers which chats the owner manually replied to

const NOTICE_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
const PAUSE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

// Function to pause the bot in a specific chat
function pauseChat(chatId) {
    pausedChats.set(chatId, Date.now());
}

// Function to manually resume a chat (used by .resume command)
function resumeChat(chatId) {
    if (pausedChats.has(chatId)) {
        pausedChats.delete(chatId);
        return true;
    }
    return false;
}

async function callAI(prompt, config) {
    const ai = config.ai || {};
    if (!ai.apiKey || ai.apiKey.includes('REPLACE')) throw new Error('AI API key not configured.');
    if (!ai.baseUrl) throw new Error('AI baseUrl missing in config.json.');

    const url = `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
        model: ai.model,
        messages: [
            { role: 'system', content: ai.systemPrompt || 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
        ],
        max_tokens: ai.maxTokens ?? 300,
        temperature: ai.temperature ?? 0.7,
    };

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` };

    try {
        const res = await axios.post(url, body, { headers, timeout: 30000 });
        const content = res.data?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty response from AI provider.');
        return content.trim();
    } catch (err) {
        const status = err.response?.status;
        const apiMsg = err.response?.data?.error?.message || err.message;
        if (status === 401) throw new Error('AI auth failed (401). Check API key.');
        if (status === 429) throw new Error('AI rate limit hit (429). Try again shortly.');
        throw new Error(`AI request failed: ${apiMsg}`);
    }
}

async function handleAiCommand(sock, msg, text, config, chatId) {
    const ai = config.ai || {};
    if (!ai.enabled || !ai.commandEnabled) {
        await sock.sendMessage(chatId, { text: '❌ AI command is disabled.' }, { quoted: msg });
        return false;
    }
    try {
        const reply = await callAI(text, config);
        await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
        return true;
    } catch (err) {
        await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: msg });
        return false;
    }
}

async function handleDmAutoReply(sock, msg, config) {
    try {
        const chatId = msg.key.remoteJid;
        
        if (!isDmJid(chatId)) return false;
        if (msg.key.fromMe) return false;

        const ai = config.ai || {};
        if (!ai.enabled || !ai.dmAutoReply) return false;

        const text = getMessageText(msg);
        if (!text || text.trim().length === 0) return false;
        if (text.startsWith('.')) return false;

        // === CHECK IF CHAT IS PAUSED ===
        const lastPaused = pausedChats.get(chatId) || 0;
        if (Date.now() - lastPaused < PAUSE_DURATION_MS) {
            console.log(`💤 [CHATBOT] Chat ${chatId} is paused (you replied manually recently). Ignoring.`);
            return false; // Do not reply!
        } else if (lastPaused !== 0) {
            // The 2 hours are up, remove them from the pause list
            pausedChats.delete(chatId); 
        }

        // Check if we need to send the offline notice
        const lastNoticed = offlineNoticeCache.get(chatId) || 0;
        const now = Date.now();

        if (now - lastNoticed > NOTICE_COOLDOWN_MS) {
            await sock.sendMessage(chatId, { 
                text: "⚠️ *Owner is currently offline.*\n\nI am their AI assistant. I will reply to your messages shortly. How can I help you?" 
            });
            offlineNoticeCache.set(chatId, now);
        }

        const reply = await callAI(text, config);
        const styledReply = `> *🤖 AI ASSISTANT:*\n\n${reply}`;
        await sock.sendMessage(chatId, { text: styledReply });
        
        return true;
    } catch (err) {
        logger.error(`chatbot DM error: ${err.message}`);
        return false;
    }
}

module.exports = { handleAiCommand, handleDmAutoReply, callAI, pauseChat, resumeChat };
