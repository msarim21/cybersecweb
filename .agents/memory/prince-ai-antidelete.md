---
name: PrinceTech AI and antidelete behavior
description: Provider and WhatsApp-client constraints discovered while integrating PrinceTech AI, TTS, and media recovery.
---

PrinceTech's OpenAI route is the reliable text-AI route for the current bot; Gemini/DeepSeek aliases should use the shared adapter and treat nested `{ error }` responses as failures. TTS returns valid audio/mpeg. WhatsApp linked/self-chat clients may render native list payloads as plain text, so numbered reply selection is the dependable fallback. Media keys may arrive as Uint8Array/ArrayBuffer and PTV media must be downloaded as video.

**Why:** Live endpoint and client behavior differed from the nominal API/message shapes, causing false AI success responses, invisible voice choices, and missing deleted media.

**How to apply:** Keep all text-AI commands on the shared adapter, validate nested API errors, and prefer numbered interaction for selection flows where linked/self-chat compatibility matters.