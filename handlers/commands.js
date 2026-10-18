const logger = require('../utils/logger');
const {
    loadConfig, saveConfig, reloadConfig, isOwner, isGroupJid,
    addProtectedGroup, removeProtectedGroup, formatUptime, jidToNumber,
    addWhitelist, removeWhitelist,
} = require('../utils/helpers');
const { handleAiCommand, resumeChat } = require('./chatbot');

// List of random emojis to react with
const REACT_EMOJIS = ['⚡', '🔥', '🤖', '✨', '🌟', '💎', '🚀', '👾', '🦾', '🎯', '💡', '🛸'];

async function handleCommand(sock, msg, config, state) {
    const chatId = msg.key.remoteJid;
    const senderId = msg.key.participant || msg.key.remoteJid;

    if (!isOwner(senderId, config)) return false;

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    if (!text || !text.startsWith('.')) return false;

    const [rawCmd, ...args] = text.trim().slice(1).split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const arg = args.join(' ').trim();

    // 🎭 RANDOM REACTION LOGIC
    const validCommands = ['menu', 'help', 'addgroup', 'removegroup', 'listgroups', 'allow', 'unallow', 'kick', 'chatbot', 'aichat', 'bot', 'ai', 'status', 'resume'];
    if (validCommands.includes(cmd)) {
        const randomEmoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
        try {
            await sock.sendMessage(chatId, {
                react: { text: randomEmoji, key: msg.key }
            });
        } catch (err) {}
    }

    // ---------- .menu (STYLISH) ----------
    if (cmd === 'menu' || cmd === 'help') {
        const up = formatUptime(Date.now() - (state.startTime || Date.now()));
        const pushName = msg.pushName || 'User';
        const timeNow = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const menuText = [
            `Hello Dear ${pushName}`,
            `⎯͢✧ ${new Date().toLocaleDateString('en-GB')} ⎯͢✧ ${timeNow}`,
            ``,
            `╭──⦿「 🤖 *BOT INFO* 」`,
            `│ ㊝ *Name:* 𝗘𝗡𝗖𝗛𝗔𝗡𝗧𝗢 𝗕𝗢𝗧`,
            `│ ㊝ *Uptime:* ${up}`,
            `│ ㊝ *Owner:* ${config.ownerName}`,
            `╰────────────────────`,
            ``,
            `╭──⦿「 🛡️ *GROUP SECURITY* 」`,
            `│ ㊝ .addgroup`,
            `│ ㊝ .removegroup`,
            `│ ㊝ .listgroups`,
            `│ ㊝ .allow (tag/reply)`,
            `│ ㊝ .unallow (tag/reply)`,
            `│ ㊝ .kick (tag/reply)`,
            `╰────────────────────`,
            ``,
            `╭──⦿「 🤖 *AI & CHATBOT* 」`,
            `│ ㊝ .ai <text>`,
            `│ ㊝ .resume (wake AI in chat)`,
            `│ ㊝ .bot on/off`,
            `│ ㊝ .aichat on/off`,
            `│ ㊝ .chatbot on/off`,
            `╰────────────────────`,
            ``,
            `╭──⦿「 ⚙️ *SYSTEM* 」`,
            `│ ㊝ .status`,
            `│ ㊝ .menu`,
            `╰────────────────────`,
            ``,
            `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝙀𝙉𝘾𝙃𝘼𝙉𝙏𝙊* 🚀`
        ].join('\n');

        await sock.sendMessage(chatId, { text: menuText }, { quoted: msg });
        return true;
    }

    // ---------- GROUP PROTECTION ----------
    if (cmd === 'addgroup' || cmd === 'removegroup' || cmd === 'listgroups') {
        if (!isGroupJid(chatId) && cmd !== 'listgroups') {
            await sock.sendMessage(chatId, { text: '⚠️ Run this inside a group.' }, { quoted: msg });
            return true;
        }
        const cfg = loadConfig();
        if (cmd === 'addgroup') {
            const added = addProtectedGroup(chatId);
            reloadConfig();
            await sock.sendMessage(chatId, { text: added ? `✅ Group added.` : `ℹ️ Already protected.` }, { quoted: msg });
        } else if (cmd === 'removegroup') {
            const removed = removeProtectedGroup(chatId);
            reloadConfig();
            await sock.sendMessage(chatId, { text: removed ? `✅ Group removed.` : `ℹ️ Not protected.` }, { quoted: msg });
        } else {
            const list = cfg.protectedGroups || [];
            const out = list.length ? list.map((j, i) => `${i + 1}. ${j}`).join('\n') : 'None.';
            await sock.sendMessage(chatId, { text: `🛡️ Protected (${list.length}):\n\n${out}` }, { quoted: msg });
        }
        return true;
    }

    // ---------- WHITELIST & KICK ----------
    if (cmd === 'allow' || cmd === 'unallow' || cmd === 'kick') {
        if (!isGroupJid(chatId)) return true;
        const ctx = msg.message.extendedTextMessage?.contextInfo;
        const targetJid = ctx?.mentionedJid?.[0] || ctx?.participant;

        if (!targetJid) {
            await sock.sendMessage(chatId, { text: `⚠️ Tag or reply to someone to use .${cmd}` }, { quoted: msg });
            return true;
        }

        if (cmd === 'kick') {
            try {
                await sock.groupParticipantsUpdate(chatId, [targetJid], 'remove');
                await sock.sendMessage(chatId, { text: `👢 Kicked @${jidToNumber(targetJid)}.`, mentions: [targetJid] }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(chatId, { text: `❌ Kick failed: ${err.message}` }, { quoted: msg });
            }
        } else if (cmd === 'allow') {
            const added = addWhitelist(targetJid);
            reloadConfig();
            await sock.sendMessage(chatId, { text: added ? `✅ @${jidToNumber(targetJid)} whitelisted.` : `ℹ️ Already whitelisted.`, mentions: [targetJid] }, { quoted: msg });
        } else {
            const removed = removeWhitelist(targetJid);
            reloadConfig();
            await sock.sendMessage(chatId, { text: removed ? `✅ @${jidToNumber(targetJid)} removed from whitelist.` : `ℹ️ Not in whitelist.`, mentions: [targetJid] }, { quoted: msg });
        }
        return true;
    }

    // ---------- AI TOGGLES ----------
    if (cmd === 'chatbot' || cmd === 'aichat' || cmd === 'bot') {
        if (arg !== 'on' && arg !== 'off') {
            await sock.sendMessage(chatId, { text: `Usage: .${cmd} on | off` }, { quoted: msg });
            return true;
        }
        const cfg = loadConfig();
        if (cmd === 'chatbot') cfg.ai.dmAutoReply = arg === 'on';
        if (cmd === 'aichat') cfg.ai.commandEnabled = arg === 'on';
        if (cmd === 'bot') cfg.ai.enabled = arg === 'on';
        saveConfig(cfg);
        reloadConfig();
        await sock.sendMessage(chatId, { text: `✅ ${cmd.toUpperCase()} is now ${arg.toUpperCase()}.` }, { quoted: msg });
        return true;
    }

    // ---------- RESUME AI ----------
    if (cmd === 'resume') {
        const resumed = resumeChat(chatId);
        await sock.sendMessage(chatId, { 
            text: resumed ? `✅ AI assistant has been woken up in this chat.` : `ℹ️ AI is already active in this chat (not paused).` 
        }, { quoted: msg });
        return true;
    }

    // ---------- AI COMMAND ----------
    if (cmd === 'ai') {
        if (!arg) {
            await sock.sendMessage(chatId, { text: 'Usage: .ai <question>' }, { quoted: msg });
            return true;
        }
        await handleAiCommand(sock, msg, arg, loadConfig(), chatId);
        return true;
    }

    // ---------- STATUS ----------
    if (cmd === 'status') {
        const cfg = loadConfig();
        const up = formatUptime(Date.now() - (state.startTime || Date.now()));
        await sock.sendMessage(chatId, {
            text: `📊 *Status*\n⏱️ Uptime: ${up}\n🛡️ Groups: ${cfg.protectedGroups?.length || 0}\n📝 Whitelist: ${cfg.whitelist?.length || 0}\n🤖 AI: ${cfg.ai.enabled ? 'ON' : 'OFF'} | .ai: ${cfg.ai.commandEnabled ? 'ON' : 'OFF'} | DM: ${cfg.ai.dmAutoReply ? 'ON' : 'OFF'}`
        }, { quoted: msg });
        return true;
    }

    return false;
}

module.exports = { handleCommand };
