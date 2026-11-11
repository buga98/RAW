# RAW V5.30 — self-hosted MySQL / Node.js, Firebase retirement foundation

**Target:** ALL authoritative users, login sessions, studio bookings, projects and hardware authorization ultimately hosted by ONE studio computer. No fixed public IP required. The **new V5.30 server modules have no Firebase dependency**. Existing Electron frontend still uses Firebase until a separate tested migration; do not break or delete it prematurely.

## Architecture

- Windows studio PC: MySQL 8.4 LTS or MariaDB 11.x InnoDB on 127.0.0.1:3306, Node.js API on 127.0.0.1:7130, Studio Gateway/Audio Worker running locally (real hardware implementation still pending).
- Remote RAW clients: HTTPS API and WSS only, NEVER direct MySQL.
- Public entry: optional dynamic public IPv4 + Dynamic DNS + hardened HTTPS reverse proxy; if provider uses CGNAT, use an **outbound tunnel**. Existing VPS can host stable domain/TLS endpoint and encrypted tunnel to studio, but database/audio remain on studio machine. No fixed public studio IP needed.
- Do NOT expose ports 3306 or 7130 on the router or Internet. Offline studio PC means RAW unavailable; backups, UPS, monitoring and recovery are required.

## Implemented

- database/raw-v530-schema.sql: dedicated tables for users, opaque login sessions, studios, reservations and unique per-studio/15-min slots.
- raw-v530-password.mjs: Node memory-hard scrypt N=32768/r=8/p=3, salted; no plaintext passwords.
- raw-v530-local-auth.mjs: private login, 256-bit opaque bearer tokens, only SHA-256 token hashes in DB, 12h expiry, revocation, disabled-user rejection; no public self-registration.
- raw-v530-mysql-auth-store.mjs: parameterized SQL account/session backend.
- raw-v530-mysql-bookings.mjs: InnoDB studio-row lock + unique time slots; transaction prevents overlapping booking, atomic cancellation releases slots; no billing or hardware commands.
- raw-v530-selfhosted-api.mjs: private auth/login/me/logout and owner-protected booking endpoints, bearer auth and bounded input. No CORS wildcard and no auto-listener. In-process rate limit is not sufficient for the public Internet.
- scripts/raw-v530-create-owner.mjs: offline CLI for the *first* administrator only, hidden-password prompt and MySQL bootstrap lock.
- scripts/raw-v530-local-api.mjs: opt-in loopback-only staging HTTP server, blocked unless explicit RAW_V530_LOCAL_API=I_ACCEPT_LOOPBACK_ONLY.
- Tests: fake-MySQL concurrency, hashed passwords, token revocation and HTTP owner security. Does NOT require a live MySQL installation just to run tests.

## Run tests (no MySQL server required)

    npm run security:v530:check
    npm run security:v529:check
    npm run test:smoke

GitHub Actions runs Node tests on Windows and Ubuntu. Test doubles DO NOT validate real database locking; staging MySQL integration is a mandatory release gate.

## Fresh, isolated MySQL test DB only

A DBA with permission can create a fresh database and limited user in MySQL Workbench. Example (replace placeholder with a unique strong secret, and run in a private admin console):

    CREATE DATABASE raw_studio_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER 'raw_api'@'127.0.0.1' IDENTIFIED BY 'CHOOSE_A_NEW_LONG_RANDOM_PASSWORD';
    GRANT SELECT, INSERT, UPDATE, DELETE ON raw_studio_test.* TO 'raw_api'@'127.0.0.1';

Apply database/raw-v530-schema.sql with separate DBA/migration credentials. The application runtime account must not have DROP/ALTER/CREATE privileges. Keep credentials out of Git.

Optional Node driver for the local server: mysql2 version 3.24.6, install on a staging checkout with npm install mysql2@3.24.6 --save-exact. **Commit the updated package-lock.json together with package.json before any release.** The baseline Electron test suite remains dependency-locked and does not load mysql2 until the explicit local server CLI is invoked.

Staging environment variables (set privately on local studio PC):

    RAW_V530_LOCAL_API=I_ACCEPT_LOOPBACK_ONLY
    RAW_MYSQL_HOST=127.0.0.1
    RAW_MYSQL_USER=raw_api
    RAW_MYSQL_PASSWORD=[private strong password]
    RAW_MYSQL_DATABASE=raw_studio_test

With a fresh empty database, run an offline first-owner command:

    node scripts/raw-v530-create-owner.mjs owner@example.com

Enter password interactively (not via command arguments or environment). Provision a studio row via DB administrator. Then:

    npm run studio:selfhost:v530:local

The server listens only on 127.0.0.1:7130. Public access, TLS, a properly configured ingress, edge rate limits and audit are not yet enabled.

## Staged retirement of Firebase

1. Finish live MySQL staging and security/recovery, account invitation + password-reset + email verification, cross-client concurrency and owner isolation.
2. Build and acceptance-test new Electron login/client with own bearer token. Old Firebase login remains until tested migration is finished; existing users will need a secure migration/reset workflow. Do not assume Firebase passwords are recoverable in plaintext.
3. Migrate reservations, session calendar, projects and audio metadata in controlled steps, not historical credits/billing silently.
4. Only after verified user data migration remove all Firebase imports, scripts, Firestore writers and dependencies from index.html/main app, with full regression tests.

**NOT DONE:** Full Firebase removal from the existing Electron UI, live MySQL integration, TLS/public ingress, MFA/password reset/email verification, production monitoring, billing, physical gear ACK/readback, D/A→A/D capture, signed master delivery and root cause of past Windows HYPERVISOR_ERROR. This feature is a safe isolated foundation, not production-ready.

Previous user-confirmed V5.25–V5.29 PASS evidence is in docs/RAW_QA_ACCEPTANCE_2026-11-11.md. V5.30 awaits Windows/manual staging QA.
