web: WEB_API_ONLY=1 WHATSAPP_HOST_DYNO=worker node --max-old-space-size=256 server/index.js
worker: WHATSAPP_WORKER=1 WHATSAPP_HOST_DYNO=worker BOT_ISOLATION=1 node --max-old-space-size=512 worker.js
