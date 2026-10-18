const logger = require('../utils/logger');
const { containsUrl } = require('../utils/url');
const { isProtectedGroup, getMessageText, jidToNumber, isWhitelisted } = require('../utils/helpers');

function isParticipantAdmin(participantId, groupMetadata) {
    if (!groupMetadata?.participants) return false;
    const target = jidToNumber(participantId);
    for (const p of groupMetadata.participants) {
        const pNum = jidToNumber(p.id);
        if (pNum === target) return p.admin === 'admin' || p.admin === 'superadmin';
    }
    return false;
}

async function handleUrlGuard(sock, msg, config) {
    try {
        const chatId = msg.key.remoteJid;
        if (!chatId || !chatId.endsWith('@g.us')) return false;
        if (!isProtectedGroup(chatId, config)) return false;

        const text = getMessageText(msg);
        if (!text || !containsUrl(text)) return false;

        const senderId = msg.key.participant || msg.key.remoteJid;
        if (!senderId) return false;

        // 🛡️ WHITELIST BYPASS: Ignore completely if whitelisted
        if (isWhitelisted(senderId, config)) {
            console.log(`🛡️ [URL GUARD] Sender is Whitelisted. Bypassing link protection.`);
            return false; 
        }

        console.log(`🛡️ [URL GUARD] 🚨 URL DETECTED! Proceeding...`);

        let groupMetadata = null;
        try {
            groupMetadata = await sock.groupMetadata(chatId);
        } catch (err) {
            logger.error(`urlGuard: groupMetadata failed: ${err.message}`);
            return false;
        }

        const guard = config.urlGuard || {};
        const senderIsAdmin = isParticipantAdmin(senderId, groupMetadata);

        // 1. Delete the message
        const shouldDelete = senderIsAdmin ? guard.deleteAdminUrls : true;
        if (shouldDelete) {
            try {
                await sock.sendMessage(chatId, {
                    delete: { remoteJid: chatId, fromMe: false, id: msg.key.id, participant: senderId },
                });
                console.log(`🛡️ [URL GUARD] 🗑️ Message deleted.`);
            } catch (err) {
                console.log(`🛡️ [URL GUARD] ❌ Failed to delete: ${err.message}`);
            }
        }

        // 2. Decide on kick
        let shouldKick = senderIsAdmin ? guard.kickAdmins : guard.kickNonAdmins;
        const senderNum = jidToNumber(senderId);
        const botNum = jidToNumber(sock.user?.id || '');
        const ownerNum = String(config.ownerNumber || '');
        
        if (senderNum === botNum || senderNum === ownerNum) shouldKick = false;

        if (shouldKick) {
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                console.log(`🛡️ [URL GUARD] 👢 User kicked.`);
                if (guard.sendKickNotice) {
                    await sock.sendMessage(chatId, {
                        text: `${guard.noticeText || '⚠️ Links are not allowed.'}\n@${jidToNumber(senderId)} was removed.`,
                        mentions: [senderId],
                    });
                }
            } catch (err) {
                console.log(`🛡️ [URL GUARD] ❌ Failed to kick: ${err.message}`);
            }
        }
        return true;
    } catch (err) {
        logger.error(`urlGuard: unhandled error: ${err.stack || err.message}`);
        return false;
    }
}

module.exports = { handleUrlGuard, isParticipantAdmin };
