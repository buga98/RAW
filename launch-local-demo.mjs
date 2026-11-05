// Cross-platform local test launcher. Starts only Electron; never starts the watchdog.
import { spawn } from "node:child_process";
const command = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(command, ["start"], {
  env: { ...process.env, RAW_TEST_MODE: "1" },
  stdio: "inherit",
  shell: process.platform === "win32"
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
child.on("error", (err) => { console.error(err); process.exitCode = 1; });
