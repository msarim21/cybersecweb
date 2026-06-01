/**
 * ============================================
 * VIEW-ONCE MEDIA SAVER — v2 FIXED
 *
 * Kaam kaise karta hai:
 *   - Koi bhi group/chat mein photo/video/audio/voice aaye
 *     → Bot silently store karta hai (24 ghante tak)
 *   - Koi bhi user us media ke neeche emoji se reply kare
 *     → SIRF US USER ke apne DM mein woh media save hoti hai
 *   - Kisi aur ke DM mein kabhi nahi jaata
 *   - Group mein koi message, koi notice — bilkul kuch nahi
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

    // Common single emojis (❤️ 👍 😂 etc)
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
    if (emojiRegex.test(t)) return true;

    // Fallback: pehle wali strict regex bhi check karo
    const fallback = /^(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{231A}-\u{231B}]|[\u{24C2}]|[\u{1F201}-\u{1F251}]|[\u00A9]|[\u00AE]|[\u203C]|[\u2049]|[\u20E3]|[\uFE0F\u200D]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF])+$/u;
    return fallback.test(t);
}

/**
 * SIRF IS USER ke DM mein media bhejo jo emoji reply kiya
 * @param {object} bot
 * @param {number} userId  ← sirf replying user ka ID
 * @param {string} fileId
 * @param {string} mediaType
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

        // Agar stored media nahi mili — skip
        if (!stored) return;

        // ✅ SIRF IS USER KA ID — jo abhi emoji reply kiya usi ka
        // Kisi aur ke DM mein KABHI nahi jaayega
        const { fileId, mediaType } = stored;
        const replyingUserId = msg.from.id;

        try {
            await sendSilentlyToDM(bot, replyingUserId, fileId, mediaType);
            console.log(`[ViewOnceSaver] ✅ ${mediaType} → user ${replyingUserId} ke DM mein save`);
        } catch (err) {
            // Agar user ne bot ko /start nahi kiya to silently fail
            // Group mein bilkul kuch nahi dikhega
            console.log(`[ViewOnceSaver] ℹ️ User ${replyingUserId} ko send nahi hua: ${err?.message}`);
        }
    });

    console.log('✅ [ViewOnceSaver] Active — emoji reply karo, sirf apne DM mein save ho');
}

module.exports = { initViewOnceSaver };
