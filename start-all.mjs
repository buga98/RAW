import { spawn } from "child_process";

const processes = [];

function startProcess(name, command, args = []) {
  console.log(`\nSTARTING ${name}...`);

  const child = spawn(command, args, {
    shell: true,
    stdio: "pipe"
  });

  child.stdout.on("data", data => {
    process.stdout.write(`[${name}] ${data}`);
  });

  child.stderr.on("data", data => {
    process.stderr.write(`[${name} ERROR] ${data}`);
  });

  child.on("exit", code => {
    console.log(`[${name}] exited with code ${code}`);
  });

  processes.push({
    name,
    child
  });

  return child;
}

startProcess("UPLOAD", "node", ["upload-server.mjs"]);
startProcess("CONTROL", "node", ["control-server.mjs"]);
// The legacy watchdog uses unauthenticated Firestore client writes and computes
// unbounded charges from old sessions. Never start it with developer services.
// A separately authenticated, idempotent server-side service is required for production.
console.log("\n[WATCHDOG] DISABLED in developer launcher (legacy billing unsafe).");
console.log("[WATCHDOG] For isolated UI testing use: npm run test:local");

// malo čekamo da se serveri dignu prije Electrona
setTimeout(() => {
  startProcess("APP", "npm", ["start"]);
}, 1200);

function shutdown() {
  console.log("\nShutting down RAW services...");

  for (const proc of processes) {
    try {
      proc.child.kill();
      console.log(`Stopped ${proc.name}`);
    } catch (err) {
      console.warn(`Could not stop ${proc.name}:`, err.message);
    }
  }

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);