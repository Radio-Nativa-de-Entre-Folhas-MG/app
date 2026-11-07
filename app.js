'use strict';
/* Nativa FM 1.9.1 — inicialização automática; visual 1.9.0 preservado. */
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
    equalizer: $('radialCanvas'),
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
    analyser: null,
    frequencyData: null,
    raf: 0,
    levels: new Float32Array(24),
    lastMeterFrame: 0,
    frequencyRanges: [],
    metadata: null,
    metadataSeen: false,
    lastProgressAt: 0,
    progressEvents: 0
  };

  const BANDS = 24;
  const ATTACK_MS = 9;
  const RELEASE_MS = 92;
  const radialCtx = ui.equalizer.getContext('2d', {alpha: true});
  let canvasSize = 0;
  const TWO_PI = 2 * Math.PI;
  const COLOR_STOPS = [
    [0.00, [13, 217, 236]], // ciano / topo
    [0.12, [111, 253, 48]], // verde-limão
    [0.24, [250, 215, 35]], // amarelo / direita
    [0.37, [255, 70, 73]], // vermelho
    [0.48, [208, 48, 244]], // magenta
    [0.57, [30, 219, 210]], // turquesa
    [0.68, [27, 145, 255]], // azul
    [0.79, [244, 24, 163]], // rosa / esquerda
    [0.90, [122, 39, 255]], // violeta
    [1.00, [13, 217, 236]]
  ];

  // A cor pertence à POSIÇÃO de cada coluna, e não à intensidade do som.
  function colorAt(fraction) {
    const t = (fraction % 1 + 1) % 1;
    for (let i = 1; i < COLOR_STOPS.length; i++) {
      const [p1, c1] = COLOR_STOPS[i - 1];
      const [p2, c2] = COLOR_STOPS[i];
      if (t <= p2) {
        const f = Math.max(0, Math.min(1, (t - p1) / (p2 - p1)));
        return c1.map((v, j) => Math.round(v + (c2[j] - v) * f));
      }
    }
    return COLOR_STOPS[0][1];
  }

  function sizeVisualizer() {
    const rect = ui.equalizer.getBoundingClientRect();
    const size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvasSize = size;
    ui.equalizer.width = Math.round(size * dpr);
    ui.equalizer.height = Math.round(size * dpr);
    radialCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSpectrum();
  }

  // Cada coluna radial usa uma faixa distinta do espectro de frequências.
  // As alturas dependem de energia real, não de uma sequência decorativa pré-definida.
  function drawSpectrum() {
    if (!radialCtx || canvasSize < 2) return;
    const c = canvasSize / 2;
    const radius = canvasSize * .322;
    const widthInside = canvasSize * .062;
    const widthOutside = canvasSize * .074;
    const minLit = canvasSize * .023;
    const maxExtension = canvasSize * .150;
    radialCtx.clearRect(0, 0, canvasSize, canvasSize);
    const hasSpectrum = state.playing && state.analyser && state.levels.some(v => v > .04);

    // Brilho do aro é discreto e não se sobrepõe ao logotipo central.
    radialCtx.save();
    radialCtx.translate(c, c);
    radialCtx.beginPath();
    radialCtx.arc(0, 0, radius - canvasSize * .008, 0, TWO_PI);
    radialCtx.lineWidth = Math.max(1, canvasSize * .004);
    radialCtx.strokeStyle = 'rgba(102,255,67,.48)';
    radialCtx.shadowColor = '#34ff4c';
    radialCtx.shadowBlur = canvasSize * .023;
    radialCtx.stroke();
    radialCtx.restore();

    for (let i = 0; i < BANDS; i++) {
      const angle = -Math.PI / 2 + i * TWO_PI / BANDS;
      const [r, g, b] = colorAt(i / BANDS);
      const level = Math.min(1, Math.max(0, state.levels[i]));
      const height = minLit + level * maxExtension;
      radialCtx.save();
      radialCtx.translate(c, c);
      radialCtx.rotate(angle + Math.PI / 2);
      if (level > .012 || hasSpectrum) {
        const gradient = radialCtx.createLinearGradient(0, -radius, 0, -radius-height);
        gradient.addColorStop(0, `rgba(${r},${g},${b},.83)`);
        gradient.addColorStop(.58, `rgb(${r},${g},${b})`);
        gradient.addColorStop(1, `rgba(${Math.min(255,r+18)},${Math.min(255,g+18)},${Math.min(255,b+18)},1)`);
        radialCtx.fillStyle = gradient;
        radialCtx.shadowColor = `rgba(${r},${g},${b},.76)`;
        radialCtx.shadowBlur = Math.max(6, canvasSize * .035);
      } else {
        radialCtx.fillStyle = `rgba(${r},${g},${b},.11)`;
        radialCtx.shadowBlur = 0;
      }
      // Barra em forma de bloco/trapézio, larga e com espaços expressivos entre colunas.
      // A forma acompanha as barras sólidas da referência visual final.
      radialCtx.beginPath();
      radialCtx.moveTo(-widthInside/2, -radius);
      radialCtx.lineTo(widthInside/2, -radius);
      radialCtx.lineTo(widthOutside/2, -radius-height);
      radialCtx.lineTo(-widthOutside/2, -radius-height);
      radialCtx.closePath();
      radialCtx.fill();
      radialCtx.restore();
    }
  }

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(sizeVisualizer);
    observer.observe(ui.equalizer);
  } else {
    window.addEventListener('resize', sizeVisualizer);
  }
  requestAnimationFrame(sizeVisualizer);
  const STARTUP_TIMEOUT = 35000;
  const BUFFER_TIMEOUT = 28000;
  const STABLE_PLAYBACK = 20000;
  const RETRY_DELAYS = [2, 4, 7, 12, 20, 30, 45, 60];
  const streamUrl = cfg.streamUrl;
  const metadataUrl = `https://api.zeno.fm/mounts/metadata/subscribe/${encodeURIComponent(cfg.zenoMount)}`;
  const whatsapp = `https://wa.me/${cfg.whatsappNumber}?text=`;

  // Ajuste não invasivo: tente dimensionar apenas a janela instalada no
  // Windows, sem interferir em Android/iPhone e sem mover a janela do usuário.
  // A decisão final pertence ao Chrome/Edge e ao gerenciador de janelas.
  function preferCompactWindowsWindow() {
    if (!/Windows/i.test(navigator.userAgent || '')) return;
    if (!window.matchMedia?.('(display-mode: standalone)').matches) return;
    if (document.fullscreenElement) return;
    if (typeof window.resizeTo !== 'function') return;
    const availableWidth = screen.availWidth || window.outerWidth;
    const availableHeight = screen.availHeight || window.outerHeight;
    // Não interferir em telas muito pequenas.
    if (availableWidth < 650 || availableHeight < 550) return;
    const width = Math.min(540, Math.max(360, availableWidth - 36));
    const height = Math.min(850, Math.max(510, availableHeight - 48));
    // Evita chamar resizeTo quando a janela já está no tamanho solicitado.
    if (Math.abs(window.outerWidth - width) <= 4 && Math.abs(window.outerHeight - height) <= 4) return;
    try { window.resizeTo(width, height); } catch (_) { /* bloqueado pelo navegador */ }
  }
  // Uma tentativa ao abrir a PWA; nenhuma ação repetida durante a reprodução.
  window.addEventListener('load', preferCompactWindowsWindow, {once:true});

  ui.requestSong.href = whatsapp + encodeURIComponent('Olá, Nativa FM! Gostaria de pedir uma música na programação.');
  ui.advertise.href = whatsapp + encodeURIComponent('Olá, Nativa FM! Gostaria de saber como anunciar com vocês. Podem enviar informações e valores?');

  function setConnectionInfo(text) {
    ui.connection.textContent = text;
  }

  function setStatus(mode, customMessage = '') {
    ui.badge.className = `on-air-badge ${mode === 'on' ? 'is-on' : mode === 'connecting' ? 'is-connecting' : mode === 'error' ? 'is-error' : 'is-off'}`;
    const map = {
      on: ['NO AR', 'Toque para encerrar a transmissão ao vivo.'],
      connecting: ['CONECTANDO', 'Aguarde enquanto a Nativa FM é sintonizada.'],
      error: ['RECONEXÃO', 'O aplicativo continua tentando reconectar automaticamente.'],
      off: ['DESLIGADA', 'Toque para ouvir a programação ao vivo.']
    };
    const [badge, helper] = map[mode] || map.off;
    ui.badgeText.textContent = badge;
    // Verde significa rádio desligada; vermelho significa rádio ligada,
    // inclusive enquanto conecta ou aguarda reconexão.
    ui.power.classList.toggle('is-powered', state.desired);
    ui.powerText.textContent = state.desired ? 'DESLIGAR RÁDIO' : 'LIGAR RÁDIO';
    ui.helper.textContent = customMessage || helper;
    ui.power.setAttribute('aria-pressed', String(state.desired));
  }

  function resetMeters(note = 'Equalizador aguardando áudio.') {
    state.levels.fill(0);
    state.lastMeterFrame = 0;
    ui.equalizer.setAttribute('aria-label', note);
    ui.meterNote.textContent = note;
    drawSpectrum();
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
    state.analyser = null;
    state.frequencyData = null;
    state.frequencyRanges = [];
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
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -12;
      // A suavização interna alta fazia o equalizador responder devagar.
      // Um valor baixo deixa o movimento acompanhar as batidas reais.
      analyser.smoothingTimeConstant = .04;
      // Única conexão ao destino para não duplicar áudio nem criar eco.
      source.connect(ctx.destination);
      source.connect(analyser);
      state.context = ctx;
      state.analyser = analyser;
      state.frequencyData = new Float32Array(analyser.frequencyBinCount);
      const nyquist = ctx.sampleRate / 2;
      const resolution = ctx.sampleRate / analyser.fftSize;
      const minFreq = 60;
      const maxFreq = Math.min(16000, nyquist * .96);
      state.frequencyRanges = Array.from({length:BANDS}, (_, i) => {
        const lowHz = minFreq * Math.pow(maxFreq/minFreq, i/BANDS);
        const highHz = minFreq * Math.pow(maxFreq/minFreq, (i+1)/BANDS);
        const start = Math.max(1,Math.floor(lowHz/resolution));
        const stop = Math.min(analyser.frequencyBinCount,Math.max(start+1,Math.ceil(highHz/resolution)));
        return [start, stop];
      });
      ctx.onstatechange = () => {
        if (state.context === ctx && state.desired && state.playing &&
            !document.hidden && ctx.state === 'running' && !state.raf) {
          state.raf = requestAnimationFrame(meterFrame);
        }
      };
      ctx.resume().catch(() => {});
      return true;
    } catch (error) {
      console.warn('[Nativa FM] Análise de frequências indisponível:', error);
      if (ctx) { try {ctx.close().catch(() => {});} catch (_) {} }
      closeAudioContext();
      return false;
    }
  }

  function meterFrame(timestamp) {
    state.raf = 0;
    if (!state.desired || !state.playing || !state.analyser || document.hidden) return;
    if (!state.context || state.context.state !== 'running') {
      resetMeters('Análise de áudio temporariamente suspensa.');
      return;
    }
    const elapsed = state.lastMeterFrame > 0
      ? Math.max(1, Math.min(50, timestamp - state.lastMeterFrame)) : 16.7;
    state.lastMeterFrame = timestamp;
    const attack = 1 - Math.exp(-elapsed / ATTACK_MS);
    const release = 1 - Math.exp(-elapsed / RELEASE_MS);
    state.analyser.getFloatFrequencyData(state.frequencyData);
    // Avalia 24 bandas logarítmicas do sinal recebido. Picos e vales reais
    // ficam visualmente distintos: banda forte sobe, banda fraca permanece baixa.
    const dbBands = new Float32Array(BANDS);
    let maxDb = -100;
    for (let i = 0; i < BANDS; i++) {
      const [start, stop] = state.frequencyRanges[i];
      let sum = 0, peak = 0, count = 0;
      for (let j = start; j < stop; j++) {
        const binDb = state.frequencyData[j];
        if (Number.isFinite(binDb)) {
          const amp = Math.pow(10, binDb / 20);
          sum += amp;
          peak = Math.max(peak, amp);
          count++;
        }
      }
      // Mistura média e pico preserva os transientes, sem nivelar bandas vizinhas.
      const amp = count ? .65 * (sum / count) + .35 * peak : 0;
      let db = amp ? 20 * Math.log10(amp) : -100;
      // Compensação suave da queda normal de energia nas frequências altas.
      const normalizedFrequency = i / (BANDS - 1);
      db += 5.0 * normalizedFrequency;
      dbBands[i] = Math.max(-100, Math.min(0, db));
      maxDb = Math.max(maxDb, dbBands[i]);
    }
    // Normalização dinâmica por quadro, baseada SOMENTE no áudio efetivamente
    // recebido. A banda dominante sobe; bandas mais fracas permanecem baixas.
    // O contraste local destaca diferenças naturais entre frequências vizinhas.
    let active = false;
    const audible = Math.min(1,Math.max(0,(maxDb+90)/18));
    for (let i = 0; i < BANDS; i++) {
      const db = dbBands[i];
      const left = dbBands[(i+BANDS-1)%BANDS];
      const right = dbBands[(i+1)%BANDS];
      const localContrast = Math.max(-1,Math.min(1,(db-(left+right)*.5)/12));
      const relativePeak = Math.max(0,Math.min(1,(db-(maxDb-28))/28));
      let target = Math.max(0,Math.min(1,(relativePeak + localContrast*.26)*1.20));
      target = Math.pow(target,1.08) * audible;
      if (maxDb < -87 || db < -94) target = 0;
      const previous = state.levels[i];
      const next = previous + (target-previous) * (target > previous ? attack : release);
      state.levels[i] = next < .007 ? 0 : next;
      if (state.levels[i] > .04) active = true;
    }
    ui.equalizer.setAttribute('aria-label', active ? 'Equalizador circular reagindo ao áudio da Nativa FM' : 'Equalizador circular sem sinal detectado');
    drawSpectrum();
    state.raf = requestAnimationFrame(meterFrame);
  }

  function startMeterAnimation() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.lastMeterFrame = 0;
    if (!state.analyser) {
      resetMeters('Áudio disponível. O dispositivo não permite visualizar as frequências.');
      return;
    }
    if (state.context?.state === 'suspended' && !document.hidden) {
      state.context.resume().catch(() => {});
    }
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
          setStatus('off', 'Toque em LIGAR RÁDIO para autorizar o áudio neste dispositivo.');
          setConnectionInfo('O dispositivo exige um toque para permitir a reprodução de áudio.');
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

  // A interface instalada começa em CONECTANDO, sem exigir clique.
  // Aguarda apenas a verificação rápida do proxy para priorizar o streaming
  // na mesma origem (o equalizador continua com análise de áudio real).
  // Se o usuário desligar enquanto isso acontece, a conexão não será aberta.
  detectProxy().then((ready) => {
    state.proxy = ready;
    startMetadata();
    if (state.desired && !state.audio && !state.retryTimer) connectStream();
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
    if (!document.hidden && state.desired && state.playing && state.analyser) {
      state.context?.resume().catch(() => {});
      if (!state.raf) state.raf = requestAnimationFrame(meterFrame);
    }
    if (!document.hidden && state.desired && !state.playing && state.audio?.paused && !state.retryTimer && !state.buffering) {
      state.audio.play().catch(() => {});
    }
  });
  window.addEventListener('pageshow', () => {
    if (state.desired && state.playing && state.analyser && !state.raf) state.raf = requestAnimationFrame(meterFrame);
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=1.9.1').catch((error) => console.warn('Service Worker:', error)));
  }

  // Inicialização automática SOMENTE na PWA instalada. Na página pública
  // de instalação, o app.js sai no início e nenhuma reprodução é iniciada.
  // O estado desejado é ligado desde a primeira pintura: o botão fica vermelho
  // e já permite DESLIGAR, inclusive durante a verificação inicial da rede.
  state.desired = true;
  setStatus('connecting', 'Sintonizando a Nativa FM automaticamente…');
  setConnectionInfo('Conectando à programação ao vivo.');
  resetMeters('Preparando o equalizador.');
  updateMediaSession();
})();
