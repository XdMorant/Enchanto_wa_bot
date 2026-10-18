// Detects URLs in message text.
// Covers: http/https, wa.me, t.me, www., bare domains with common TLDs.
// Tweak the TLD list or add patterns if you want to catch more.

const URL_REGEX = new RegExp(
    [
        // http(s):// and ftp:// links
        '\\b(?:https?:\\/\\/|ftp:\\/\\/)\\S+',
        // wa.me / t.me / chat.whatsapp.com style links
        '\\b(?:wa\\.me|t\\.me|telegram\\.me|chat\\.whatsapp\\.com)\\/\\S+',
        // www. links
        '\\bwww\\.\\S+',
        // bare domains with common TLDs
        '\\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.(?:com|net|org|io|co|me|ly|gg|tv|app|dev|xyz|info|biz|online|site|shop|store|link|click|ru|cn|uk|us|de|fr|ng|gh|ke|za)(?:\\/\\S*)?',
    ].join('|'),
    'i'
);

function containsUrl(text) {
    if (typeof text !== 'string' || !text) return false;
    URL_REGEX.lastIndex = 0;
    return URL_REGEX.test(text);
}

function extractUrls(text) {
    if (typeof text !== 'string' || !text) return [];
    URL_REGEX.lastIndex = 0;
    return text.match(URL_REGEX) || [];
}

module.exports = { containsUrl, extractUrls, URL_REGEX };
