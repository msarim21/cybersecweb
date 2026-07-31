# CybersecPro Security Threat Model

## Scope

This document covers the Node.js/Express API, React dashboard, PostgreSQL or
MongoDB persistence, WhatsApp pairing/session workers, and optional Telegram
integration.

## Assets

- User credentials, password hashes, JWT signing secret, OAuth credentials, and
  bot tokens.
- WhatsApp authentication state and pairing credentials.
- User profile, linked-number, subscription, admin, and audit-log data.
- Uploaded audio and any media stored by the application.
- Admin privileges and deployment configuration.

## Trust Boundaries

- Browser/client to Express API: all client input and bearer tokens are
  untrusted.
- Express API to database: queries must remain parameterized and responses must
  be scoped to the authenticated user.
- Express API to WhatsApp, Telegram, Google, and other external services:
  secrets stay server-side and outbound calls require bounded inputs/timeouts.
- Authenticated user to administrator: admin authorization must be checked on
  every admin route, server-side.
- Source repository to deployment: runtime secrets and session state must come
  from managed environment storage, not Git.

## Key Threats and Required Guarantees

### Spoofing and elevation of privilege

- JWT signing must use a required, high-entropy secret of at least 32
  characters; no default fallback is acceptable.
- Every protected route must verify the token, load the current user, reject
  banned users, and enforce admin role checks server-side.
- Login and signup need bounded rate limits and generic authentication errors.

### Tampering and injection

- Validate request bodies, query parameters, and route identifiers at the
  server boundary.
- Use parameterized database queries and reject unexpected object-shaped input
  where a scalar is expected.
- Uploaded files require size/type validation and should be processed without
  trusting the original filename or MIME type alone.

### Information disclosure

- Never return passwords, access codes, bearer tokens, WhatsApp credentials, or
  database connection strings in API responses or logs.
- Runtime JSON state, auth files, pairing directories, and operator lists must
  be ignored by Git and supplied through secure storage or deployment volumes.
- Production errors return generic messages; detailed diagnostics stay out of
  client responses.

### Denial of service

- Apply global, auth, and admin rate limits; keep request body and upload
  limits bounded.
- Bound outbound requests and media processing, and handle SIGTERM gracefully.
- Avoid unbounded in-memory stores and repeated retry loops.

### Unsafe legacy capability

- Credential-capture pages, covert browser/device/camera tracking, SIM/PII
  lookup, SMS flooding, and spam-pairing are not acceptable production
  features. Their modules are not mounted and their old paths return 410.

## Operational Requirements

- Rotate any secret that has ever been committed, including JWT, bot, OAuth,
  startup, database, and WhatsApp session credentials.
- Enable GitHub secret scanning, dependency update alerts, branch protection,
  required reviews, and deployment environment approvals.
- Run dependency audit, SAST, and privacy/dataflow scans on every pull request.
- Keep production database backups, monitoring, alerting, and tested restore
  procedures outside the application process.

## Scan Anchors

- Public API entrypoint: `server/index.js`
- Authentication boundary: `server/middleware/auth.js`, `server/routes/auth.js`
- Admin boundary: `server/routes/admin.js`
- Pairing/session boundary: `server/routes/pairing.js`, `session-db.js`
- Runtime state that must never be committed: `auth.json`, `database/*.json`,
  `axis_storage/*.json`, `allfunc/owner.json`, `nexstore/pairing/`