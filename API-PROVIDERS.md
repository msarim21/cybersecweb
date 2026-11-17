# Public provider integration

Verified on 2026-11-17 with public, non-adult sample inputs.

| Provider | Verified functionality | Excluded or unavailable |
| --- | --- | --- |
| Kyio | `/api/ai/deepseek-r1?q=...` returned an actual AI reply | Documentation page intermittently Cloudflare-blocked |
| Omega | DeepSeek AI, Pinterest images, YouTube search, current weather | Kimi returned upstream 429; Qwen returned an empty reply |
| Nexray | Pinterest images, TikTok search and download, Wikipedia | ChatGPT returned an upgrade notice; DeepSeek returned 500 |
| Azbry | No verified endpoints | HTTP 403 Cloudflare challenge |
| FAA | No verified endpoints | HTTP 403 Cloudflare challenge |

## Commands

- `.apimenu`: list the provider commands.
- `.apistatus`: owner-only live checks of all five providers.
- `.kyioai <question>` / `.omegaai <question>`: provider-specific verified AI routes.
- `.ytfind <query>`: YouTube search links, not audio files.
- `.wikifind <topic>`: Wikipedia search results.
- `.weatherplus <city>`: current temperature, humidity and wind.
- `.pinterest <query>`: restored image search with Omega then Nexray fallback.
- `.tiktoksearch <query>`: restored keyword search using Nexray.
- `.tt <TikTok URL>` / `.tiktok <TikTok URL>`: Nexray first, previous download fallbacks retained.
- Existing AI commands and chatbot use Kyio then Omega before legacy fallbacks.
- `.checkapis` includes the new providers' response-validated checks.

## Railway settings

All five base URLs have defaults and can be overridden by their supplied `*_API_BASE` environment variables. `EXTRA_PROVIDERS=false` disables the extra automatic AI/Pinterest fallback, not explicitly requested provider commands. No key is required for the endpoints enabled here. Azbry/FAA remain diagnostic-only until documented requests can be verified.

Requests are sequential fallback, not parallel AI racing: this avoids sending each user's message to multiple third parties unnecessarily. Don't send private information to public AI providers. Requests have timeouts; HTTP 200 without a usable answer is rejected. Public APIs and media links may expire or rate-limit at any time.

## Verification

Run `node --test scripts/test-public-providers.js` plus the existing `npm test`. Live requests validated answers/results and sample Pinterest/TikTok media bytes. WhatsApp delivery and Railway egress still require testing on the user's linked bot; a local test is not a hosted deployment verification.