/* RAW Desktop Private Beta bootstrap.
 * Fail CLOSED to LOCAL TEST regardless of environment on installers.
 * Absolutely no production control, real user billing or unsafe gateway.
 */
"use strict";
process.env.RAW_TEST_MODE="1";
// Match the installer shortcut AppUserModelID with the running taskbar process.
process.env.RAW_DESKTOP_BETA="1";
require("./app/index.js");
