/* Built-in ambient soundtrack, generated in the browser with Web Audio (no external player).
   It never starts on its own: sound only plays after the visitor presses the music button. */
(() => {
  'use strict';
  const MUTE_KEY = 'site-music-muted';
  const CHORD_SECONDS = 8;
  // Cmaj7, Am7, Fmaj7, G6 as frequencies in Hz (low voicing for the pad)
  const CHORDS = [
    [130.81, 164.81, 196.0, 246.94],
    [110.0, 130.81, 164.81, 196.0],
    [87.31, 110.0, 130.81, 164.81],
    [98.0, 146.83, 164.81, 246.94]
  ];
  const TARGET_VOLUME = 0.7;

  let muted = true; // off on every visit until the visitor turns it on

  let ctx = null;
  let master = null;
  let reverbIn = null;
  let origin = 0;
  let nextChordTime = 0;
  let nextNoteTime = 0;
  let timer = null;

  const root = document.createElement('aside');
  root.className = 'music-player music-player--ambient is-open';
  root.innerHTML = `
    <button class="music-player__toggle" type="button" aria-pressed="${!muted}" aria-label="Hintergrundmusik ein- oder ausschalten">
      <span class="music-player__icon" aria-hidden="true">♫</span>
      <span class="music-player__label"><strong>Hintergrundmusik</strong><small data-state></small></span>
    </button>`;
  const button = root.querySelector('button');
  const stateText = root.querySelector('[data-state]');
  document.body.append(root);

  function setState(text) {
    stateText.textContent = text;
  }

  function refreshUi() {
    const available = Boolean(window.AudioContext || window.webkitAudioContext);
    const playing = Boolean(!muted && ctx && ctx.state === 'running');
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', available
      ? (playing ? 'Hintergrundmusik ausschalten' : 'Hintergrundmusik einschalten')
      : 'Hintergrundmusik wird von diesem Browser nicht unterstützt');
    button.title = button.getAttribute('aria-label');
    root.classList.toggle('is-playing', playing);
    setState(!available ? 'Nicht verfügbar' : muted ? 'Aus · zum Starten tippen'
      : playing ? 'Läuft · zum Pausieren tippen' : 'Tippen für Musik');
  }

  function createReverb() {
    const length = ctx.sampleRate * 3.5;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : TARGET_VOLUME;
    master.connect(ctx.destination);

    const reverb = createReverb();
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    reverbIn = ctx.createGain();
    reverbIn.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);
  }

  function playChord(freqs, start, length) {
    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, start);
    voice.gain.linearRampToValueAtTime(0.5, start + 3);
    voice.gain.setValueAtTime(0.5, start + length - 3);
    voice.gain.linearRampToValueAtTime(0, start + length);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1300;
    voice.connect(filter);
    filter.connect(master);
    filter.connect(reverbIn);

    freqs.forEach((freq, index) => {
      [-5, 5].forEach((detune) => {
        const osc = ctx.createOscillator();
        osc.type = index % 2 ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const level = ctx.createGain();
        level.gain.value = 0.09;
        osc.connect(level);
        level.connect(voice);
        osc.start(start);
        osc.stop(start + length + 0.2);
      });
    });
  }

  function playBell(freq, time) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.16, time + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 2.6);
    osc.connect(env);
    env.connect(master);
    env.connect(reverbIn);
    osc.start(time);
    osc.stop(time + 2.7);
  }

  function chordIndexAt(time) {
    return Math.floor((time - origin) / CHORD_SECONDS) % CHORDS.length;
  }

  function schedule() {
    if (!ctx) return;
    const horizon = ctx.currentTime + 2.5;
    while (nextChordTime < horizon) {
      const index = Math.floor((nextChordTime - origin) / CHORD_SECONDS) % CHORDS.length;
      playChord(CHORDS[index], nextChordTime, CHORD_SECONDS);
      nextChordTime += CHORD_SECONDS;
    }
    while (nextNoteTime < horizon) {
      const chord = CHORDS[chordIndexAt(nextNoteTime)];
      const tone = chord[Math.floor(Math.random() * chord.length)];
      const octave = Math.random() < 0.5 ? 2 : 4;
      playBell(tone * octave, nextNoteTime);
      nextNoteTime += 1.2 + Math.random() * 1.8;
    }
  }

  function startEngine() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) { refreshUi(); return; }
      try { ctx = new AudioContextClass(); } catch (error) {
        setState('Musik konnte nicht starten');
        return;
      }
      ctx.addEventListener('statechange', refreshUi);
      buildGraph();
      origin = ctx.currentTime + 0.3;
      nextChordTime = origin;
      nextNoteTime = origin + 2;
      schedule();
      timer = setInterval(schedule, 500);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().then(refreshUi, refreshUi);
    }
    refreshUi();
  }

  function setMuted(value) {
    muted = value;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (error) { /* private mode */ }
    if (muted) {
      if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      refreshUi();
    } else {
      startEngine();
      if (master) master.gain.setTargetAtTime(TARGET_VOLUME, ctx.currentTime, 0.3);
    }
  }

  button.addEventListener('click', () => {
    if (muted) {
      setMuted(false);
    } else if (!ctx || ctx.state !== 'running') {
      startEngine();
    } else {
      setMuted(true);
    }
  });

  refreshUi();
})();
