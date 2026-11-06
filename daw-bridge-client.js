// RAW DAW Bridge client — explicitly LOCAL TEST MODE only.
// No Firebase, no remote server and no hardware action unless user starts bridge with --midi.
(() => {
  "use strict";
  let socket = null;
  let labActive = false;
  let labOwned = false;
  let seq = 0;
  let lastSentAt = 0;
  let latestStatus = "OFFLINE";
  let latestMessage = "Start: npm run bridge:dry; zatim klikni CONNECT.";
  const WS_URL = "ws://127.0.0.1:7073";

  function ui() {
    const indicator = document.getElementById("rawBridgeStatus");
    const details = document.getElementById("rawBridgeDetails");
    const button = document.getElementById("rawBridgeConnect");
    if (indicator) indicator.textContent = latestStatus;
    if (details) details.textContent = latestMessage;
    if (button) button.textContent = socket && socket.readyState <= 1 ? "DISCONNECT" : "CONNECT";
  }
  function status(label, message) {
    latestStatus = label;
    latestMessage = message;
    ui();
  }
  function disconnect() {
    const old = socket;
    socket = null;
    labActive = false;
    labOwned = false;
    if (old) old.close();
    status("OFFLINE", "Bridge disconnected (RAW local test mode).");
  }
  function connect() {
    if (new URLSearchParams(window.location.search).get("testMode") !== "1") return;
    if (socket && socket.readyState <= 1) return disconnect();
    status("CONNECTING", WS_URL);
    try {
      const current = new WebSocket(WS_URL);
      socket = current;
      labActive = false;
      labOwned = false;
      current.onopen = () => {
        if (socket !== current) return;
        status("CONNECTED", "Čekam status DAW Bridge servera…");
      };
      current.onmessage = event => {
        if (socket !== current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "bridge-status") {
            labActive = msg.lab === true;
            if (labActive) {
              current.send(JSON.stringify({type:"studio-claim"}));
              status("CLAIMING", "Preuzimam slobodni studio (testni saldo, bez naplate)...");
              return;
            }
            status(msg.mode === "midi" ? "MIDI OUT" : "DRY RUN",
              msg.mode === "midi"
                ? "MIDI izlaz " + msg.port + " · CC21 → Cubase QC1 (nije potvrda Cubasea)"
                : "Simulacija MIDI CC; Cubase i hardver nisu upravljani.");
          } else if (msg.type === "studio-state") {
            labOwned = msg.owner === true;
            if (labOwned) {
              status("STUDIO YOURS", "EKSKLUZIVNO · TEST " +
                (msg.balanceCents / 100).toFixed(2) + " EUR · " +
                (msg.rateCentsPerMin / 100).toFixed(2) + " EUR/min · " +
                msg.devices.join(", "));
            } else {
              status(msg.status === "occupied" ? "OCCUPIED" :
                msg.status === "credits-exhausted" ? "NO TEST CREDIT" : "FREE",
                msg.status === "occupied" ? "Studio koristi drugi klijent. Upravljanje blokirano." :
                  msg.status === "credits-exhausted" ? "Testni saldo potrošen. Nema MIDI komandi." :
                  "Studio slobodan. Klikni DISCONNECT pa CONNECT za pokušaj preuzimanja.");
            }
          } else if (msg.type === "studio-denied") {
            labOwned = false;
            status("OCCUPIED", msg.reason || "Studio occupied");
          } else if (msg.type === "studio-expired") {
            labOwned = false;
            status("EXPIRED", "Testni saldo potrošen. Obrada i MIDI komande zaustavljeni.");
          } else if (msg.type === "parameter-ack") {
            const cc = msg.midi;
            status(msg.status === "midi-sent" ? "MIDI SENT" : "SIMULATED",
              "EQ1 Gain " + cc.originalValue + " dB → MIDI CC" + cc.cc +
              " vrijednost " + cc.value + " · " + msg.status);
          } else if (msg.type === "parameter-error") {
            status("REJECTED", msg.error || "Bridge rejected command");
          }
        } catch (error) { status("ERROR", error.message); }
      };
      current.onerror = () => {
        if (socket === current) status("ERROR", "Bridge nije dostupan: pokreni npm run bridge:dry.");
      };
      current.onclose = event => {
        if (socket !== current) return;
        socket = null;
        labActive = false;
        labOwned = false;
        const reason = event.reason ? " · " + event.reason : "";
        status("OFFLINE", "Bridge connection closed (WebSocket code " + event.code + ")" + reason +
          ". Provjeri DAW Bridge terminal. 1006 obično znači odbijenu vezu ili nedostupan server.");
      };
    } catch (error) { status("ERROR", error.message); }
  }
  function send(message) {
    if (new URLSearchParams(window.location.search).get("testMode") !== "1") return;
    // First milestone deliberately sends only one knob, no hardware settings.
    if (message?.type !== "parameter-change" ||
        message.deviceId !== "bettermaker_eq" || message.parameter !== "eq1Gain") return;
    if (labActive && !labOwned) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      // Demo EQ still operates locally, irrespective of bridge status.
      return;
    }
    const sessionId = window.RAWBridgeTestSessionId?.();
    if (!sessionId) return;
    // Rate-limit a dragged knob so we don't flood the native MIDI port.
    if (Date.now() - lastSentAt < 30) return;
    lastSentAt = Date.now();
    socket.send(JSON.stringify({
      type: "parameter-change",
      requestId: "raw-" + (++seq),
      sessionId,
      deviceId: message.deviceId,
      parameter: message.parameter,
      value: message.value
    }));
  }
  window.RAWDawBridge = { connect, disconnect, send, refresh:ui,
    isActive:()=>!!socket&&socket.readyState===WebSocket.OPEN };
})();
