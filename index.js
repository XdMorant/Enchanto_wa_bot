const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const logger = require('./utils/logger');
const { loadConfig } = require('./utils/helpers');
const { handleUrlGuard } = require('./handlers/urlGuard');
const { handleDmAutoReply, pauseChat } = require('./handlers/chatbot'); // Added pauseChat
const { handleCommand } = require('./handlers/commands');

const state = { startTime: Date.now() };

async function startBot() {
    let config = loadConfig();
    const { state: authState, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: authState,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        generateHighQualityLinkPreview: true,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr && !sock.authState.creds.registered) {
            try {
                const code = await sock.requestPairingCode(config.ownerNumber);
                console.log(`\nYOUR PAIRING CODE: ${code}\n`);
            } catch (err) { qrcode.generate(qr, { small: true }); }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 515) { startBot(); return; }
            if (statusCode !== DisconnectReason.loggedOut) setTimeout(startBot, 5000);
        } else if (connection === 'open') {
            console.log('\n✅ Bot successfully connected to WhatsApp!\n');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (!msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const chatId = msg.key.remoteJid;

        // === AUTOMATED PAUSE SWITCH ===
        // If the message is from YOU (the owner) and it's a DM (not a group, not a command)
        if (msg.key.fromMe && !chatId.endsWith('@g.us') && !text.startsWith('.')) {
            console.log(`🛑 [AUTO-PAUSE] You replied to ${chatId}. Bot will sleep here for 2 hours.`);
            pauseChat(chatId); // Tell the chatbot to sleep in this chat
            return; // Stop processing, let your manual message go through
        }

        // Block bot's own replies to prevent infinite loops
        if (msg.key.fromMe && !text.startsWith('.')) {
            return; 
        }

        try {
            const currentConfig = loadConfig();

            const urlActed = await handleUrlGuard(sock, msg, currentConfig);
            if (urlActed) return; 

            const cmdActed = await handleCommand(sock, msg, currentConfig, state);
            if (cmdActed) return; 

            await handleDmAutoReply(sock, msg, currentConfig);

        } catch (err) {
            console.error(`\n❌ [FATAL ROUTING ERROR]: ${err.message}\n`);
        }
    });
}

startBot();
