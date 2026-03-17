const state = {
  tracks: [],
  filteredTracks: [],
  currentIndex: -1,
  query: "",
  filter: "all",
  isPlaying: false,
  durations: new Map(),
};

const audio = document.getElementById("audio-player");
const trackGrid = document.getElementById("track-grid");
const queueList = document.getElementById("queue-list");
const searchInput = document.getElementById("search-input");
const playButton = document.getElementById("play-button");
const prevButton = document.getElementById("prev-button");
const nextButton = document.getElementById("next-button");
const playSpotlightButton = document.getElementById("play-spotlight");
const seekRange = document.getElementById("seek-range");
const volumeRange = document.getElementById("volume-range");
const currentTitle = document.getElementById("current-title");
const currentFile = document.getElementById("current-file");
const currentDuration = document.getElementById("current-duration");
const currentIndex = document.getElementById("current-index");
const timeCurrent = document.getElementById("time-current");
const timeTotal = document.getElementById("time-total");
const currentArt = document.getElementById("current-art");
const spotlight = document.getElementById("spotlight");
const spotlightArt = document.getElementById("spotlight-art");
const spotlightTitle = document.getElementById("spotlight-title");
const spotlightFile = document.getElementById("spotlight-file");
const spotlightDescription = document.getElementById("spotlight-description");
const heroStats = document.getElementById("hero-stats");
const canvas = document.getElementById("visualizer-canvas");
const canvasContext = canvas.getContext("2d");
const filterButtons = [...document.querySelectorAll(".filter-chip")];
const aboutToggle = document.getElementById("about-toggle");
const aboutPanel = document.getElementById("about-panel");

let audioContext;
let analyser;
let sourceNode;
let animationFrameId;
let audioGraphReady = false;

const appConfig = window.MUSICLAB_CONFIG || {};
const audioBaseUrl = String(appConfig.audioBaseUrl || "web-audio").replace(/\/$/, "");
const visualizerEnabled = false;

console.log("[MusicLab] Config carregada:", { audioBaseUrl, hasConfig: !!window.MUSICLAB_CONFIG });

const STORAGE_KEYS = {
  track: "musica-lab-ia-track",
  volume: "musica-lab-ia-volume",
  currentTime: "musica-lab-ia-time",
};

function hashString(value) {
  return [...value].reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function buildPalette(seedText) {
  const hue = hashString(seedText) % 360;
  const altHue = (hue + 46) % 360;
  return {
    primary: `hsl(${hue} 78% 56%)`,
    secondary: `hsl(${altHue} 62% 48%)`,
    glow: `hsla(${hue} 95% 68% / 0.36)`,
  };
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function trackLengthCategory(track) {
  const duration = track.duration || 0;
  if (duration >= 270) {
    return "long";
  }
  if (duration && duration <= 180) {
    return "short";
  }
  return "all";
}

function buildTrackFromReport(item, index, total) {
  return {
    id: item.output,
    index,
    total,
    title: item.title,
    output: item.output,
    source: item.source,
    src: `${audioBaseUrl}/${encodeURIComponent(item.output)}`,
    palette: buildPalette(item.title),
    duration: 0,
    recent: total - index <= 12,
  };
}

function applyFilter() {
  const query = state.query.trim().toLowerCase();

  state.filteredTracks = state.tracks.filter((track) => {
    const matchesQuery =
      !query ||
      track.title.toLowerCase().includes(query) ||
      track.source.toLowerCase().includes(query);

    if (!matchesQuery) {
      return false;
    }

    if (state.filter === "recent") {
      return track.recent;
    }

    if (state.filter === "all") {
      return true;
    }

    return trackLengthCategory(track) === state.filter;
  });

  renderTrackGrid();
}

function renderTrackGrid() {
  if (!state.filteredTracks.length) {
    trackGrid.innerHTML = '<p class="hero-text">Nenhuma faixa encontrada.</p>';
    return;
  }

  trackGrid.innerHTML = state.filteredTracks
    .map((track) => {
      const isCurrent = state.currentIndex === state.tracks.findIndex((item) => item.id === track.id);
      return `
        <article class="track-card ${isCurrent ? "is-current" : ""}" data-id="${track.id}">
          <div class="track-art" style="${artStyle(track.palette)}">
            <span class="track-index">${String(track.index + 1).padStart(2, "0")}</span>
            <span class="track-duration">${formatTime(track.duration)}</span>
          </div>
          <div>
            <h3>${escapeHtml(track.title)}</h3>
            <p>${escapeHtml(track.source)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderQueue() {
  queueList.innerHTML = state.tracks
    .slice(0, 18)
    .map((track, index) => `
      <article class="queue-item ${index === state.currentIndex ? "is-current" : ""}" data-id="${track.id}">
        <div>
          <strong>${escapeHtml(track.title)}</strong>
          <p class="queue-item-meta">${escapeHtml(track.output)}</p>
        </div>
        <span class="queue-tag">${formatTime(track.duration)}</span>
      </article>
    `)
    .join("");
}

function renderHeroStats() {
  const total = state.tracks.length;
  const longTracks = state.tracks.filter((track) => trackLengthCategory(track) === "long").length;
  heroStats.innerHTML = `
    <span>${total} faixas</span>
    <span>${longTracks} longas</span>
    <span>${Math.round(total / 6)} blocos de escuta</span>
  `;
}

function updateSpotlight(track) {
  if (!track) {
    return;
  }

  spotlightArt.style.cssText = artStyle(track.palette);
  spotlightTitle.textContent = track.title;
  spotlightFile.textContent = track.output;
  spotlightDescription.textContent =
    track.duration > 0
      ? `Faixa pronta para streaming local, com ${formatTime(track.duration)} de duracao.`
      : "Faixa pronta para streaming local em formato otimizado.";
  spotlight.dataset.id = track.id;
}

function updateCurrentUI() {
  const track = state.tracks[state.currentIndex];
  if (!track) {
    return;
  }

  currentTitle.textContent = track.title;
  currentFile.textContent = track.output;
  currentDuration.textContent = formatTime(track.duration);
  currentIndex.textContent = String(track.index + 1).padStart(2, "0");
  currentArt.style.cssText = artStyle(track.palette);
  timeTotal.textContent = formatTime(audio.duration || track.duration);
  playButton.textContent = state.isPlaying ? "Pausar" : "Tocar";
  renderTrackGrid();
  renderQueue();
  updateSpotlight(track);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function artStyle(palette) {
  return `--card-primary:${palette.primary};--card-secondary:${palette.secondary};--card-glow:${palette.glow};background:
    radial-gradient(circle at 18% 20%, rgba(255,255,255,.3), transparent 20%),
    radial-gradient(circle at 78% 18%, var(--card-glow), transparent 24%),
    linear-gradient(135deg, var(--card-primary), var(--card-secondary));`;
}

function loadTrack(index, { autoplay = false, preserveTime = false } = {}) {
  const track = state.tracks[index];
  if (!track) {
    return;
  }

  state.currentIndex = index;
  console.log("[MusicLab] Carregando track:", { title: track.title, src: track.src });
  
  // Limpar src anterior e usar source element para forçar tipo MIME correto
  audio.removeAttribute('src');
  audio.innerHTML = '';
  const source = document.createElement('source');
  source.src = track.src;
  source.type = 'audio/mp4';
  audio.appendChild(source);
  audio.load();
  seekRange.value = 0;
  timeCurrent.textContent = "00:00";
  timeTotal.textContent = formatTime(track.duration);

  if (!preserveTime) {
    localStorage.setItem(STORAGE_KEYS.currentTime, "0");
  }

  localStorage.setItem(STORAGE_KEYS.track, track.id);
  updateCurrentUI();

  if (autoplay) {
    playCurrent();
  }
}

async function playCurrent() {
  if (state.currentIndex < 0 && state.tracks.length) {
    loadTrack(0);
  }

  try {
    await audio.play();
    if (visualizerEnabled) {
      await ensureAudioGraph();
    }
    state.isPlaying = true;
    playButton.textContent = "Pausar";
    drawVisualizer();
  } catch (error) {
    console.error("Falha ao tocar audio", error);
  }
}

function pauseCurrent() {
  audio.pause();
  state.isPlaying = false;
  playButton.textContent = "Tocar";
}

async function ensureAudioGraph() {
  if (!visualizerEnabled) {
    return;
  }

  if (audioGraphReady) {
    if (audioContext?.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (error) {
        console.warn("Nao foi possivel retomar o contexto de audio", error);
      }
    }
    return;
  }

  try {
    if (!audioContext) {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (!sourceNode) {
      sourceNode = audioContext.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);
    }

    audioGraphReady = true;
  } catch (error) {
    audioGraphReady = false;
    analyser = null;
    console.warn("Visualizador indisponivel; mantendo reproducao direta do elemento de audio.", error);
  }
}

function drawVisualizer() {
  cancelAnimationFrame(animationFrameId);

  if (!visualizerEnabled || !analyser || !state.isPlaying) {
    paintIdleVisualizer();
    return;
  }

  const data = new Uint8Array(analyser.frequencyBinCount);
  const width = canvas.width;
  const height = canvas.height;

  const draw = () => {
    animationFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    canvasContext.clearRect(0, 0, width, height);

    const current = state.tracks[state.currentIndex];
    const palette = current ? current.palette : buildPalette("default");
    const gradient = canvasContext.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.primary);
    gradient.addColorStop(1, palette.secondary);

    canvasContext.fillStyle = "rgba(255,255,255,0.04)";
    canvasContext.fillRect(0, 0, width, height);

    const barWidth = width / data.length;

    data.forEach((value, index) => {
      const magnitude = (value / 255) * (height - 20);
      const x = index * barWidth;
      const y = height - magnitude;
      canvasContext.fillStyle = gradient;
      canvasContext.fillRect(x, y, Math.max(2, barWidth - 2), magnitude);
    });
  };

  draw();
}

function paintIdleVisualizer() {
  const width = canvas.width;
  const height = canvas.height;
  canvasContext.clearRect(0, 0, width, height);
  const gradient = canvasContext.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(228,138,47,0.28)");
  gradient.addColorStop(1, "rgba(103,190,174,0.18)");
  canvasContext.fillStyle = "rgba(255,255,255,0.03)";
  canvasContext.fillRect(0, 0, width, height);
  canvasContext.strokeStyle = gradient;
  canvasContext.lineWidth = 2;
  canvasContext.beginPath();
  for (let x = 0; x <= width; x += 8) {
    const y = height / 2 + Math.sin(x / 38) * 18;
    if (x === 0) {
      canvasContext.moveTo(x, y);
    } else {
      canvasContext.lineTo(x, y);
    }
  }
  canvasContext.stroke();
}

function bindEvents() {
  aboutToggle?.addEventListener("click", () => {
    const isExpanded = aboutToggle.getAttribute("aria-expanded") === "true";
    aboutToggle.setAttribute("aria-expanded", String(!isExpanded));
    aboutToggle.textContent = isExpanded ? "Saber mais" : "Fechar texto";
    aboutPanel.hidden = isExpanded;
  });

  trackGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".track-card");
    if (!card) {
      return;
    }

    const index = state.tracks.findIndex((track) => track.id === card.dataset.id);
    loadTrack(index, { autoplay: true });
  });

  queueList.addEventListener("click", (event) => {
    const item = event.target.closest(".queue-item");
    if (!item) {
      return;
    }

    const index = state.tracks.findIndex((track) => track.id === item.dataset.id);
    loadTrack(index, { autoplay: true });
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterButtons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.filter = button.dataset.filter;
      applyFilter();
    });
  });

  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    applyFilter();
  });

  playButton.addEventListener("click", () => {
    if (state.isPlaying) {
      pauseCurrent();
      return;
    }
    playCurrent();
  });

  playSpotlightButton.addEventListener("click", () => {
    if (state.currentIndex >= 0) {
      playCurrent();
      return;
    }
    loadTrack(0, { autoplay: true });
  });

  prevButton.addEventListener("click", () => {
    if (!state.tracks.length) {
      return;
    }
    const nextIndex = state.currentIndex <= 0 ? state.tracks.length - 1 : state.currentIndex - 1;
    loadTrack(nextIndex, { autoplay: true });
  });

  nextButton.addEventListener("click", () => {
    if (!state.tracks.length) {
      return;
    }
    const nextIndex = state.currentIndex >= state.tracks.length - 1 ? 0 : state.currentIndex + 1;
    loadTrack(nextIndex, { autoplay: true });
  });

  audio.addEventListener("loadedmetadata", () => {
    const track = state.tracks[state.currentIndex];
    if (!track) {
      return;
    }

    track.duration = audio.duration;
    state.durations.set(track.id, audio.duration);
    currentDuration.textContent = formatTime(audio.duration);
    timeTotal.textContent = formatTime(audio.duration);
    renderTrackGrid();
    renderQueue();

    const storedTime = Number(localStorage.getItem(STORAGE_KEYS.currentTime) || "0");
    if (storedTime > 0) {
      audio.currentTime = Math.min(storedTime, Math.max(audio.duration - 1, 0));
    }
  });

  audio.addEventListener("timeupdate", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }

    seekRange.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    timeCurrent.textContent = formatTime(audio.currentTime);
    localStorage.setItem(STORAGE_KEYS.currentTime, String(audio.currentTime));
  });

  audio.addEventListener("play", () => {
    state.isPlaying = true;
    playButton.textContent = "Pausar";
    drawVisualizer();
  });

  audio.addEventListener("pause", () => {
    state.isPlaying = false;
    playButton.textContent = "Tocar";
    paintIdleVisualizer();
  });

  audio.addEventListener("error", () => {
    const errorCode = audio.error ? audio.error.code : "unknown";
    const errorMessage = audio.error ? audio.error.message : "unknown";
    console.error("Erro ao carregar audio:", {
      src: audio.currentSrc,
      code: errorCode,
      message: errorMessage,
      networkState: audio.networkState,
      readyState: audio.readyState
    });
    renderFatalError(`Falha ao carregar a faixa de audio (codigo: ${errorCode}).`);
  });

  audio.addEventListener("ended", () => {
    nextButton.click();
  });

  seekRange.addEventListener("input", () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    audio.currentTime = (Number(seekRange.value) / 1000) * audio.duration;
  });

  volumeRange.addEventListener("input", () => {
    audio.volume = Number(volumeRange.value);
    localStorage.setItem(STORAGE_KEYS.volume, String(audio.volume));
  });
}

async function loadCatalog() {
  let report;
  const embeddedReport = document.getElementById("catalog-data");

  if (embeddedReport?.textContent.trim()) {
    report = JSON.parse(embeddedReport.textContent);
  } else {
    const response = await fetch("conversion-report.json");
    if (!response.ok) {
      throw new Error("Nao foi possivel carregar o catalogo.");
    }
    report = await response.json();
  }

  state.tracks = report.tracks.map((item, index, items) => buildTrackFromReport(item, index, items.length));
  renderHeroStats();
  applyFilter();
  renderQueue();
  updateSpotlight(state.tracks[0]);
  restorePlayerState();
  prefetchDurations();
}

function restorePlayerState() {
  const storedVolume = Number(localStorage.getItem(STORAGE_KEYS.volume));
  audio.volume = Number.isFinite(storedVolume) ? storedVolume : 0.85;
  audio.muted = false;
  volumeRange.value = String(audio.volume);

  const storedTrackId = localStorage.getItem(STORAGE_KEYS.track);
  const trackIndex = state.tracks.findIndex((track) => track.id === storedTrackId);
  const indexToLoad = trackIndex >= 0 ? trackIndex : 0;
  loadTrack(indexToLoad, { preserveTime: true });
}

function prefetchDurations() {
  state.tracks.forEach((track) => {
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.src = track.src;
    probe.addEventListener(
      "loadedmetadata",
      () => {
        track.duration = probe.duration;
        state.durations.set(track.id, probe.duration);
        if (track.id === state.tracks[state.currentIndex]?.id) {
          currentDuration.textContent = formatTime(probe.duration);
          timeTotal.textContent = formatTime(probe.duration);
        }
        renderTrackGrid();
        renderQueue();
      },
      { once: true }
    );
  });
}

function renderFatalError(message) {
  trackGrid.innerHTML = `<p class="hero-text">${escapeHtml(message)}</p>`;
  queueList.innerHTML = "";
  spotlightDescription.textContent = message;
}

paintIdleVisualizer();
bindEvents();
loadCatalog().catch((error) => {
  console.error(error);
  renderFatalError("Falha ao carregar o catalogo. Abra o app por um servidor local.");
});
