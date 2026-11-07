'use strict';
/* Nativa FM 1.3.0 — interface compacta, sem menu, com reconexão automática. */
(() => {
  const cfg = window.NATIVA_CONFIG;
  if (!cfg) return;
  const isStandalone = () =>
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  if (!isStandalone()) return;

  const $ = (id) => document.getElementById(id);
  const ui = {
    power: $('powerButton'),
    powerText: $('powerText'),
    helper: $('playbackHelper'),
    badge: $('onAirBadge'),
    badgeText: $('badgeText'),
    title: $('trackTitle'),
    artist: $('trackArtist'),
    metaLabel: $('metadataStatus'),
    wave: $('playingWave'),
    left: $('meterLeft'),
    right: $('meterRight'),
    valueL: $('valueLeft'),
    valueR: $('valueRight'),
    meterNote: $('meterNote'),
    connection: $('connectionText'),
    requestSong: $('requestSong'),
    advertise: $('advertise')
  };

  const state = {
    desired: false,
    playing: false,
    buffering: false,
    audio: null,
    token: 0,
    retryTimer: null,
    stallTimer: null,
    startupTimer: null,
    stableTimer: null,
    resumeTimer: null,
    progressTimer: null,
    retries: 0,
    proxy: false,
    proxyFailed: false,
    corsBlocked: false,
    graphUnsupported: false,
    currentProxy: false,
    currentGraph: false,
    currentHadAudio: false,
    context: null,
    analysers: null,
    buffers: null,
    raf: 0,
    smooth: [-90, -90],
    silenceFrames: 0,
    metadata: null,
    metadataSeen: false,
    lastProgressAt: 0,
    progressEvents: 0
  };

  const SEGMENTS = 24;
  const FLOOR = -60;
  const STARTUP_TIMEOUT = 35000;
  const BUFFER_TIMEOUT = 28000;
  const STABLE_PLAYBACK = 20000;
  const RETRY_DELAYS = [2, 4, 7, 12, 20, 30, 45, 60];
  const streamUrl = cfg.streamUrl;
  const metadataUrl = `https://api.zeno.fm/mounts/metadata/subscribe/${encodeURIComponent(cfg.zenoMount)}`;
  const whatsapp = `https://wa.me/${cfg.whatsappNumber}?text=`;

  ui.requestSong.href = whatsapp + encodeURIComponent('Olá, Nativa FM! Gostaria de pedir uma música na programação.');
  ui.advertise.href = whatsapp + encodeURIComponent('Olá, Nativa FM! Gostaria de saber como anunciar com vocês. Podem enviar informações e valores?');

  const meterBars = [createMeter(ui.left), createMeter(ui.right)];

  function createMeter(track) {
    track.replaceChildren();
    return Array.from({length: SEGMENTS}, () => {
      const bar = document.createElement('span');
      track.appendChild(bar);
      return bar;
    });
  }

  function setConnectionInfo(text) {
    ui.connection.textContent = text;
  }

  function setStatus(mode, customMessage = '') {
    ui.badge.className = `on-air-badge ${mode === 'on' ? 'is-on' : mode === 'connecting' ? 'is-connecting' : mode === 'error' ? 'is-error' : 'is-off'}`;
    const map = {
      on: ['NO AR', 'DESLIGAR RÁDIO', 'Toque para encerrar a transmissão ao vivo.'],
      connecting: ['CONECTANDO', 'CONECTANDO…', 'Aguarde enquanto a Nativa FM é sintonizada.'],
      error: ['RECONEXÃO', 'TENTANDO NOVAMENTE', 'A rádio continua tentando restabelecer a transmissão automaticamente.'],
      off: ['DESLIGADA', 'LIGAR RÁDIO', 'Toque para ouvir a programação ao vivo.']
    };
    const [badge, button, helper] = map[mode] || map.off;
    ui.badgeText.textContent = badge;
    ui.powerText.textContent = button;
    ui.helper.textContent = customMessage || helper;
    ui.power.setAttribute('aria-pressed', String(mode === 'on' || mode === 'connecting' || mode === 'error'));
    ui.wave.classList.toggle('is-active', mode === 'on' || mode === 'connecting');
  }

  function resetMeters(note = 'Inicie a rádio para medir o áudio em tempo real.') {
    state.smooth = [-90, -90];
    state.silenceFrames = 0;
    displayMeter(0, -90);
    displayMeter(1, -90);
    ui.meterNote.textContent = note;
  }

  function cancelTimers() {
    for (const key of ['retryTimer', 'stallTimer', 'startupTimer', 'stableTimer', 'resumeTimer', 'progressTimer']) {
      if (state[key]) {
        clearTimeout(state[key]);
        state[key] = null;
      }
    }
    if (state.raf) {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
  }

  function closeAudioContext() {
    const ctx = state.context;
    state.context = null;
    state.analysers = null;
    state.buffers = null;
    if (ctx) {
      try { ctx.close().catch(() => {}); } catch (_) {}
    }
  }

  function discardAudio() {
    closeAudioContext();
    const audio = state.audio;
    state.audio = null;
    if (!audio) return;
    audio.onplaying = audio.onwaiting = audio.onstalled = audio.onerror = null;
    audio.onended = audio.onpause = audio.ontimeupdate = null;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch (_) {}
  }

  function setupMeterGraph(audio) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    let ctx;
    try {
      ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const splitter = ctx.createChannelSplitter(2);
      const left = ctx.createAnalyser();
      const right = ctx.createAnalyser();
      left.fftSize = right.fftSize = 2048;
      left.smoothingTimeConstant = right.smoothingTimeConstant = 0;
      source.connect(ctx.destination);
      source.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
      state.context = ctx;
      state.analysers = [left, right];
      state.buffers = [new Float32Array(left.fftSize), new Float32Array(right.fftSize)];
      ctx.onstatechange = () => {
        if (state.context === ctx && state.desired && state.playing && !document.hidden && ctx.state === 'running' && !state.raf) {
          state.raf = requestAnimationFrame(meterFrame);
        }
      };
      ctx.resume().catch(() => {});
      return true;
    } catch (error) {
      console.warn('[Nativa FM] Medição indisponível:', error);
      if (ctx) {
        try { ctx.close().catch(() => {}); } catch (_) {}
      }
      closeAudioContext();
      return false;
    }
  }

  function measureDb(analyser, buffer) {
    let energy = 0;
    if (typeof analyser.getFloatTimeDomainData === 'function') {
      analyser.getFloatTimeDomainData(buffer);
      for (let i = 0; i < buffer.length; i++) energy += buffer[i] * buffer[i];
    } else {
      const bytes = new Uint8Array(buffer.length);
      analyser.getByteTimeDomainData(bytes);
      for (const byte of bytes) {
        const sample = (byte - 128) / 128;
        energy += sample * sample;
      }
    }
    const rms = Math.sqrt(energy / buffer.length);
    return rms > 0 ? Math.max(-90, Math.min(0, 20 * Math.log10(rms))) : -90;
  }

  function displayMeter(channel, value) {
    const lit = Math.round(Math.max(0, Math.min(SEGMENTS, ((value - FLOOR) / -FLOOR) * SEGMENTS)));
    meterBars[channel].forEach((element, index) => element.classList.toggle('is-active', index < lit));
    const number = value <= -89 ? '−∞' : value.toFixed(1);
    const output = channel ? ui.valueR : ui.valueL;
    output.innerHTML = `${number}<small>dB</small>`;
    (channel ? ui.right : ui.left).setAttribute('aria-label', `Canal ${channel ? 'direito' : 'esquerdo'}: ${number} dBFS`);
  }

  function meterFrame() {
    state.raf = 0;
    if (!state.desired || !state.playing || !state.analysers || document.hidden) return;
    if (!state.context || state.context.state !== 'running') {
      resetMeters('Análise pausada pelo dispositivo. A transmissão continua ativa.');
      return;
    }
    const db = [measureDb(state.analysers[0], state.buffers[0]), measureDb(state.analysers[1], state.buffers[1])];
    for (let i = 0; i < 2; i++) {
      state.smooth[i] += (db[i] - state.smooth[i]) * (db[i] > state.smooth[i] ? 0.37 : 0.14);
      displayMeter(i, state.smooth[i]);
    }
    if (db[0] <= -89 && db[1] <= -89) state.silenceFrames++;
    else state.silenceFrames = 0;
    if (state.silenceFrames === 240) ui.meterNote.textContent = 'Sem amostras neste momento. A transmissão pode estar silenciosa ou a leitura pode ser limitada pelo navegador.';
    if (state.silenceFrames === 0) ui.meterNote.textContent = 'Leitura RMS real e independente dos canais esquerdo e direito.';
    state.raf = requestAnimationFrame(meterFrame);
  }

  function startMeterAnimation() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (!state.analysers) {
      resetMeters('Reprodução ativa. O navegador não liberou a leitura detalhada do áudio.');
      return;
    }
    if (state.context?.state === 'suspended' && !document.hidden) state.context.resume().catch(() => {});
    if (!document.hidden) state.raf = requestAnimationFrame(meterFrame);
  }

  function retryLater(reason) {
    if (!state.desired) return;
    cancelTimers();
    discardAudio();
    state.playing = false;
    state.buffering = false;
    const isOffline = navigator.onLine === false;
    if (!isOffline) state.retries++;
    const delay = isOffline ? 10 : RETRY_DELAYS[Math.min(state.retries - 1, RETRY_DELAYS.length - 1)];
    setStatus('error', isOffline ? 'Sem internet. A rádio continuará tentando reconectar.' : `Sinal interrompido. Nova tentativa em ${delay} segundos.`);
    setConnectionInfo(`${reason}. Tentativa automática ${state.retries || 1}.`);
    resetMeters('Aguardando a reconexão automática.');
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      if (state.desired) connectStream();
    }, delay * 1000);
  }

  function buffering(reason) {
    if (!state.desired || !state.audio || state.buffering) return;
    state.buffering = true;
    state.playing = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.progressTimer) clearTimeout(state.progressTimer);
    state.progressTimer = null;
    setStatus('connecting', 'Aguarde. A transmissão está reorganizando o áudio.');
    setConnectionInfo(`${reason}. Mantendo a conexão atual enquanto o áudio se recupera.`);
    if (state.stableTimer) clearTimeout(state.stableTimer);
    state.stableTimer = null;
    if (state.stallTimer) clearTimeout(state.stallTimer);
    const audio = state.audio;
    state.stallTimer = setTimeout(() => {
      state.stallTimer = null;
      if (state.desired && state.audio === audio && state.buffering) retryLater('O áudio não se recuperou a tempo');
    }, BUFFER_TIMEOUT);
  }

  function maybeFallback(reason, hadPlayback) {
    if (!state.desired) return;
    if (state.currentProxy && !state.proxyFailed) {
      state.proxyFailed = true;
      setConnectionInfo(`Servidor auxiliar indisponível. Tentando conexão direta com a rádio.`);
      connectStream();
      return;
    }
    if (!state.currentProxy && state.currentGraph && !hadPlayback && !state.corsBlocked) {
      state.corsBlocked = true;
      setConnectionInfo('O navegador limitou a análise detalhada. Tentando reprodução nativa da rádio.');
      connectStream();
      return;
    }
    retryLater(reason);
  }

  function connectStream() {
    if (!state.desired) return;
    cancelTimers();
    discardAudio();
    const token = ++state.token;
    state.playing = false;
    state.buffering = false;
    state.currentHadAudio = false;
    state.progressEvents = 0;
    state.lastProgressAt = Date.now();
    state.currentProxy = state.proxy && !state.proxyFailed;
    const canGraph = !state.graphUnsupported && (state.currentProxy || !state.corsBlocked);
    state.currentGraph = canGraph;
    let audio = new Audio();
    state.audio = audio;
    audio.preload = 'none';
    audio.volume = 1;
    audio.loop = false;
    if (canGraph) audio.crossOrigin = 'anonymous';
    audio.src = state.currentProxy ? './api/stream' : streamUrl;
    if (canGraph && !setupMeterGraph(audio)) {
      state.graphUnsupported = true;
      discardAudio();
      audio = new Audio();
      audio.preload = 'none';
      audio.volume = 1;
      audio.src = state.currentProxy ? './api/stream' : streamUrl;
      state.audio = audio;
      state.currentGraph = false;
    }

    setStatus('connecting');
    setConnectionInfo(`Conectando ${state.currentProxy ? 'pelo aplicativo' : 'diretamente à Nativa FM'} com reconexão automática ativa.`);
    resetMeters('Preparando a leitura do streaming…');
    const current = audio;
    const valid = () => state.desired && state.audio === current && state.token === token;

    state.startupTimer = setTimeout(() => {
      state.startupTimer = null;
      if (valid() && !state.currentHadAudio) maybeFallback('A transmissão demorou para iniciar', false);
    }, STARTUP_TIMEOUT);

    audio.onplaying = () => {
      if (!valid()) return;
      state.currentHadAudio = true;
      state.playing = true;
      state.buffering = false;
      if (state.stallTimer) clearTimeout(state.stallTimer);
      if (state.startupTimer) clearTimeout(state.startupTimer);
      if (state.stableTimer) clearTimeout(state.stableTimer);
      state.stallTimer = state.startupTimer = null;
      setStatus('on');
      setConnectionInfo('Transmitindo ao vivo. Reconexão automática pronta caso ocorra alguma falha.');
      state.lastProgressAt = Date.now();
      startMeterAnimation();
      updateMediaSession();
      state.stableTimer = setTimeout(() => {
        if (valid() && state.playing) state.retries = 0;
      }, STABLE_PLAYBACK);
      if (state.progressTimer) clearTimeout(state.progressTimer);
      const checkProgress = () => {
        if (!valid() || !state.playing || state.buffering) return;
        if (state.progressEvents >= 2 && Date.now() - state.lastProgressAt > 45000) {
          buffering('A transmissão ficou sem avanço por muito tempo');
        } else {
          state.progressTimer = setTimeout(checkProgress, 10000);
        }
      };
      state.progressTimer = setTimeout(checkProgress, 10000);
    };

    audio.ontimeupdate = () => {
      if (!valid()) return;
      state.progressEvents += 1;
      state.lastProgressAt = Date.now();
    };
    audio.onwaiting = () => { if (valid()) buffering('O player está aguardando novos dados'); };
    audio.onstalled = () => { if (valid() && !state.playing) buffering('A conexão ficou temporariamente sem novos dados'); };
    audio.onended = () => { if (valid()) retryLater('A transmissão foi encerrada pela origem'); };
    audio.onerror = () => { if (valid()) maybeFallback('Houve um erro de rede ou reprodução', state.currentHadAudio); };
    audio.onpause = () => {
      if (!valid() || state.buffering || current.ended) return;
      state.playing = false;
      if (state.stableTimer) clearTimeout(state.stableTimer);
      state.stableTimer = null;
      if (state.progressTimer) clearTimeout(state.progressTimer);
      state.progressTimer = null;
      if (state.resumeTimer) clearTimeout(state.resumeTimer);
      setStatus('connecting', 'A transmissão foi pausada pelo sistema. Tentando retomar automaticamente.');
      state.resumeTimer = setTimeout(() => {
        state.resumeTimer = null;
        if (!valid() || !current.paused) return;
        current.play().catch((error) => {
          if (!valid()) return;
          if (error?.name === 'NotAllowedError') {
            setStatus('error', 'O sistema bloqueou a retomada. Toque novamente para ligar a rádio.');
            setConnectionInfo('O dispositivo pediu uma nova ação manual para continuar a reprodução.');
          } else {
            retryLater('Não foi possível retomar a transmissão');
          }
        });
      }, 1600);
    };

    const promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((error) => {
        if (!valid()) return;
        if (error?.name === 'NotAllowedError') {
          cancelTimers();
          discardAudio();
          state.desired = false;
          state.playing = false;
          setStatus('error', 'O dispositivo exige um novo toque para iniciar a rádio.');
          setConnectionInfo('A reprodução foi bloqueada momentaneamente. Toque em ligar para tentar outra vez.');
          resetMeters('Reprodução bloqueada pelo sistema neste momento.');
        } else {
          maybeFallback('Falha ao iniciar o áudio', state.currentHadAudio);
        }
      });
    }
  }

  function powerOff() {
    state.desired = false;
    state.playing = false;
    state.buffering = false;
    state.retries = 0;
    state.token++;
    cancelTimers();
    discardAudio();
    setStatus('off');
    setConnectionInfo('Rádio desligada.');
    resetMeters('Inicie a rádio para medir o áudio em tempo real.');
    updateMediaSession();
  }

  function powerOn() {
    if (state.desired) return;
    state.desired = true;
    state.retries = 0;
    state.proxyFailed = false;
    connectStream();
  }

  ui.power.addEventListener('click', () => {
    if (state.desired) powerOff();
    else powerOn();
  });

  function parseMetadata(value) {
    let data;
    try { data = JSON.parse(value); } catch (_) { data = {streamTitle: value}; }
    if (!data || typeof data !== 'object') return null;
    const song = data.now_playing?.song || data.song;
    let artist = typeof data.artist === 'string' ? data.artist : '';
    let title = typeof data.title === 'string' ? data.title : '';
    let raw = data.streamTitle || data.stream_title || data.streamtitle || data.now_playing?.text || '';
    if (song && typeof song === 'object') {
      artist = song.artist || artist;
      title = song.title || title;
      raw = raw || song.text;
    } else if (typeof song === 'string') {
      raw = raw || song;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const parts = raw.trim().split(/\s+[-–—]\s+/);
      if (parts.length > 1) {
        artist = artist || parts.shift();
        title = title || parts.join(' - ');
      } else {
        title = title || raw;
      }
    }
    title = String(title || '').trim().slice(0, 140);
    artist = String(artist || '').trim().slice(0, 120);
    if (!title || /^(unknown|null|undefined|offline|no metadata)$/i.test(title)) return null;
    return {title, artist};
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ui.title.textContent || cfg.name,
        artist: ui.artist.textContent || cfg.slogan,
        album: `${cfg.name} ${cfg.frequency}`,
        artwork: [
          {src: new URL('icons/icon-192.png', location.href).href, sizes: '192x192', type: 'image/png'},
          {src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png'}
        ]
      });
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
    } catch (_) {}
  }

  if ('mediaSession' in navigator) {
    for (const [key, handler] of Object.entries({play: powerOn, pause: powerOff, stop: powerOff})) {
      try { navigator.mediaSession.setActionHandler(key, handler); } catch (_) {}
    }
  }

  function startMetadata() {
    if (state.metadata) state.metadata.close();
    if (typeof EventSource === 'undefined') {
      ui.metaLabel.textContent = 'METADADOS INDISPONÍVEIS';
      return;
    }
    const source = new EventSource(state.proxy ? './api/metadata' : metadataUrl);
    state.metadata = source;
    ui.metaLabel.textContent = 'AGUARDANDO DADOS';
    source.onmessage = (event) => {
      if (state.metadata !== source) return;
      const item = parseMetadata(event.data);
      if (!item) return;
      state.metadataSeen = true;
      ui.title.textContent = item.title;
      ui.artist.textContent = item.artist || 'Nativa FM · Ao vivo';
      ui.metaLabel.textContent = 'METADADOS AO VIVO';
      updateMediaSession();
    };
    source.onerror = () => {
      if (state.metadata === source) ui.metaLabel.textContent = state.metadataSeen ? 'ATUALIZANDO…' : 'SEM METADADOS';
    };
  }

  async function detectProxy() {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);
    try {
      const result = await fetch('./api/health', {signal: abort.signal, cache: 'no-store'});
      if (!result.ok || !result.headers.get('content-type')?.includes('application/json')) return false;
      const data = await result.json();
      return data?.service === 'nativa-fm-proxy' && data?.ready === true;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  detectProxy().then((ready) => {
    state.proxy = ready;
    startMetadata();
    if (!state.desired && ready) resetMeters('Aplicativo pronto para medir áudio em tempo real.');
  });

  window.addEventListener('online', () => {
    if (state.desired && !state.playing) connectStream();
  });
  window.addEventListener('offline', () => {
    if (state.desired && !state.playing) {
      setStatus('error', 'Internet indisponível. A reconexão continuará ativa.');
      setConnectionInfo('Sem internet no momento. O aplicativo seguirá tentando automaticamente.');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.desired && state.playing && state.analysers) {
      state.context?.resume().catch(() => {});
      if (!state.raf) state.raf = requestAnimationFrame(meterFrame);
    }
    if (!document.hidden && state.desired && !state.playing && state.audio?.paused && !state.retryTimer && !state.buffering) {
      state.audio.play().catch(() => {});
    }
  });
  window.addEventListener('pageshow', () => {
    if (state.desired && state.playing && state.analysers && !state.raf) state.raf = requestAnimationFrame(meterFrame);
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service Worker:', error)));
  }

  setStatus('off');
  setConnectionInfo('Rádio desligada.');
  resetMeters('Inicie a rádio para medir o áudio em tempo real.');
  updateMediaSession();
})();
