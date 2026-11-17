<!-- AGENT-MEMORY:BEGIN -->
- Keep public provider requests and response validation in `allfunc/public-providers.js`, with new command dispatch in `allfunc/provider-commands.js`, so existing handlers share consistent fallbacks without further enlarging the command switch.
- Enable only documented endpoints with usable response validation; HTTP 200 alone does not prove functionality because providers may return empty replies or upgrade notices.
<!-- AGENT-MEMORY:END -->