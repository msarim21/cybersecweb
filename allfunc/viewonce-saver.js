/**
 * ============================================
 * VIEW-ONCE MEDIA SAVER — v3
 *
 * Kaam kaise karta hai:
 *   - Koi bhi group/chat mein photo/video/audio/voice aaye
 *     → Bot silently store karta hai (24 ghante tak)
 *   - Sirf REGISTERED user (jo /start kar chuka ho) emoji reply kare
 *     → SIRF US USER ke apne DM mein woh media save hoti hai
 *   - Koi unregistered user emoji reply kare → BILKUL KUCH NAHI HOGA
 *   - Group mein koi message, koi notice — zero activity
 *
 * Usage in bot.js:
 *   const { initViewOnceSaver, registerBotUser } = require('./allfunc/viewonce-saver');
 *
 *   // /start handler mein (ek baar call karo):
 *   registerBotUser(msg.from.id);
 *
 *   // Bot start pe:
 *   initViewOnceSaver(bot);
 * ============================================
 */

const fs   = require('fs');
const path = require('path');

// Registered users file — bot restart ke baad bhi yaad rahe
const USERS_FILE = path.join(__dirname, '..', 'axis_storage', 'viewonce_users.json');

// Memory cache (fast lookup)
let registeredUsers = new Set();

/** File se registered users load karo (startup pe) */
function loadRegisteredUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            registeredUsers = new Set(data);
            console.log(`[ViewOnceSaver] 📂 ${registeredUsers.size} registered users loaded`);
        }
    } catch (e) {
        console.log('[ViewOnceSaver] ⚠️ Could not load users file, starting fresh');
        registeredUsers = new Set();
    }
}

/** File mein save karo */
function saveRegisteredUsers() {
    try {
        const dir = path.dirname(USERS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(USERS_FILE, JSON.stringify([...registeredUsers]), 'utf8');
    } catch (e) {
        console.log('[ViewOnceSaver] ⚠️ Could not save users file:', e.message);
    }
}

/**
 * User ko register karo — /start handler mein call karo
 * Bot restart ke baad bhi registered rahega (file mein save hota hai)
 * @param {number|string} userId
 */
function registerBotUser(userId) {
    const id = String(userId);
    if (!registeredUsers.has(id)) {
        registeredUsers.add(id);
        saveRegisteredUsers();
    }
}

// ── Media store: "chatId_messageId" → { fileId, mediaType } ────────────────
const viewOnceStore = new Map();
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 ghante

/**
 * Check: kya text sirf ek ya zyada emoji hai?
 */
function isOnlyEmoji(text) {
    if (!text || text.trim().length === 0) return false;
    const t = text.trim();

    // Unicode emoji property check
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
    if (emojiRegex.test(t)) return true;

    // Broad fallback
    const fallback = /^(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{3030}]|[\u{2B50}]|[\u{2B55}]|[\u{231A}-\u{231B}]|[\u{24C2}]|[\u{1F201}-\u{1F251}]|[\u00A9]|[\u00AE]|[\u203C]|[\u2049]|[\u20E3]|[\uFE0F\u200D]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF])+$/u;
    return fallback.test(t);
}

/**
 * Sirf replying user ke DM mein media bhejo
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

    // Startup pe file se users load karo
    loadRegisteredUsers();

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

    // ── PART 2: Emoji reply detect karo ────────────────────────────────────
    bot.on('message', async (msg) => {
        // Sirf reply messages
        if (!msg.reply_to_message) return;

        // Sirf emoji wali reply
        if (!msg.text || !isOnlyEmoji(msg.text)) return;

        const replyingUserId = String(msg.from.id);

        // ✅ KEY CHECK: Sirf registered users — koi aur ho to BILKUL KUCH NAHI
        if (!registeredUsers.has(replyingUserId)) return;

        const key = `${msg.chat.id}_${msg.reply_to_message.message_id}`;
        const stored = viewOnceStore.get(key);

        // Stored media nahi mili — skip
        if (!stored) return;

        const { fileId, mediaType } = stored;

        try {
            // ✅ SIRF IS USER KE DM MEIN — jo abhi reply kiya usi ka
            await sendSilentlyToDM(bot, msg.from.id, fileId, mediaType);
            console.log(`[ViewOnceSaver] ✅ ${mediaType} → user ${msg.from.id} ke DM mein save`);
        } catch (err) {
            console.log(`[ViewOnceSaver] ℹ️ ${msg.from.id} ko send nahi hua: ${err?.message}`);
        }
    });

    console.log('✅ [ViewOnceSaver] Active — sirf /start karne wale users ka emoji reply kaam karega');
}

module.exports = { initViewOnceSaver, registerBotUser };
