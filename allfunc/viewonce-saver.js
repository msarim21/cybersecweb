/**
 * ============================================
 * VIEW-ONCE MEDIA SAVER
 *
 * Kaam kaise karta hai:
 *   - Koi bhi group/chat mein photo/video/audio/voice aaye
 *     → Bot silently store karta hai
 *   - Koi bhi BOT USER (jis ne /start kiya ho) emoji se reply kare
 *     → Sirf US USER ke apne DM mein media save hoti hai
 *   - Koi aur / un-registered user reply kare → kuch nahi hota
 *   - Group mein koi message, koi notice, bilkul kuch nahi
 *
 * Usage in bot.js:
 *   const { initViewOnceSaver } = require('./allfunc/viewonce-saver');
 *   initViewOnceSaver(bot);
 * ============================================
 */

// Memory store: "chatId_messageId" → { fileId, mediaType }
const viewOnceStore = new Map();

// 24 ghante baad auto delete
const EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Check: kya text sirf emoji hai?
 */
function isOnlyEmoji(text) {
    if (!text || text.trim().length === 0) return false;
    const t = text.trim();
    const emojiRegex = /^(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{231A}-\u{231B}]|[\u{24C2}]|[\u{1F201}-\u{1F251}]|[\u00A9]|[\u00AE]|[\u203C]|[\u2049]|[\u20E3]|[\uFE0F\u200D]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF])+$/u;
    return emojiRegex.test(t);
}

/**
 * User ke DM mein silently media bhejo
 * (seedha send — "Forwarded from" tag nahi aayega)
 */
async function sendSilentlyToDM(bot, userId, fileId, mediaType) {
    switch (mediaType) {
        case 'photo':      return bot.sendPhoto(userId, fileId);
        case 'video':      return bot.sendVideo(userId, fileId);
        case 'audio':      return bot.sendAudio(userId, fileId);
        case 'voice':      return bot.sendVoice(userId, fileId);
        case 'video_note': return bot.sendVideoNote(userId, fileId);
        case 'document':   return bot.sendDocument(userId, fileId);
        default:           return null;
    }
}

/**
 * Main init function
 * @param {object} bot - TelegramBot instance
 */
function initViewOnceSaver(bot) {

    // ── PART 1: Har media message silently store karo ─────────────────────
    bot.on('message', async (msg) => {
        let fileId = null;
        let mediaType = null;

        if (msg.photo && msg.photo.length > 0) {
            fileId = msg.photo[msg.photo.length - 1].file_id;
            mediaType = 'photo';
        } else if (msg.video) {
            fileId = msg.video.file_id;
            mediaType = 'video';
        } else if (msg.audio) {
            fileId = msg.audio.file_id;
            mediaType = 'audio';
        } else if (msg.voice) {
            fileId = msg.voice.file_id;
            mediaType = 'voice';
        } else if (msg.video_note) {
            fileId = msg.video_note.file_id;
            mediaType = 'video_note';
        } else if (msg.document) {
            fileId = msg.document.file_id;
            mediaType = 'document';
        }

        if (!fileId) return;

        const key = `${msg.chat.id}_${msg.message_id}`;
        viewOnceStore.set(key, { fileId, mediaType });

        // 24 ghante baad memory se hata do
        setTimeout(() => viewOnceStore.delete(key), EXPIRY_MS);
    });

    // ── PART 2: Emoji reply detect karo → sirf us user ke DM mein bhejo ──
    bot.on('message', async (msg) => {
        // Sirf reply messages
        if (!msg.reply_to_message) return;

        // Sirf emoji wali reply
        if (!msg.text || !isOnlyEmoji(msg.text)) return;

        const key = `${msg.chat.id}_${msg.reply_to_message.message_id}`;
        const stored = viewOnceStore.get(key);

        // Agar yeh koi stored media nahi — skip
        if (!stored) return;

        const userId = msg.from.id;
        const { fileId, mediaType } = stored;

        try {
            // ✅ Sirf IS user ke DM mein — bilkul silent
            // Telegram khud check karta hai: agar user ne /start kiya hai to deliver hogi
            // Agar nahi kiya to silently fail — group mein kuch nahi jaayega
            await sendSilentlyToDM(bot, userId, fileId, mediaType);
            console.log(`[ViewOnceSaver] ✅ ${mediaType} saved to user ${userId}`);
        } catch (err) {
            // Koi bhi error — group bilkul silent rahe
            console.log(`[ViewOnceSaver] Silent fail for ${userId}: ${err?.message}`);
        }
    });

    console.log('✅ [ViewOnceSaver] Active — any bot user can save via emoji reply');
}

module.exports = { initViewOnceSaver };
