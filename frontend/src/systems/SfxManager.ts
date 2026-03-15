let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function playTone(
  freq: number, duration: number, type: OscillatorType,
  volume: number, freqEnd?: number, detune?: number,
) {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), ac.currentTime + duration);
  }
  if (detune) osc.detune.setValueAtTime(detune, ac.currentTime);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + duration);
}

function playNoise(duration: number, volume: number) {
  const ac = getCtx();
  if (!ac) return;
  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  src.connect(gain).connect(ac.destination);
  src.start(ac.currentTime);
}

export const sfx = {
  jump() {
    playTone(280, 0.15, "square", 0.12, 560);
  },

  doubleJump() {
    playTone(400, 0.12, "square", 0.1, 800);
    setTimeout(() => playTone(520, 0.1, "square", 0.08, 900), 60);
  },

  orb() {
    playTone(660, 0.08, "sine", 0.1, 1320);
    setTimeout(() => playTone(880, 0.1, "sine", 0.08), 50);
  },

  hit() {
    playNoise(0.2, 0.15);
    playTone(180, 0.25, "sawtooth", 0.1, 60);
  },

  dash() {
    playTone(150, 0.18, "sawtooth", 0.08, 400);
    playNoise(0.12, 0.06);
  },

  wallBreak() {
    playNoise(0.15, 0.12);
    playTone(120, 0.2, "square", 0.08, 50);
    setTimeout(() => playNoise(0.1, 0.08), 80);
  },

  shield() {
    playTone(440, 0.1, "sine", 0.08, 880);
    setTimeout(() => playTone(660, 0.12, "sine", 0.07, 1100), 70);
    setTimeout(() => playTone(880, 0.15, "sine", 0.06), 140);
  },

  die() {
    playTone(300, 0.3, "sawtooth", 0.12, 80);
    setTimeout(() => playTone(200, 0.4, "sawtooth", 0.1, 40), 150);
  },

  nearMiss() {
    playTone(520, 0.06, "triangle", 0.08, 780);
    setTimeout(() => playTone(680, 0.08, "triangle", 0.06), 40);
  },

  milestone() {
    playTone(440, 0.12, "sine", 0.1);
    setTimeout(() => playTone(660, 0.12, "sine", 0.08), 100);
    setTimeout(() => playTone(880, 0.15, "sine", 0.07), 200);
  },

  zoneEnter() {
    playTone(220, 0.3, "sine", 0.08, 330);
    setTimeout(() => playTone(330, 0.3, "sine", 0.07, 440), 150);
    setTimeout(() => playTone(440, 0.3, "sine", 0.06, 660), 300);
  },
};
