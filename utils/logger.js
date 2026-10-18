const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'bot.log');

function timestamp() {
    return new Date().toISOString();
}

function writeLine(level, message) {
    const line = `[${timestamp()}] [${level}] ${message}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch (_) {
        // Silent fail on log write errors
    }
    if (level === 'ERROR') {
        console.error(line.trim());
    } else {
        console.log(line.trim());
    }
}

function redact(str) {
    return String(str).replace(
        /(sk-|gsk_|AIza|xai-)[A-Za-z0-9_\-]{8,}/g,
        '[REDACTED_KEY]'
    );
}

const logger = {
    info: (msg) => writeLine('INFO', redact(msg)),
    warn: (msg) => writeLine('WARN', redact(msg)),
    error: (msg) => writeLine('ERROR', redact(msg)),
    debug: (msg) => writeLine('DEBUG', redact(msg)),
};

module.exports = logger;
