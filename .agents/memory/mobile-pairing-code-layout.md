---
name: Mobile pairing code layout
description: Mobile viewport constraints for displaying WhatsApp pairing codes.
---

Pairing-code UI must keep the complete eight-character code visible as one non-wrapping line and keep the modal inside the mobile viewport with internal scrolling.

**Why:** A tall mobile modal clipped the first half of a valid code, so the user entered only the visible suffix and WhatsApp rejected it as an invalid code.

**How to apply:** Preserve the full code in the copy action and accessible label, avoid wide letter-spacing that causes wrapping, and use a viewport-bounded scroll container for the pairing modal.