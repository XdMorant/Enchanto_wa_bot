const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
let configCache = null;

function loadConfig() {
    if (configCache) return configCache;
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    configCache = JSON.parse(raw);
    return configCache;
}

function saveConfig(newConfig) {
    configCache = newConfig;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf8');
}

function reloadConfig() {
    configCache = null;
    return loadConfig();
}

function jidToNumber(jid) {
    if (!jid) return '';
    return jid.split('@')[0].split(':')[0];
}

function isOwner(jid, config) {
    if (!jid || !config?.ownerNumber) return false;
    return jidToNumber(jid) === String(config.ownerNumber);
}

function isGroupJid(jid) {
    return typeof jid === 'string' && jid.endsWith('@g.us');
}

// FIXED: Now recognizes both standard DMs and new @lid DMs
function isDmJid(jid) {
    return typeof jid === 'string' && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}

function isProtectedGroup(jid, config) {
    if (!config?.protectedGroups) return false;
    return config.protectedGroups.includes(jid);
}

function addProtectedGroup(jid) {
    const config = loadConfig();
    if (!config.protectedGroups.includes(jid)) {
        config.protectedGroups.push(jid);
        saveConfig(config);
        return true;
    }
    return false;
}

function removeProtectedGroup(jid) {
    const config = loadConfig();
    const idx = config.protectedGroups.indexOf(jid);
    if (idx !== -1) {
        config.protectedGroups.splice(idx, 1);
        saveConfig(config);
        return true;
    }
    return false;
}

function isWhitelisted(jid, config) {
    if (!config?.whitelist) return false;
    const num = jidToNumber(jid);
    return config.whitelist.includes(num);
}

function addWhitelist(jid) {
    const config = loadConfig();
    const num = jidToNumber(jid);
    if (!config.whitelist) config.whitelist = [];
    if (!config.whitelist.includes(num)) {
        config.whitelist.push(num);
        saveConfig(config);
        return true;
    }
    return false;
}

function removeWhitelist(jid) {
    const config = loadConfig();
    const num = jidToNumber(jid);
    if (!config.whitelist) return false;
    const idx = config.whitelist.indexOf(num);
    if (idx !== -1) {
        config.whitelist.splice(idx, 1);
        saveConfig(config);
        return true;
    }
    return false;
}

function formatUptime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
}

function getMessageText(msg) {
    if (!msg?.message) return '';
    const m = msg.message;
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        ''
    );
}

module.exports = {
    loadConfig, saveConfig, reloadConfig,
    jidToNumber, isOwner, isGroupJid, isDmJid,
    isProtectedGroup, addProtectedGroup, removeProtectedGroup,
    isWhitelisted, addWhitelist, removeWhitelist,
    formatUptime, getMessageText,
};
