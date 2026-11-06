import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeAudioFilename, safeFolderName } from '../upload-safety.mjs';

const source = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('upload folders reject traversal and malformed identifiers', () => {
  for (const value of ['..', '.', '../x', '..\\x', '/tmp', '', 'a/b', 'a\\b', 'a b', null]) {
    assert.throws(() => safeFolderName(value));
  }
  assert.equal(safeFolderName('test-123_ABC'), 'test-123_ABC');
});

test('audio filenames accept supported types and neutralize paths', () => {
  assert.equal(safeAudioFilename('track.wav'), 'track.wav');
  assert.equal(safeAudioFilename('C:\\music\\mix.AIFF'), 'mix.AIFF');
  assert.equal(safeAudioFilename('../../voice.mp3'), 'voice.mp3');
  for (const value of ['setup.exe', '.env', '..', 'track.wav.exe', '']) {
    assert.throws(() => safeAudioFilename(value));
  }
});

test('test launcher enables explicit local mode and never runs watchdog', () => {
  const launcher = source('launch-local-demo.mjs');
  assert.match(launcher, /RAW_TEST_MODE: "1"/);
  assert.doesNotMatch(launcher, /session-watchdog\.mjs/);
  assert.match(source('index.js'), /process\.env\.RAW_TEST_MODE === "1"/);
});

test('local test mode prevents billable/cloud session mutations', () => {
  const html = source('index.html');
  assert.match(html, /if \(TEST_MODE\) \{[\s\S]*?localTestSessions\.unshift/);
  assert.match(html, /async function chargeSessionFor\(sessionId\) \{\s*if \(TEST_MODE\) return;/);
  assert.match(html, /function startHeartbeat\(\) \{\s*if \(TEST_MODE\) return;/);
  // Simulated transports intercept LOCAL TEST controls before the isolated
  // TEST_MODE branch; that branch must return before the production socket.
  const start=html.indexOf("function sendControlMessage(message) {");
  const end=html.indexOf("\nconnectControlSocket();",start);
  assert.ok(start>=0&&end>start,"Send control function is present");
  const send=html.slice(start,end);
  assert.match(send,/if \(TEST_MODE && window\.RAWStudioGatewayV1\?\.interceptsControls\(\)\) return/);
  assert.match(send,/if \(TEST_MODE && window\.RAWStudioSim\?\.interceptsControls\(\)\) return/);
  assert.match(send,/if \(TEST_MODE\) \{[\s\S]*?window\.RAWDawBridge\?\.send\(message\);[\s\S]*?return;/);
  assert.ok(send.indexOf("if (TEST_MODE) {")<send.indexOf("controlSocket.send(JSON.stringify(payload))"),
    "LOCAL TEST branch returns before production socket dispatch");
  assert.match(html, /if \(!activeSessionId \|\| TEST_MODE\) return;/);
  assert.match(html, /LOCALNO|LOKALNO/);
});

test('development listeners bind to local loopback only', () => {
  assert.match(source('upload-server.mjs'), /app\.listen\(PORT, "127\.0\.0\.1"/);
  assert.match(source('control-server.mjs'), /host: "127\.0\.0\.1"/);
});
