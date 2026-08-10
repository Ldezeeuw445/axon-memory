/* AXON Web Audio Sonic Identity */

let audioCtx;
let humOscillator;
let humGain;

const initAudio = () => {
  if (audioCtx) return;
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // The ambient hum: very low frequency, almost felt rather than heard
  humOscillator = audioCtx.createOscillator();
  humOscillator.type = 'sine';
  humOscillator.frequency.setValueAtTime(55, audioCtx.currentTime); // Low A (A1)
  
  humGain = audioCtx.createGain();
  humGain.gain.setValueAtTime(0, audioCtx.currentTime);
  
  humOscillator.connect(humGain);
  humGain.connect(audioCtx.destination);
  
  humOscillator.start();
};

export const startAmbientHum = () => {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  // Fade in very slowly
  humGain.gain.setTargetAtTime(0.05, audioCtx.currentTime, 2);
};

export const stopAmbientHum = () => {
  if (humGain) {
    // Fade out very slowly
    humGain.gain.setTargetAtTime(0, audioCtx.currentTime, 2);
  }
};

export const playGlassTick = (weight = 'light') => {
  if (!audioCtx) initAudio();
  
  const tickOsc = audioCtx.createOscillator();
  const tickGain = audioCtx.createGain();
  
  // Pitch varies with weight
  const freq = weight === 'heavy' ? 440 : (weight === 'medium' ? 880 : 1760);
  tickOsc.type = 'sine';
  tickOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  // Quick decay for a "tick" sound
  tickGain.gain.setValueAtTime(0, audioCtx.currentTime);
  tickGain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
  tickGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
  
  tickOsc.connect(tickGain);
  tickGain.connect(audioCtx.destination);
  
  tickOsc.start();
  tickOsc.stop(audioCtx.currentTime + 0.1);
};

export const playAxonChord = () => {
  if (!audioCtx) initAudio();
  // Two-note chord (e.g. A4 and E5)
  [440, 659.25].forEach(freq => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 3);
  });
};
