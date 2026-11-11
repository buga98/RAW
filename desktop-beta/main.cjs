/* RAW Desktop Private Beta bootstrap.
 * Fail CLOSED to LOCAL TEST regardless of environment on installers.
 * Absolutely no production control, real user billing or unsafe gateway.
 */
"use strict";
process.env.RAW_TEST_MODE="1";
require("./app/index.js");
