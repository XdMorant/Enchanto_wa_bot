const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const http = require('http');

const logger = require('./utils/logger');
const { loadConfig } = require('./utils/helpers');
const { handleUrlGuard } = require('./handlers/urlGuard');
const { handleDmAutoReply, pauseChat } = require('./handlers/chatbot');
const { handleCommand } = require('./handlers/commands');

const state = { startTime: Date.now() };

// 🌐 DUMMY WEB SERVER (Keep-alive for Koyeb/Render)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 Enchanto WhatsApp Bot is Online and Running!\n');
}).listen(PORT, () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
});

// 🤖 WHATSAPP BOT LOGIC
async function startBot() {
    let config = loadConfig();

    // 🛡️ KOYEB / CLOUD SECRET OVERRIDE
    // If the cloud provides the key via environment variable, use it!
    if (process.env.GROQ_API_KEY) {
        config.ai.apiKey = process.env.GROQ_API_KEY;
        console.log('🔑 API Key loaded from Environment Variables.');
    }

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
                console.log(`\n=============================================`);
                console.log(`YOUR PAIRING CODE: ${code}`);
                console.log(`=============================================\n`);
            } catch (err) { 
                qrcode.generate(qr, { small: true }); 
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 515) { startBot(); return; }
            if (statusCode !== DisconnectReason.loggedOut) {
                setTimeout(startBot, 5000);
            } else {
                console.log('🛑 LOGGED OUT. You must delete auth_info and pair again.');
                process.exit(1);
            }
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

        // Auto-pause: If owner replies manually in a DM
        if (msg.key.fromMe && !chatId.endsWith('@g.us') && !text.startsWith('.')) {
            console.log(`🛑 [AUTO-PAUSE] You replied to ${chatId}. Bot will sleep here for 2 hours.`);
            pauseChat(chatId); 
            return; 
        }

        // Block bot's own replies
        if (msg.key.fromMe && !text.startsWith('.')) return; 

        try {
            const currentConfig = loadConfig();

            // Re-apply environment variable just in case it reloaded from disk
            if (process.env.GROQ_API_KEY) {
                currentConfig.ai.apiKey = process.env.GROQ_API_KEY;
            }

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
