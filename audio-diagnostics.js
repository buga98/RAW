/* RAW Audio Diagnostics — Web Audio demo only (never hardware metering). */
(() => {
  "use strict";
  let input = null;
  let output = null;
  let frame = 0;
  let last = 0;
  const FFT_SIZE = 2048;
  const maxDb = -3;
  const minDb = -90;

  function rmsDb(analyser) {
    if (!analyser) return null;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    return rms > 0 ? 20 * Math.log10(rms) : -120;
  }
  function displayDb(db) {
    return db == null ? "— dBFS" : db < -90 ? "−∞ dBFS" : db.toFixed(1) + " dBFS";
  }
  function drawSpectrum(canvas, before, after, sampleRate) {
    if (!canvas) return;
    const width = Math.max(300, canvas.clientWidth || 500);
    const height = Math.max(80, canvas.clientHeight || 110);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.11)";
    ctx.lineWidth = 1;
    for (let n = 1; n < 4; n++) {
      const y = height * n / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    if (!before || !after) return;
    const first = new Float32Array(before.frequencyBinCount);
    const second = new Float32Array(after.frequencyBinCount);
    before.getFloatFrequencyData(first);
    after.getFloatFrequencyData(second);
    function trace(values, color) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      const binsPerHz = (FFT_SIZE / sampleRate);
      for (let x = 0; x < width; x += 2) {
        const freq = 20 * Math.pow(20000 / 20, x / (width - 1));
        const index = Math.min(values.length - 1, Math.max(0, Math.round(freq * binsPerHz)));
        const value = Math.max(minDb, Math.min(maxDb, values[index]));
        const y = (maxDb - value) / (maxDb - minDb) * height;
        if (!x) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    trace(first, "#97a6b9");
    trace(second, "#41edbf");
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (now - last < 95) return; // max ~10 updates/s
    last = now;
    const beforeDb = rmsDb(input);
    const afterDb = rmsDb(output);
    const beforeLabel = document.getElementById("diagInput");
    const afterLabel = document.getElementById("diagOutput");
    const deltaLabel = document.getElementById("diagDelta");
    if (beforeLabel) beforeLabel.textContent = displayDb(beforeDb);
    if (afterLabel) afterLabel.textContent = displayDb(afterDb);
    if (deltaLabel) deltaLabel.textContent = beforeDb != null && afterDb != null &&
      beforeDb > -90 && afterDb > -90
      ? (afterDb - beforeDb >= 0 ? "+" : "") + (afterDb - beforeDb).toFixed(1) + " dB"
      : "—";
    const details = document.getElementById("rawDiagnosticsDetails");
    if (details && !details.hidden) {
      drawSpectrum(document.getElementById("diagSpectrum"), input, output,
        input?.context.sampleRate || 48000);
    }
  }

  function start() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  async function sineMeasure(gainDb) {
    const rate = 48000;
    const context = new OfflineAudioContext(1, rate, rate * 2);
    const source = context.createOscillator();
    source.type = "sine";
    source.frequency.value = 1000;
    const amp = context.createGain();
    amp.gain.value = 0.12;
    const eq = context.createBiquadFilter();
    eq.type = "peaking";
    eq.frequency.value = 1000;
    eq.Q.value = 1.2;
    eq.gain.value = gainDb;
    source.connect(amp).connect(eq).connect(context.destination);
    source.start(0);
    source.stop(1.95);
    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    let energy = 0;
    const startSample = Math.floor(rate * 0.25);
    const endSample = Math.floor(rate * 1.7);
    for (let i = startSample; i < endSample; i++) {
      energy += samples[i] * samples[i];
    }
    return Math.sqrt(energy / (endSample - startSample));
  }

  async function runOfflineTest() {
    const result = document.getElementById("diagTestResult");
    if (!result) return;
    result.textContent = "Mjerenje 1 kHz signala u tijeku…";
    try {
      const [reference, boost, cut] = await Promise.all([
        sineMeasure(0), sineMeasure(6), sineMeasure(-6)
      ]);
      const boostDb = 20 * Math.log10(boost / reference);
      const cutDb = 20 * Math.log10(cut / reference);
      const ok = Math.abs(boostDb - 6) <= 0.6 && Math.abs(cutDb + 6) <= 0.6;
      result.textContent = (ok ? "PASS" : "FAIL") +
        " · EQ +6 dB → " + boostDb.toFixed(2) + " dB; EQ −6 dB → " +
        cutDb.toFixed(2) + " dB (1 kHz, OfflineAudioContext).";
      result.dataset.state = ok ? "pass" : "fail";
    } catch (error) {
      result.dataset.state = "fail";
      result.textContent = "TEST ERROR: " + error.message;
    }
  }

  function attach(before, after) {
    input = before;
    output = after;
    start();
  }

  function detach() {
    input = null;
    output = null;
  }

  window.RAWAudioDiagnostics = { attach, detach, runOfflineTest };
})();
