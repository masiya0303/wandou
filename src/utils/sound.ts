// ============================================================
// wandou v1.0 — 微交互音效（Web Audio API）
// ============================================================
let ctx: AudioContext | null = null
function ac(): AudioContext { if (!ctx) ctx = new AudioContext(); return ctx }

function beep(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08) {
  try {
    const a = ac(); const o = a.createOscillator(); const g = a.createGain()
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur)
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur)
  } catch {}
}

export const sound = {
  click() { beep(800, 0.06, 'square', 0.04) },
  send() { beep(600, 0.1, 'sine', 0.06); setTimeout(() => beep(1000, 0.08, 'sine', 0.05), 80) },
  receive() { beep(400, 0.15, 'triangle', 0.05); setTimeout(() => beep(700, 0.12, 'triangle', 0.04), 100) },
  error() { beep(200, 0.2, 'sawtooth', 0.06) },
  save() { beep(1200, 0.05, 'sine', 0.04) },
  toggle() { beep(500, 0.04, 'square', 0.03) },
}
