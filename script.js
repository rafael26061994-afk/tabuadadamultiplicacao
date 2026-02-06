// --- VARIÁVEIS DE ESTADO GLOBAL E CACHE DE ELEMENTOS ---
const screens = document.querySelectorAll('.screen');
const questionText = document.getElementById('question-text');
const answerOptions = document.querySelectorAll('.answer-option');
const timeBar = document.getElementById('time-bar');
const playerScoreElement = document.getElementById('player-score');
const playerXPElement = document.getElementById('player-xp');
const questionCounter = document.getElementById('question-counter');
const feedbackMessageElement = document.getElementById('feedback-message');
const alertSound = document.getElementById('alert-sound');
const librasAlert = document.getElementById('libras-alert');
// Remover mensagem visual de tempo baixo (mantém apenas som aos 5s finais)
if (librasAlert) librasAlert.textContent = '';


// Cache de botões e telas
const operationButtons = document.querySelectorAll('.operation-card');
const btnQuitGame = document.querySelector('.btn-quit-game');
const btnExtendTime = document.getElementById('btn-extend-time');
const btnShowAnswer = document.getElementById('btn-show-answer');
const btnVoltarHome = document.querySelectorAll('.btn-voltar-home');
const toggleVoiceRead = document.getElementById('toggle-voice-read');
const toggleNightMode = document.getElementById('toggle-night-mode');
const toggleLibras = document.getElementById('toggle-libras'); 
const modeRapidoBtn = document.getElementById('mode-rapido');
const modeEstudoBtn = document.getElementById('mode-estudo');
const levelButtons = document.querySelectorAll('.level-btn'); 

// Badge flutuante: Progresso do ciclo (Tabuada)
let cycleProgressBadge = null;

// Cache de elementos de erro
const btnTreinarErros = document.getElementById('btn-treinar-erros');
const errorCountMessage = document.getElementById('error-count-message');
const errorListContainer = document.getElementById('error-list-container');
const btnClearErrors = document.getElementById('btn-clear-errors');
const btnStartTraining = document.getElementById('btn-start-training');


// Variavel para síntese de voz (Web Speech API)
const synth = window.speechSynthesis;

// --- ESTADO DO JOGO ---
const gameState = {
    currentScreen: 'home-screen',
    currentOperation: '', 
    currentLevel: '', 
    isGameActive: false,
    score: 0,
    xp: 0,
    questionNumber: 0,
    totalQuestions: 20, 
    isVoiceReadActive: false,
    isRapidMode: true,
    errors: [], 
    highScores: [], 

    // Timer (Modo Rápido)
    timer: null,
    timeLeft: 0, 
    maxTime: 0, 
    baseTimeStep: 1,      // 1 tick a cada 100ms (tempo normal)
    slowTimeStep: 0.5,    // 0.5 tick a cada 100ms (tempo mais lento)
    timeStep: 1,
    lowTimeAlerted: false,

    // Tentativas por questão (para permitir refazer)
    attemptsThisQuestion: 0,
    maxAttemptsPerQuestion: 2,
    answerLocked: false,

    // Treino de erros
    isTrainingErrors: false,
    trainingQueue: [],
    trainingIndex: 0,


    // Config da Tabuada (Multiplicação 0–20)
    multiplication: {
        mode: 'trail',      // 'trail' | 'direct'
        tabuada: 7,
        multMin: 0,
        multMax: 20,
        // Faixa de tabuadas por nível (Multiplicação)
        trailMin: 0,
        trailMax: 20,
        // Chave inclui faixa de tabuadas e multiplicadores
        trailRangeKey: '0-20|0-20',
        // Trilha: ordem embaralhada de TODAS as contas da faixa (ex.: 0–5 com ×0–10)
        // Formato: [[tabuada, multiplicador], ...]
        trailPairs: [],
        trailPairIndex: 0,
        // Modo direto: ordem embaralhada dos multiplicadores da tabuada escolhida
        roundMultipliers: [],
        roundPos: 0,
        pendingLevel: null
    },


    acertos: 0,
    erros: 0
};


// --- FUNÇÕES UTILITY E ACESSIBILIDADE ---

/** Exibe uma tela e oculta as outras */
function exibirTela(id) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(id);
    if (targetScreen) {
        targetScreen.classList.add('active');
        gameState.currentScreen = id;
    }

    // Esconde o badge de progresso fora da tela de jogo
    if (id !== 'game-screen') {
        try { hideCycleProgressBadge(); } catch (_) {}
    }
    // Sempre que voltarmos para a home ou resultados, atualiza o botão de treino
    if (id === 'home-screen' || id === 'result-screen') {
        updateErrorTrainingButton();
    }
}

/** Reproduz o som de alerta */
function playAlertSound() {
    if (alertSound) {
        alertSound.currentTime = 0;
        alertSound.play().catch(e => console.error("Erro ao tocar áudio:", e));
    }
}

/** Função de Text-to-Speech (Leitura de Voz) */
function speak(text) {
    if (!gameState.isVoiceReadActive || !synth) return;

    // Evita cortar falas de forma agressiva (alguns navegadores podem “engolir” a primeira fala)
    try {
        if (synth.speaking || synth.pending) synth.cancel();
    } catch (_) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0; 
    
    synth.speak(utterance);
}


/** Fala uma sequência de mensagens (pergunta → alternativas) de forma confiável. */
let __voiceQueueToken = 0;
function speakSequence(texts) {
    if (!gameState.isVoiceReadActive || !synth) return;
    if (!Array.isArray(texts) || texts.length === 0) return;

    // Token para evitar que uma sequência antiga continue após iniciar uma nova
    const token = ++__voiceQueueToken;

    // Interrompe qualquer leitura anterior
    try { synth.cancel(); } catch (_) {}

    let i = 0;

    const speakNext = () => {
        if (token !== __voiceQueueToken) return;
        if (!gameState.isVoiceReadActive || !synth) return;
        if (i >= texts.length) return;

        const utterance = new SpeechSynthesisUtterance(String(texts[i]));
        utterance.lang = 'pt-BR';
        utterance.rate = 1.0;

        utterance.onend = () => { i++; speakNext(); };
        utterance.onerror = () => { i++; speakNext(); };

        try { synth.speak(utterance); } catch (_) {}
    };

    // Pequeno delay após cancel() (melhora compatibilidade: em alguns navegadores a 1ª fala pode ser "comida")
    setTimeout(speakNext, 80);
}

/** Monta textos para leitura de voz: 1) pergunta 2) alternativas (1–4). */
function buildVoiceTextsForQuestion(questionObj) {
    if (!questionObj) return [];

    const qCore = (questionObj.voiceQuestion || questionObj.question || '').toString().replace(/\s+/g, ' ').trim();
    const opts = (questionObj.voiceOptions || questionObj.options || []).map(v => String(v));

    // Pergunta primeiro (sempre)
    const qText = qCore
        ? `Questão ${gameState.questionNumber}. Quanto é ${qCore}?`
        : `Questão ${gameState.questionNumber}.`;

    // Alternativas depois, uma por vez (mais claro e mais estável no TTS)
    const optionTexts = (opts.length === 4)
        ? [
            `Opção 1: ${opts[0]}.`,
            `Opção 2: ${opts[1]}.`,
            `Opção 3: ${opts[2]}.`,
            `Opção 4: ${opts[3]}.`
        ]
        : [];

    return [qText, ...optionTexts].filter(Boolean);
}

/** Lê novamente a questão atual (atalho: tecla R). */
function announceCurrentQuestion() {
    if (!gameState.currentQuestion) return;
    speakSequence(buildVoiceTextsForQuestion(gameState.currentQuestion));
}


/** Exibe mensagens de feedback */
function showFeedbackMessage(message, type, duration = 3000) {
    if (!feedbackMessageElement) return;

    feedbackMessageElement.className = 'feedback-message hidden';
    feedbackMessageElement.classList.add(type);
    feedbackMessageElement.textContent = message;

    setTimeout(() => {
        feedbackMessageElement.classList.remove('hidden');
        feedbackMessageElement.classList.add('show');
    }, 50);

    setTimeout(() => {
        feedbackMessageElement.classList.remove('show');
        setTimeout(() => feedbackMessageElement.classList.add('hidden'), 300);
    }, duration);
}


// --- LÓGICA DE PERSISTÊNCIA (Local Storage) ---
// --- PERFIL DO ESTUDANTE (opcional) ---
const PROFILE_STORAGE_KEY = 'matemagica_profile_v1';

function loadStudentProfile() {
    try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        gameState.studentProfile = {
            name: String(obj?.name || '').trim(),
            turma: String(obj?.turma || '').trim(),
            escola: String(obj?.escola || '').trim()
        };
    } catch (e) {
        gameState.studentProfile = { name: '', turma: '', escola: '' };
    }
    return gameState.studentProfile;
}

function saveStudentProfile(profile) {
    const safe = {
        name: String(profile?.name || '').trim().slice(0, 50),
        turma: String(profile?.turma || '').trim().slice(0, 30),
        escola: String(profile?.escola || '').trim().slice(0, 60)
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(safe));
    gameState.studentProfile = safe;
    return safe;
}

function getStudentProfile() {
    return gameState.studentProfile || loadStudentProfile();
}


// --- PROGRESSO POR TRILHA DA TABUADA (salva por faixa/nível) ---
const MULT_PROGRESS_KEY = 'matemagica_mult_progress_map_v1';

function loadMultProgressMap() {
    try {
        const raw = localStorage.getItem(MULT_PROGRESS_KEY);
        const map = raw ? JSON.parse(raw) : {};
        gameState.multiplication.progressByKey = (map && typeof map === 'object') ? map : {};
    } catch (e) {
        gameState.multiplication.progressByKey = {};
    }
    return gameState.multiplication.progressByKey;
}

function saveMultProgressMap() {
    try {
        localStorage.setItem(MULT_PROGRESS_KEY, JSON.stringify(gameState.multiplication.progressByKey || {}));
    } catch (e) {
        console.warn("Falha ao salvar progresso da tabuada por chave:", e);
    }
}

function getSavedTrailIndexForKey(key, expectedLen) {
    if (!gameState.multiplication.progressByKey) loadMultProgressMap();
    const idx = Number(gameState.multiplication.progressByKey?.[key] ?? 0);
    if (!Number.isFinite(idx) || idx < 0) return 0;
    if (Number.isInteger(expectedLen) && expectedLen > 0 && idx >= expectedLen) return 0; // ciclo completo -> reinicia
    return Math.floor(idx);
}

function setSavedTrailIndexForKey(key, idx) {
    if (!gameState.multiplication.progressByKey) loadMultProgressMap();
    const n = Number(idx);
    gameState.multiplication.progressByKey[key] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    saveMultProgressMap();
}


// --- MAPA (TRILHA) NO ESTILO DUOLINGO (clean) ---
const PATH_PROGRESS_KEY = 'matemagica_path_progress_v1';

function loadPathProgress() {
    try {
        const raw = localStorage.getItem(PATH_PROGRESS_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) {
        return {};
    }
}

function savePathProgress(obj) {
    try { localStorage.setItem(PATH_PROGRESS_KEY, JSON.stringify(obj || {})); } catch (e) {}
}

function getPathDone(operation, level) {
    const data = loadPathProgress();
    return Math.max(0, Math.min(10, Number(data?.[operation]?.[level] ?? 0)));
}

function setPathDone(operation, level, done) {
    const data = loadPathProgress();
    if (!data[operation]) data[operation] = {};
    data[operation][level] = Math.max(0, Math.min(10, Number(done) || 0));
    savePathProgress(data);
}

function ensureLearningMapUI() {
    const screen = document.getElementById('level-selection-screen');
    if (!screen) return;

    let card = document.getElementById('learning-map-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'learning-map-card';
        card.className = 'info-card map-card';
        card.innerHTML = `
            <div class="map-header">
                <h2>Trilha (mapa)</h2>
                <p class="map-sub">Visualize seu progresso e avance passo a passo.</p>
            </div>
            <div id="learning-map-rows" class="map-rows"></div>
        `;
        // insere após o header do level-selection
        const header = screen.querySelector('header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(card, header.nextSibling);
        } else {
            screen.appendChild(card);
        }
    }
}

function renderLearningMapPreview(operation) {
    ensureLearningMapUI();
    const rowsEl = document.getElementById('learning-map-rows');
    if (!rowsEl) return;

    const levels = [
        { key: 'easy', label: 'Fácil' },
        { key: 'medium', label: 'Médio' },
        { key: 'advanced', label: 'Difícil' }
    ];

    const makeNodes = (done, total = 10) => {
        const nodes = [];
        for (let i = 0; i < total; i++) {
            let cls = 'map-node locked';
            if (i < done) cls = 'map-node done';
            if (i === done) cls = 'map-node current';
            nodes.push(`<span class="${cls}" aria-hidden="true"></span>`);
        }
        return nodes.join('');
    };

    rowsEl.innerHTML = levels.map(lvl => {
        let meta = '';
        let done = 0;

        if (operation === 'multiplication') {
            const r = getTabuadaRangeByLevel(lvl.key);
            const key = `${r.min}-${r.max}|${r.multMin}-${r.multMax}`;
            const bankSize = (r.max - r.min + 1) * (r.multMax - r.multMin + 1);
            const idx = getSavedTrailIndexForKey(key, bankSize);
            const ratio = bankSize > 0 ? (idx / bankSize) : 0;
            done = Math.max(0, Math.min(10, Math.floor(ratio * 10)));
            meta = `${idx}/${bankSize}`;
        } else {
            done = getPathDone(operation, lvl.key);
            meta = `${done}/10`;
        }

        return `
          <div class="map-row" data-level="${lvl.key}">
            <div class="map-label">${lvl.label}</div>
            <div class="map-nodes" aria-label="Progresso ${lvl.label}">${makeNodes(done, 10)}</div>
            <div class="map-meta">${meta}</div>
          </div>
        `;
    }).join('');

    // clique na linha -> seleciona o nível correspondente
    rowsEl.querySelectorAll('.map-row').forEach(row => {
        row.addEventListener('click', () => {
            const lvl = row.getAttribute('data-level');
            const btn = document.querySelector(`.level-card[data-level="${lvl}"]`);
            if (btn) btn.click();
        });
    });
}


// --- UI: botão Perfil do aluno (opcional) ---
function ensureProfileUI() {
    if (document.getElementById('btn-student-profile')) return;

    const bar = document.querySelector('.settings-bar');
    if (!bar) return;

    const btn = document.createElement('button');
    btn.id = 'btn-student-profile';
    btn.className = 'setting-btn';
    btn.type = 'button';
    btn.innerHTML = '<span class="icon">👤</span> Perfil';
    bar.appendChild(btn);

    const overlay = document.createElement('div');
    overlay.id = 'profile-overlay';
    overlay.className = 'teacher-overlay hidden'; // reaproveita overlay
    overlay.innerHTML = `
      <div class="teacher-panel profile-panel" role="dialog" aria-modal="true" aria-label="Perfil do Estudante">
        <div class="teacher-panel-header">
          <h3>Perfil do estudante (opcional)</h3>
          <button id="profile-close" class="teacher-close" type="button" aria-label="Fechar">✕</button>
        </div>

        <p class="teacher-help">
          Preencha apenas se quiser que os resultados apareçam com identificação no relatório do professor.
        </p>

        <div class="teacher-panel-section">
          <label class="tp-label">Nome (ou apelido)</label>
          <input id="profile-name" class="tp-input" type="text" maxlength="50" placeholder="Ex.: Ana, João, Aluno 12">
          <label class="tp-label">Turma</label>
          <input id="profile-turma" class="tp-input" type="text" maxlength="30" placeholder="Ex.: 701, 8ºA">
          <label class="tp-label">Escola</label>
          <input id="profile-escola" class="tp-input" type="text" maxlength="60" placeholder="Ex.: E.M. ...">
          <div class="teacher-row" style="margin-top: 12px;">
            <button id="profile-save" class="btn-action" type="button">Salvar</button>
            <button id="profile-clear" class="btn-action btn-secondary" type="button">Limpar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const open = () => {
        loadStudentProfile();
        overlay.classList.remove('hidden');
        overlay.querySelector('#profile-name').value = gameState.studentProfile?.name || '';
        overlay.querySelector('#profile-turma').value = gameState.studentProfile?.turma || '';
        overlay.querySelector('#profile-escola').value = gameState.studentProfile?.escola || '';
    };
    const close = () => overlay.classList.add('hidden');

    btn.addEventListener('click', open);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#profile-close').addEventListener('click', close);

    overlay.querySelector('#profile-save').addEventListener('click', () => {
        saveStudentProfile({
            name: overlay.querySelector('#profile-name').value,
            turma: overlay.querySelector('#profile-turma').value,
            escola: overlay.querySelector('#profile-escola').value
        });
        showFeedbackMessage('Perfil salvo!', 'success', 1500);
        close();
    });

    overlay.querySelector('#profile-clear').addEventListener('click', () => {
        saveStudentProfile({ name: '', turma: '', escola: '' });
        overlay.querySelector('#profile-name').value = '';
        overlay.querySelector('#profile-turma').value = '';
        overlay.querySelector('#profile-escola').value = '';
        showFeedbackMessage('Perfil removido.', 'info', 1500);
    });
}


function carregarXP() {
    gameState.xp = parseInt(localStorage.getItem('matemagica_xp')) || 0;
    playerXPElement.textContent = `XP: ${gameState.xp}`;
}
function atualizarXP(amount) {
    gameState.xp += amount;
    playerXPElement.textContent = `XP: ${gameState.xp}`;
    localStorage.setItem('matemagica_xp', gameState.xp);
}

/** Carrega os erros do jogador do Local Storage. */
function carregarErros() {
    try {
        const errorsJson = localStorage.getItem('matemagica_errors');
        if (errorsJson) {
            gameState.errors = JSON.parse(errorsJson);
        }
    } catch (e) {
        console.error("Erro ao carregar erros do localStorage:", e);
        gameState.errors = [];
    }
}

/** Salva os erros atuais no Local Storage. */
function salvarErros() {
    try {
        // Limita o número de erros salvos para não sobrecarregar o localStorage
        const errorsToSave = gameState.errors.slice(-50); 
        localStorage.setItem('matemagica_errors', JSON.stringify(errorsToSave));
    } catch (e) {
        console.error("Erro ao salvar erros no localStorage:", e);
    }
}

// --- RANKING (Recordes + Histórico Local) ---
const RANKING_STORAGE_KEY = 'matemagica_high_scores_v1';

/** Carrega ranking (recordes) do localStorage */
function carregarRanking() {
    try {
        const raw = localStorage.getItem(RANKING_STORAGE_KEY);
        gameState.highScores = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(gameState.highScores)) gameState.highScores = [];
    } catch (e) {
        console.warn('Falha ao carregar ranking:', e);
        gameState.highScores = [];
    }
}

/** Salva ranking no localStorage */
function salvarRanking() {
    try {
        localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(gameState.highScores || []));
    } catch (e) {
        console.warn('Falha ao salvar ranking:', e);
    }
}

/** Adiciona uma partida no histórico e mantém os melhores no topo */
function registrarPartidaNoRanking(entry) {
    if (!entry) return;

    // Normaliza campos
    const safe = {
        timestamp: entry.timestamp || Date.now(),
        score: Number(entry.score || 0),
        operation: entry.operation || 'unknown',
        level: entry.level || 'unknown',
        mode: entry.mode || (gameState.isRapidMode ? 'rapido' : 'estudo'),
        submode: entry.submode || '',
        acertos: Number(entry.acertos || 0),
        erros: Number(entry.erros || 0),
        total: Number(entry.total || 0),
        accuracy: Number(entry.accuracy || 0),
        studentName: (getStudentProfile().name || ''),
        studentTurma: (getStudentProfile().turma || ''),
        studentEscola: (getStudentProfile().escola || '')
    };

    gameState.highScores.unshift(safe);

    // Ordena por score desc, depois por acurácia desc, depois mais recente
    gameState.highScores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
        return b.timestamp - a.timestamp;
    });

    // Mantém até 60 registros (suficiente para histórico local)
    if (gameState.highScores.length > 60) gameState.highScores = gameState.highScores.slice(0, 60);

    salvarRanking();
}

/** Renderiza o ranking na tela */
function renderRanking() {
    const container = document.getElementById('ranking-list-container');
    const noMsg = document.getElementById('no-records-message');
    if (!container || !noMsg) return;

    container.innerHTML = '';

    const list = gameState.highScores || [];
    if (list.length === 0) {
        noMsg.classList.remove('hidden');
        return;
    }
    noMsg.classList.add('hidden');

    // Mostra TOP 10 + Histórico recente (até 20)
    const top10 = list.slice(0, 10);
    const recent = list.slice(0, 20);

    const makeHeader = (txt) => {
        const h = document.createElement('h2');
        h.textContent = txt;
        h.style.margin = '14px 0 8px';
        h.style.fontSize = '1.1em';
        return h;
    };

    const makeItem = (e, idx) => {
        const item = document.createElement('div');
        item.className = 'ranking-item';
        const d = new Date(e.timestamp);
        const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const whoParts = [];
        if (e.studentName) whoParts.push(`Aluno: ${e.studentName}`);
        if (e.studentTurma) whoParts.push(`Turma: ${e.studentTurma}`);
        if (e.studentEscola) whoParts.push(`Escola: ${e.studentEscola}`);
        const whoStr = whoParts.length ? (whoParts.join(' • ') + ' • ') : '';

        const opMap = {
            addition: 'Adição (+)',
            subtraction: 'Subtração (−)',
            multiplication: 'Multiplicação (×)',
            division: 'Divisão (÷)',
            potenciacao: 'Potenciação',
            radiciacao: 'Radiciação'
        };

        const opLabel = opMap[e.operation] || e.operation;
        const lvlMap = { easy: 'Fácil', medium: 'Médio', advanced: 'Difícil' };
        const lvl = lvlMap[e.level] || e.level;

        item.innerHTML = `
            <div class="ranking-left">
                <div class="ranking-title"><strong>#${idx + 1}</strong> • ${opLabel} • ${lvl} • ${e.mode}${e.submode ? ' • ' + e.submode : ''}</div>
                <div class="ranking-meta">${whoStr}${dateStr} • Acertos: ${e.acertos}/${e.total} • Erros: ${e.erros} • Precisão: ${Math.round(e.accuracy)}%</div>
            </div>
            <div class="ranking-score">${e.score}</div>
        `;
        return item;
    };

    container.appendChild(makeHeader('Top 10 (Melhores pontuações)'));
    top10.forEach((e, idx) => container.appendChild(makeItem(e, idx)));

    container.appendChild(makeHeader('Histórico recente (últimas partidas)'));
    recent.forEach((e, idx) => container.appendChild(makeItem(e, idx)));
}

// --- PWA (Offline + Instalável) ---
function initPWA() {
    try {
        // Injeta o manifest sem mexer no layout do HTML
        if (!document.querySelector('link[rel="manifest"]')) {
            const link = document.createElement('link');
            link.rel = 'manifest';
            link.href = 'manifest.webmanifest';
            document.head.appendChild(link);
        }

        // Theme color para barra do navegador (especialmente mobile)
        if (!document.querySelector('meta[name="theme-color"]')) {
            const meta = document.createElement('meta');
            meta.name = 'theme-color';
            meta.content = '#111827';
            document.head.appendChild(meta);
        }

        // Service Worker (offline)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.warn('Service Worker não registrado:', err);
            });
        }
    } catch (e) {
        console.warn('Falha initPWA:', e);
    }
}

// --- PAINEL DO PROFESSOR (Rede de Ensino) ---
const TEACHER_PREFS_KEY = 'matemagica_teacher_prefs_v1';

function loadTeacherPrefs() {
    try {
        const raw = localStorage.getItem(TEACHER_PREFS_KEY);
        const prefs = raw ? JSON.parse(raw) : {};
        if (prefs && typeof prefs === 'object') {
            if (prefs.projection) document.body.classList.add('projection-mode');
            if (prefs.lowStimulus) document.body.classList.add('low-stimulus');
        }
    } catch {}
}

function saveTeacherPrefs(prefs) {
    try { localStorage.setItem(TEACHER_PREFS_KEY, JSON.stringify(prefs || {})); } catch {}
}

function initTeacherPanel() {
    // Evita duplicar
    if (document.getElementById('teacher-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'teacher-fab';
    fab.className = 'teacher-fab';
    fab.type = 'button';
    fab.title = 'Painel do Professor';
    fab.setAttribute('aria-label', 'Abrir Painel do Professor');
    fab.textContent = '👩‍🏫';
    document.body.appendChild(fab);

    const overlay = document.createElement('div');
    overlay.id = 'teacher-panel-overlay';
    overlay.className = 'teacher-overlay hidden';
    overlay.innerHTML = `
      <div class="teacher-panel" role="dialog" aria-modal="true" aria-label="Painel do Professor">
        <div class="teacher-panel-header">
          <h2>Painel do Professor</h2>
          <button id="tp-close" class="btn-secondary" type="button">Fechar</button>
        </div>

        <div class="teacher-panel-section">
          <div class="teacher-row">
            <button id="tp-projection" class="btn-action btn-secondary" type="button">Modo Projeção</button>
            <button id="tp-low" class="btn-action btn-secondary" type="button">Baixo Estímulo</button>
          </div>
          <p class="teacher-help">Use <strong>Projeção</strong> no datashow e <strong>Baixo estímulo</strong> para reduzir animações e distrações.</p>
        </div>

        <div class="teacher-panel-section">
          <div class="teacher-row">
            <button id="tp-export" class="btn-action btn-secondary" type="button">Exportar Dados</button>
            <button id="tp-import" class="btn-action btn-secondary" type="button">Importar Dados</button>
          </div>
          <p class="teacher-help">Exporta/Importa: XP, Ranking e Erros (backup local, sem internet).</p>
        </div>

        <div class="teacher-panel-section">
          <button id="tp-reset" class="btn-secondary" type="button">Resetar dados do app (neste dispositivo)</button>
          <p class="teacher-help">Cuidado: apaga ranking, XP e erros salvos apenas deste dispositivo.</p>
        </div>
      
        <div class="teacher-panel-section">
          <details class="teacher-guide">
            <summary>Guia rápido (1 minuto)</summary>
            <ul>
              <li><strong>Modo Projeção</strong>: melhora a leitura no projetor (alto contraste e tamanhos maiores).</li>
              <li><strong>Baixo Estímulo</strong>: reduz animações e flashes (bom para foco).</li>
              <li><strong>Exportar Dados</strong>: gera um arquivo JSON com ranking, erros e XP (backup / levar para outro PC).</li>
              <li><strong>Importar Dados</strong>: restaura o backup no dispositivo.</li>
              <li><strong>Perfil do estudante</strong>: na tela inicial, toque em <strong>Perfil</strong> (opcional) para registrar nome/turma/escola no relatório.</li>
            </ul>
          </details>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const prefs = (() => {
        try { return JSON.parse(localStorage.getItem(TEACHER_PREFS_KEY) || '{}'); } catch { return {}; }
    })();

    const close = () => overlay.classList.add('hidden');
    const open = () => overlay.classList.remove('hidden');

    fab.addEventListener('click', () => {
        if (overlay.classList.contains('hidden')) open(); else close();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    overlay.querySelector('#tp-close').addEventListener('click', close);

    // Toggles
    const btnProj = overlay.querySelector('#tp-projection');
    const btnLow = overlay.querySelector('#tp-low');

    const refreshBtnStates = () => {
        btnProj.classList.toggle('active', !!prefs.projection);
        btnLow.classList.toggle('active', !!prefs.lowStimulus);
        btnProj.textContent = prefs.projection ? 'Projeção: ON' : 'Modo Projeção';
        btnLow.textContent = prefs.lowStimulus ? 'Baixo estímulo: ON' : 'Baixo Estímulo';
    };

    btnProj.addEventListener('click', () => {
        prefs.projection = !prefs.projection;
        document.body.classList.toggle('projection-mode', !!prefs.projection);
        saveTeacherPrefs(prefs);
        refreshBtnStates();
    });

    btnLow.addEventListener('click', () => {
        prefs.lowStimulus = !prefs.lowStimulus;
        document.body.classList.toggle('low-stimulus', !!prefs.lowStimulus);
        saveTeacherPrefs(prefs);
        refreshBtnStates();
    });

    // Export / Import
    const exportBtn = overlay.querySelector('#tp-export');
    const importBtn = overlay.querySelector('#tp-import');

    const downloadTextFile = (filename, text) => {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
    };

    exportBtn.addEventListener('click', () => {
        const payload = {
            version: 'v12',
            exportedAt: Date.now(),
            xp: gameState.xp,
            errors: gameState.errors || [],
            highScores: gameState.highScores || [],
            teacherPrefs: prefs || {}
        };
        downloadTextFile('matemagica_backup.json', JSON.stringify(payload, null, 2));
        showFeedbackMessage('Backup exportado!', 'success');
    });

    importBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(String(reader.result || '{}'));
                    if (data.xp != null) { gameState.xp = Number(data.xp) || 0; localStorage.setItem('matemagica_xp', String(gameState.xp)); }
                    if (Array.isArray(data.errors)) { gameState.errors = data.errors; salvarErros(); }
                    if (Array.isArray(data.highScores)) { gameState.highScores = data.highScores; salvarRanking(); }
                    if (data.teacherPrefs) { saveTeacherPrefs(data.teacherPrefs); loadTeacherPrefs(); }
                    showFeedbackMessage('Backup importado! Recarregando...', 'success', 2500);
                    setTimeout(() => location.reload(), 700);
                } catch (e) {
                    showFeedbackMessage('Arquivo inválido.', 'error');
                }
            };
            reader.readAsText(file);
            input.remove();
        });

        input.click();
    });

    // Reset
    overlay.querySelector('#tp-reset').addEventListener('click', () => {
        if (!confirm('Tem certeza? Isso apaga XP, ranking e erros deste dispositivo.')) return;
        try {
            localStorage.removeItem('matemagica_xp');
            localStorage.removeItem('matemagica_errors');
            localStorage.removeItem(RANKING_STORAGE_KEY);
            localStorage.removeItem(TEACHER_PREFS_KEY);
        } catch {}
        showFeedbackMessage('Dados apagados. Recarregando...', 'info', 2000);
        setTimeout(() => location.reload(), 700);
    });

    refreshBtnStates();
}


/** Atualiza a interface (botão e lista) de treinamento de erros. */
function updateErrorTrainingButton() {
    const errorCount = gameState.errors.length;
    const hasErrors = errorCount > 0;
    
    // Na tela de resultados, mostra o botão para treinar erros se houver erros
    if (btnTreinarErros) {
        btnTreinarErros.style.display = hasErrors ? 'inline-block' : 'none';
    }
    
    // Na tela de Treinamento de Erros, atualiza a mensagem e botões
    if (errorCountMessage) {
        errorCountMessage.textContent = hasErrors 
            ? `Você tem ${errorCount} erro(s) salvo(s) para treinar.`
            : 'Nenhum erro salvo ainda. Comece a jogar para identificarmos seus pontos fracos!';
    }
    
    if (btnStartTraining) {
        btnStartTraining.disabled = !hasErrors;
        btnStartTraining.textContent = hasErrors 
            ? `Começar Treinamento com ${errorCount} Erros`
            : 'Começar Treinamento';
    }
    
    if (btnClearErrors) {
        btnClearErrors.disabled = !hasErrors;
    }

    if (errorListContainer) {
        displayErrorList();
    }
}

/** Exibe a lista dos últimos erros na tela de treinamento. */
function displayErrorList() {
    if (!errorListContainer) return;

    errorListContainer.innerHTML = '';
    
    // Mostra apenas os 10 últimos erros (mais recentes)
    const errorsToShow = gameState.errors.slice(-10).reverse();

    if (errorsToShow.length === 0) {
        errorListContainer.innerHTML = '<p class="incentive-message" style="text-align: center;">Jogue o Modo Rápido e erre para ver seus erros aqui!</p>';
        return;
    }

    errorsToShow.forEach(error => {
        const item = document.createElement('div');
        item.classList.add('error-item');
        
        // Formata a data (opcional, para ser mais legível)
        const date = new Date(error.timestamp).toLocaleDateString('pt-BR');
        
        item.innerHTML = `
            <div>
                <strong>Questão: ${error.question}</strong>
                <p>Sua Resposta: <span class="wrong-answer">${error.userAnswer}</span></p>
                <p>Resposta Correta: <span class="correct-answer">${error.correctAnswer}</span></p>
            </div>
            <p style="font-size: 0.8em; color: var(--cor-texto-principal); opacity: 0.7;">
                ${error.operation.toUpperCase()} | Errado em: ${date}
            </p>
        `;
        errorListContainer.appendChild(item);
    });
}

// --- TREINAMENTO DE ERROS (Modo Professor / Reforço) ---
function buildQuestionFromError(err) {
    // Preferência: usar num1/num2 quando disponível
    const op = err.operation || 'addition';
    let num1 = err.num1;
    let num2 = err.num2;

    // Fallback: tentar extrair da string
    if ((num1 == null || num2 == null) && typeof err.question === 'string') {
        const q = err.question;
        const mAdd = q.match(/(\d+)\s*\+\s*(\d+)/);
        const mSub = q.match(/(\d+)\s*[−-]\s*(\d+)/);
        const mMul = q.match(/(\d+)\s*[x×]\s*(\d+)/);
        const mDiv = q.match(/(\d+)\s*[÷/]\s*(\d+)/);
        const mPow = q.match(/(\d+)\s*(?:\^|⁰|¹|²|³|⁴|⁵|⁶|⁷|⁸|⁹)/); // base pelo menos

        if (mAdd) { num1 = parseInt(mAdd[1]); num2 = parseInt(mAdd[2]); }
        else if (mSub) { num1 = parseInt(mSub[1]); num2 = parseInt(mSub[2]); }
        else if (mMul) { num1 = parseInt(mMul[1]); num2 = parseInt(mMul[2]); }
        else if (mDiv) { num1 = parseInt(mDiv[1]); num2 = parseInt(mDiv[2]); }
        else if (mPow) {
            // tenta achar expoente sobrescrito (último char numérico sobrescrito)
            const base = parseInt(q);
            const sup = q.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/);
            if (Number.isFinite(base) && sup) {
                num1 = base;
                // converte sobrescrito
                const map = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9'};
                num2 = parseInt(sup[0].split('').map(c=>map[c]||'').join(''));
            }
        }
    }

    // monta um objeto de questão no formato do jogo
    // se num1/num2 faltarem, gera aleatória para não travar
    if (num1 == null || num2 == null) {
        const q = generateQuestion(op);
        q.answer = err.correctAnswer;
        q.question = err.question;
        q.voiceQuestion = err.question;
        return q;
    }

    // Gera opções plausíveis em torno da correta
    const correct = Number(err.correctAnswer);
    const options = new Set([correct]);
    while (options.size < 4) {
        const delta = randomInt(1, Math.max(3, Math.round(Math.abs(correct) * 0.25)));
        const sign = (Math.random() < 0.5) ? -1 : 1;
        const candidate = correct + sign * delta;
        options.add(candidate);
    }
    const opts = Array.from(options);
    shuffleArray(opts);

    let questionStr = '';
    let voiceQ = '';
    switch (op) {
        case 'addition':
            questionStr = `${num1} + ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} mais ${num2}?`;
            break;
        case 'subtraction':
            questionStr = `${num1} − ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} menos ${num2}?`;
            break;
        case 'multiplication':
            questionStr = `${num1} × ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} vezes ${num2}?`;
            break;
        case 'division':
            questionStr = `${num1} ÷ ${num2} = ?`;
            voiceQ = `Qual é o resultado de ${num1} dividido por ${num2}?`;
            break;
        case 'potenciacao': {
            const expSup = toSuperscript(num2);
            questionStr = `${num1}${expSup} = ?`;
            voiceQ = `${num1} elevado a ${num2}. Qual é o resultado?`;
            break;
        }
        case 'radiciacao':
            questionStr = `√${num1} = ?`;
            voiceQ = `Qual é a raiz quadrada de ${num1}?`;
            break;
        default:
            questionStr = `${err.question || ''}`;
            voiceQ = `${err.question || ''}`;
            break;
    }

    return {
        question: questionStr,
        voiceQuestion: voiceQ,
        answer: correct,
        options: opts,
        voiceOptions: opts,
        operacao: op,
        num1: num1,
        num2: num2
    };
}

function startErrorTraining() {
    if (!Array.isArray(gameState.errors) || gameState.errors.length === 0) {
        showFeedbackMessage('Sem erros para treinar.', 'info');
        return;
    }

    // Configura modo treinamento
    gameState.isTrainingErrors = true;
    gameState.isRapidMode = false; // treinamento sem tempo
    modeEstudoBtn.classList.add('active');
    modeRapidoBtn.classList.remove('active');
    stopTimer();

    // Desabilita "mostrar resposta" e "tempo" durante o treino (foco em acerto)
    if (btnShowAnswer) btnShowAnswer.disabled = true;
    if (btnExtendTime) btnExtendTime.disabled = true;

    // Monta fila (mais recentes primeiro) – pode ajustar se quiser
    const queue = gameState.errors.slice(0, 25).map(buildQuestionFromError);
    gameState.trainingQueue = queue;
    gameState.trainingIndex = 0;

    // Define total e inicia
    gameState.totalQuestions = queue.length;
    gameState.questionNumber = 0;
    gameState.score = 0;
    gameState.acertos = 0;
    gameState.erros = 0;
    gameState.isGameActive = true;
    gameState.isTrainingErrors = false;
    gameState.attemptsThisQuestion = 0;
    if (btnShowAnswer) btnShowAnswer.disabled = false;
    if (btnExtendTime) btnExtendTime.disabled = false;

    exibirTela('game-screen');
    nextTrainingQuestion();
}

function nextTrainingQuestion() {
    const q = gameState.trainingQueue[gameState.trainingIndex];
    if (!q) {
        endTraining();
        return;
    }

    gameState.questionNumber++;
    gameState.currentQuestion = q;
    gameState.attemptsThisQuestion = 0;

    // UI
    questionCounter.textContent = `Treino: ${gameState.trainingIndex + 1}/${gameState.trainingQueue.length}`;
    questionText.textContent = q.question;

    // Carrega opções
    answerOptions.forEach((btn, i) => {
        btn.classList.remove('correct', 'wrong');
        btn.disabled = false;
        const numEl = btn.querySelector('.option-number');
        const txtEl = btn.querySelector('.answer-text');
        if (numEl) numEl.textContent = `${i + 1})`;
        if (txtEl) txtEl.textContent = q.options[i];
    });

    // Progresso do ciclo: reusa badge existente
    updateCycleProgressUI();

    // Voz
    speakSequence(buildVoiceTextsForQuestion(q));
}

function endTraining() {
    gameState.isGameActive = false;
    gameState.isTrainingErrors = false;

    // Reabilita botões
    if (btnShowAnswer) btnShowAnswer.disabled = false;
    if (btnExtendTime) btnExtendTime.disabled = false;

    showFeedbackMessage('Treinamento concluído! 🎯', 'success', 2500);
    exibirTela('result-screen');
}



// --- LÓGICA DO JOGO: GERAÇÃO DE QUESTÕES ---

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


function toSuperscript(num) {
    // Converte número inteiro para caracteres sobrescritos Unicode (ex.: 3 -> ³, 12 -> ¹²)
    const map = {
        '0': '⁰','1': '¹','2': '²','3': '³','4': '⁴','5': '⁵','6': '⁶','7': '⁷','8': '⁸','9': '⁹','-': '⁻'
    };
    return String(num).split('').map(ch => map[ch] ?? ch).join('');
}


// --- HELPERS (Tabuada e UI) ---
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function rangeInclusive(min, max) {
    const out = [];
    for (let i = min; i <= max; i++) out.push(i);
    return out;
}



// Mapeia nível → faixa de tabuadas (Multiplicação)
function getTabuadaRangeByLevel(level) {
    switch (level) {
        case 'easy':
            // Fácil: tabuadas 0–5, multiplicadores 0–10
            return { min: 0, max: 5, multMin: 0, multMax: 10, label: 'Fácil (0–5 | ×0–10)' };
        case 'medium':
            // Médio: tabuadas 6–10, multiplicadores 0–10
            return { min: 6, max: 10, multMin: 0, multMax: 10, label: 'Médio (6–10 | ×0–10)' };
        case 'advanced':
            // Difícil: tabuadas 11–20, multiplicadores 0–20
            return { min: 11, max: 20, multMin: 0, multMax: 20, label: 'Difícil (11–20 | ×0–20)' };
        default:
            return { min: 0, max: 20, multMin: 0, multMax: 20, label: 'Completo (0–20 | ×0–20)' };
    }
}

function loadMultiplicationConfig() {
    try {
        const raw = localStorage.getItem('matemagica_mult_cfg');
        if (!raw) return;
        const cfg = JSON.parse(raw);
        if (!cfg || typeof cfg !== 'object') return;

        if (typeof cfg.mode === 'string') gameState.multiplication.mode = cfg.mode;
        if (Number.isInteger(cfg.tabuada)) gameState.multiplication.tabuada = cfg.tabuada;

        if (Number.isInteger(cfg.trailMin)) gameState.multiplication.trailMin = cfg.trailMin;
        if (Number.isInteger(cfg.trailMax)) gameState.multiplication.trailMax = cfg.trailMax;
        if (Number.isInteger(cfg.multMin)) gameState.multiplication.multMin = cfg.multMin;
        if (Number.isInteger(cfg.multMax)) gameState.multiplication.multMax = cfg.multMax;

        // chave (tabuadas|multiplicadores)
        if (typeof cfg.trailRangeKey === 'string') gameState.multiplication.trailRangeKey = cfg.trailRangeKey;

        // trilha (pares)
        const tabMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
        const tabMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
        const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
        const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
        const expectedLen = Math.max(0, (tabMax - tabMin + 1)) * Math.max(0, (multMax - multMin + 1));

        if (Array.isArray(cfg.trailPairs) && cfg.trailPairs.length === expectedLen) {
            gameState.multiplication.trailPairs = cfg.trailPairs;
        }
        if (Number.isInteger(cfg.trailPairIndex)) gameState.multiplication.trailPairIndex = cfg.trailPairIndex;

        // saneia índice
        if (gameState.multiplication.trailPairIndex < 0 || gameState.multiplication.trailPairIndex >= expectedLen) {
            gameState.multiplication.trailPairIndex = 0;
        }
    } catch (e) {
        console.warn("Falha ao carregar config de multiplicação:", e);
    }
}

function saveMultiplicationConfig() {
    try {
        const payload = {
            mode: gameState.multiplication.mode,
            tabuada: gameState.multiplication.tabuada,
            trailMin: gameState.multiplication.trailMin,
            trailMax: gameState.multiplication.trailMax,
            multMin: gameState.multiplication.multMin,
            multMax: gameState.multiplication.multMax,
            trailRangeKey: gameState.multiplication.trailRangeKey,
            trailPairs: gameState.multiplication.trailPairs,
            trailPairIndex: gameState.multiplication.trailPairIndex
        };
        localStorage.setItem('matemagica_mult_cfg', JSON.stringify(payload));
    
        // também salva o progresso por faixa (para o mapa e para alternar níveis sem perder o ponto)
        try { setSavedTrailIndexForKey(gameState.multiplication.trailRangeKey, gameState.multiplication.trailPairIndex); } catch (_) {}
} catch (e) {
        console.warn("Falha ao salvar config de multiplicação:", e);
    }
}

function buildTrailPairs(tabMin, tabMax, multMin, multMax) {
    const pairs = [];
    for (let t = tabMin; t <= tabMax; t++) {
        for (let m = multMin; m <= multMax; m++) {
            pairs.push([t, m]);
        }
    }
    return pairs;
}

function ensureTrailPairs(tabMin = gameState.multiplication.trailMin, tabMax = gameState.multiplication.trailMax, multMin = gameState.multiplication.multMin, multMax = gameState.multiplication.multMax) {
    // sanitiza
    if (!Number.isInteger(tabMin)) tabMin = 0;
    if (!Number.isInteger(tabMax)) tabMax = 20;
    if (tabMin > tabMax) [tabMin, tabMax] = [tabMax, tabMin];

    if (!Number.isInteger(multMin)) multMin = 0;
    if (!Number.isInteger(multMax)) multMax = 20;
    if (multMin > multMax) [multMin, multMax] = [multMax, multMin];

    const tabCount = (tabMax - tabMin + 1);
    const multCount = (multMax - multMin + 1);
    const expectedLen = Math.max(0, tabCount) * Math.max(0, multCount);

    const key = `${tabMin}-${tabMax}|${multMin}-${multMax}`;
    const sameKey = gameState.multiplication.trailRangeKey === key;

    if (!Array.isArray(gameState.multiplication.trailPairs) ||
        gameState.multiplication.trailPairs.length !== expectedLen ||
        !sameKey
    ) {
        gameState.multiplication.trailPairs = shuffleArray(buildTrailPairs(tabMin, tabMax, multMin, multMax));
        // Restaura o ponto do ciclo dessa faixa (se existir)
        const savedIdx = getSavedTrailIndexForKey(key, expectedLen);
        gameState.multiplication.trailPairIndex = savedIdx;


        gameState.multiplication.trailMin = tabMin;
        gameState.multiplication.trailMax = tabMax;
        gameState.multiplication.multMin = multMin;
        gameState.multiplication.multMax = multMax;
        gameState.multiplication.trailRangeKey = key;
        saveMultiplicationConfig();
    }

    // garante índice válido
    if (!Number.isInteger(gameState.multiplication.trailPairIndex) || gameState.multiplication.trailPairIndex < 0 || gameState.multiplication.trailPairIndex >= expectedLen) {
        gameState.multiplication.trailPairIndex = 0;
    }
}

function getNextTrailPair() {
    ensureTrailPairs();
    const pairs = Array.isArray(gameState.multiplication.trailPairs) ? gameState.multiplication.trailPairs : [];
    if (pairs.length === 0) return [0, 0];

    if (gameState.multiplication.trailPairIndex >= pairs.length) {
        // completou o ciclo → nova ordem aleatória
        const tabMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
        const tabMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
        const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
        const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
        gameState.multiplication.trailPairs = shuffleArray(buildTrailPairs(tabMin, tabMax, multMin, multMax));
        gameState.multiplication.trailPairIndex = 0;
    }

    const pair = gameState.multiplication.trailPairs[gameState.multiplication.trailPairIndex];
    gameState.multiplication.trailPairIndex++;
    saveMultiplicationConfig();
    return pair;
}

function getTrailPairsBankSize(tabMin, tabMax, multMin, multMax) {
    const tCount = Math.max(0, (tabMax - tabMin + 1));
    const mCount = Math.max(0, (multMax - multMin + 1));
    return tCount * mCount;
}

// Modo direto: multiplicadores embaralhados para a tabuada escolhida
function prepareRoundMultipliersForCurrentLevel() {
    const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
    const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
    gameState.multiplication.roundMultipliers = shuffleArray(rangeInclusive(multMin, multMax));
    gameState.multiplication.roundPos = 0;
}

function getNextRoundMultiplier() {
    const multMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
    const multMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
    const expectedLen = (multMax - multMin + 1);

    if (!Array.isArray(gameState.multiplication.roundMultipliers) || gameState.multiplication.roundMultipliers.length !== expectedLen) {
        prepareRoundMultipliersForCurrentLevel();
    }
    if (gameState.multiplication.roundPos >= gameState.multiplication.roundMultipliers.length) {
        prepareRoundMultipliersForCurrentLevel();
    }
    const v = gameState.multiplication.roundMultipliers[gameState.multiplication.roundPos];
    gameState.multiplication.roundPos++;
    return v;
}

// --- UI: Progresso do ciclo (Tabuada) ---
function ensureCycleProgressBadge() {
    if (cycleProgressBadge) return cycleProgressBadge;
    const el = document.createElement('div');
    el.id = 'mm-cycle-progress';
    el.className = 'mm-cycle-progress';
    el.style.display = 'none';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    cycleProgressBadge = el;
    return el;
}

function hideCycleProgressBadge() {
    const el = ensureCycleProgressBadge();
    el.style.display = 'none';
}

function updateCycleProgressUI() {
    const el = ensureCycleProgressBadge();

    const isMultiplication = (gameState.currentOperation === 'multiplication');
    const hasMultCfg = !!(gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail'));
    const isGameScreen = (gameState.currentScreen === 'game-screen');

    if (!isGameScreen || !isMultiplication || !hasMultCfg) {
        el.style.display = 'none';
        return;
    }

    // Trilha: mostra progresso do ciclo (ex.: 34/66)
    if (gameState.multiplication.mode === 'trail') {
        const tMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
        const tMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
        const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
        const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
        const bankSize = getTrailPairsBankSize(tMin, tMax, mMin, mMax);

        const current = Math.min(Math.max(Number(gameState.multiplication.trailPairIndex || 0), 0), bankSize);
        el.textContent = `Progresso do ciclo: ${current}/${bankSize}`;
        el.style.display = 'inline-flex';
        return;
    }

    // Direto: mostra progresso da tabuada (ex.: 6/11)
    const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
    const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
    const total = Math.max(0, (mMax - mMin + 1));
    const current = Math.min(Math.max(Number(gameState.multiplication.roundPos || 0), 0), total);
    el.textContent = `Progresso da tabuada: ${current}/${total}`;
    el.style.display = 'inline-flex';
}



// Modal: escolha de Tabuada / Trilha
function ensureMultiplicationModal() {
    if (document.getElementById('mm-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'mm-modal-overlay';
    overlay.className = 'mm-modal-overlay hidden';
    overlay.innerHTML = `
        <div class="mm-modal" role="dialog" aria-modal="true" aria-label="Configuração da multiplicação">
            <div class="mm-modal-header">
                <h2>Multiplicação — Tabuada</h2>
                <button class="mm-close" type="button" aria-label="Fechar">✕</button>
            </div>
            <p class="mm-sub" id="mm-range-line">Nível: —</p>
            <p class="mm-sub">Escolha como você quer treinar:</p>

            <div class="mm-actions">
                <button type="button" class="mm-btn mm-primary" data-mm="trail">🗺️ Trilha automática</button>
                <button type="button" class="mm-btn" data-mm="direct">🎯 Escolher tabuada</button>
            </div>

            <div class="mm-direct hidden" aria-label="Escolher tabuada">
                <p class="mm-sub2" id="mm-direct-title">Selecione a tabuada:</p>
                <div class="mm-grid" id="mm-grid"></div>
            </div>

            <div class="mm-footer">
                <small id="mm-footer-tip">Dica: a trilha percorre as tabuadas desta faixa em uma ordem aleatória.</small>
            </div>
        </div>
`;
    document.body.appendChild(overlay);

    const getCurrentRange = () => getTabuadaRangeByLevel(gameState.multiplication.pendingLevel || gameState.currentLevel || 'medium');

    const renderRangeTexts = () => {
        const r = getCurrentRange();
        const rangeLine = overlay.querySelector('#mm-range-line');
        const footerTip = overlay.querySelector('#mm-footer-tip');
        const directTitle = overlay.querySelector('#mm-direct-title');
        if (rangeLine) rangeLine.textContent = `Nível: ${r.label} — Tabuadas ${r.min} a ${r.max} — Multiplicadores ${r.multMin} a ${r.multMax}`;
        if (footerTip) footerTip.textContent = `Dica: a trilha percorre as tabuadas de ${r.min} a ${r.max} em ordem aleatória, usando multiplicadores de ${r.multMin} a ${r.multMax} (também em ordem aleatória).`;
        if (directTitle) directTitle.textContent = `Selecione a tabuada (${r.min} a ${r.max}):`;
    };

    const renderTabuadaGrid = () => {
        const r = getCurrentRange();
        const grid = overlay.querySelector('#mm-grid');
        if (!grid) return;
        grid.innerHTML = '';
        for (let i = r.min; i <= r.max; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mm-grid-btn';
            b.textContent = String(i);
            b.addEventListener('click', () => {
                gameState.multiplication.mode = 'direct';
                gameState.multiplication.tabuada = i;
                // persiste a faixa atual também
                gameState.multiplication.trailMin = r.min;
                gameState.multiplication.trailMax = r.max;
                gameState.multiplication.trailRangeKey = `${r.min}-${r.max}|${r.multMin}-${r.multMax}`;
                gameState.multiplication.multMin = r.multMin;
                gameState.multiplication.multMax = r.multMax;
                saveMultiplicationConfig();
                close();
                startGame('multiplication', gameState.multiplication.pendingLevel || gameState.currentLevel || 'medium');
            });
            grid.appendChild(b);
        }
    };

    // Render inicial (atualiza quando abrir)
    renderRangeTexts();

    const close = () => overlay.classList.add('hidden');
    overlay.querySelector('.mm-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    // Botões principais
    overlay.querySelector('[data-mm="trail"]').addEventListener('click', () => {
        const r = getCurrentRange();
        gameState.multiplication.mode = 'trail';
        // define a faixa do nível e cria ordem aleatória só dentro dela
        // prepara a trilha com TODAS as contas da faixa (sem repetir até completar)
        ensureTrailPairs(r.min, r.max, r.multMin, r.multMax);
        saveMultiplicationConfig();
        close();
        startGame('multiplication', gameState.multiplication.pendingLevel || gameState.currentLevel || 'medium');
    });

    overlay.querySelector('[data-mm="direct"]').addEventListener('click', () => {
        overlay.querySelector('.mm-direct').classList.remove('hidden');
        renderRangeTexts();
        renderTabuadaGrid();
    });
}

function openMultiplicationConfig(level) {
    ensureMultiplicationModal();
    gameState.multiplication.pendingLevel = level;

    // Ajusta a faixa de tabuadas conforme o nível selecionado
    const r = getTabuadaRangeByLevel(level);
    gameState.multiplication.trailMin = r.min;
    gameState.multiplication.trailMax = r.max;
    gameState.multiplication.trailRangeKey = `${r.min}-${r.max}|${r.multMin}-${r.multMax}`;
    gameState.multiplication.multMin = r.multMin;
    gameState.multiplication.multMax = r.multMax;
    saveMultiplicationConfig();

    const overlay = document.getElementById('mm-modal-overlay');
    if (!overlay) return;

    // Atualiza textos do modal para a faixa do nível
    const rangeLine = overlay.querySelector('#mm-range-line');
    const footerTip = overlay.querySelector('#mm-footer-tip');
    const directTitle = overlay.querySelector('#mm-direct-title');
    if (rangeLine) rangeLine.textContent = `Nível: ${r.label} — Tabuadas ${r.min} a ${r.max} — Multiplicadores ${r.multMin} a ${r.multMax}`;
    if (footerTip) footerTip.textContent = `Dica: a trilha percorre as tabuadas de ${r.min} a ${r.max} em ordem aleatória, usando multiplicadores de ${r.multMin} a ${r.multMax} (também em ordem aleatória).`;
    if (directTitle) directTitle.textContent = `Selecione a tabuada (${r.min} a ${r.max}):`;

    overlay.classList.remove('hidden');
}

/**
 * Gera uma questão matemática baseada na operação e nível de dificuldade.
 * @param {string} operation - A operação matemática.
 * @returns {object} { question: string, answer: number, options: number[] }
 */
function generateQuestion(operation) {
    let num1, num2, answer, questionString, questionSpeak;
    
    // Define o fator de dificuldade baseado no nível
    let diffFactor;
    switch (gameState.currentLevel) {
        case 'easy':
            diffFactor = 1;
            break;
        case 'medium':
            diffFactor = 2;
            break;
        case 'advanced':
            diffFactor = 3;
            break;
        default:
            diffFactor = 1;
    } 

    switch (operation) {
        case 'addition':
            // Números maiores com o aumento do diffFactor
            num1 = randomInt(10 * diffFactor, 50 * diffFactor); 
            num2 = randomInt(5 * diffFactor, 25 * diffFactor);
            answer = num1 + num2;
            questionString = `${num1} + ${num2}`;
            questionSpeak = `${num1} mais ${num2}`;
            break;
        case 'subtraction':
            num1 = randomInt(20 * diffFactor, 80 * diffFactor);
            num2 = randomInt(5 * diffFactor, num1 - (10 * diffFactor));
            answer = num1 - num2;
            questionString = `${num1} - ${num2}`;
            questionSpeak = `${num1} menos ${num2}`;
            break;
        case 'multiplication':
            // Tabuada — modo direto (uma tabuada) ou trilha (todas as contas do nível)
            if (gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail')) {
                if (gameState.multiplication.mode === 'trail') {
                    const pair = getNextTrailPair(); // [tabuada, multiplicador]
                    num1 = pair[0];
                    num2 = pair[1];
                    // mantém a tabuada atual para relatórios/feedback
                    gameState.multiplication.tabuada = num1;
                } else {
                    const t = gameState.multiplication.tabuada;
                    const m = getNextRoundMultiplier(); // multiplicadores do nível (ordem embaralhada)
                    num1 = t;
                    num2 = m;
                }
                answer = num1 * num2;
                questionString = `${num1} x ${num2}`;
                questionSpeak = `${num1} vezes ${num2}`;
            } else {
                // (modo livre antigo) Tabuadas mais altas no nível avançado
                num1 = randomInt(2, diffFactor < 3 ? 12 : 25);
                num2 = randomInt(2, diffFactor < 3 ? 10 : 15);
                answer = num1 * num2;
                questionString = `${num1} x ${num2}`;
                questionSpeak = `${num1} vezes ${num2}`;
            }
            break;
        case 'division':
            let divisor = randomInt(2, diffFactor < 3 ? 8 : 12);
            let quotient = randomInt(2, diffFactor < 3 ? 10 : 20);
            num1 = divisor * quotient;
            num2 = divisor;
            answer = quotient;
            questionString = `${num1} ÷ ${num2}`;
            questionSpeak = `${num1} dividido por ${num2}`;
            break;
        case 'potenciacao':
            // Potências: exibir como 2³ e ler como “2 elevado a 3” no modo voz
            num1 = randomInt(2, diffFactor < 3 ? 5 : 8);
            num2 = randomInt(2, diffFactor < 3 ? 4 : 5);
            answer = Math.pow(num1, num2);
            questionString = `${num1}${toSuperscript(num2)}`;
            questionSpeak = `${num1} elevado a ${num2}`;
            break;
        case 'radiciacao':
            // Raízes quadradas maiores no nível avançado
            answer = randomInt(2, diffFactor < 3 ? 12 : 15);
            num1 = answer * answer;
            questionString = `√${num1}`;
            questionSpeak = `raiz quadrada de ${num1}`;
            break;
        default:
            return { question: "Erro", answer: 0, options: [0, 1, 2, 3] };
    }

    // Gera as opções de resposta
    const options = [answer];
    while (options.length < 4) {
        let diffFactorOptions = Math.max(1, Math.round(Math.abs(answer) * 0.1));
        let incorrect = answer + randomInt(-5 * diffFactorOptions, 5 * diffFactorOptions);
        
        if (incorrect >= 0 && !options.includes(incorrect) && incorrect !== answer) {
            options.push(incorrect);
        }
    }

    // Embaralha as opções
    for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
    }

    
    // Texto para leitura em voz (se não definido, usa o mesmo do display)
    if (!questionSpeak) questionSpeak = questionString;

return { 
        question: questionString + ' = ?',
        voiceQuestion: questionSpeak, 
        answer: answer, 
        options: options,
        // Informação extra para salvar erro
        operacao: operation,
        num1: num1,
        num2: num2
    };
}


// --- LÓGICA DE CONTROLE DE FLUXO E ESTADO DE JOGO ---

/**
 * Inicia o jogo após a seleção da operação e do nível.
 * @param {string} operation - A operação selecionada.
 * @param {string} level - O nível selecionado ('easy', 'medium', 'advanced').
 */
function startGame(operation, level) {
    if (!operation || !level) {
        showFeedbackMessage("Erro: Operação ou Nível não selecionados!", 'error');
        exibirTela('home-screen');
        return;
    }

    // 1. Resetar o estado do jogo
    gameState.currentOperation = operation;
    gameState.currentLevel = level;
 
    gameState.isGameActive = true;
    gameState.score = 0;
    gameState.questionNumber = 0;
    gameState.acertos = 0;
    gameState.erros = 0;
    
    gameState.totalQuestions = gameState.isRapidMode ? 20 : Infinity;

    // --- Configuração especial: Tabuada da Multiplicação (por níveis) ---
if (operation === 'multiplication' && gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail')) {
    const r = getTabuadaRangeByLevel(level);

    // Aplica a faixa do nível: tabuadas e multiplicadores
    gameState.multiplication.trailMin = r.min;
    gameState.multiplication.trailMax = r.max;
    gameState.multiplication.multMin = r.multMin;
    gameState.multiplication.multMax = r.multMax;
    gameState.multiplication.trailRangeKey = `${r.min}-${r.max}|${r.multMin}-${r.multMax}`;

    // Garante tabuada válida (modo direto)
    if (!Number.isInteger(gameState.multiplication.tabuada) || gameState.multiplication.tabuada < r.min || gameState.multiplication.tabuada > r.max) {
        gameState.multiplication.tabuada = r.min;
    }

    if (gameState.multiplication.mode === 'trail') {
        // Trilha: TODAS as contas do nível, em ordem aleatória (sem repetir até completar)
        ensureTrailPairs(r.min, r.max, r.multMin, r.multMax);
    } else {
        // Direto: multiplicadores embaralhados para a tabuada escolhida
        prepareRoundMultipliersForCurrentLevel();
    }

    // Quantidade de questões por sessão:
    // ✅ Modo Rápido TAMBÉM percorre o banco completo do nível (ciclo inteiro, sem repetir)
    // - Trilha: percorre TODAS as contas da faixa do nível (ex.: 66/55/210), respeitando progresso salvo.
    // - Direto: percorre todos os multiplicadores do nível para a tabuada escolhida.
    const bankSize = (gameState.multiplication.mode === 'trail')
        ? getTrailPairsBankSize(r.min, r.max, r.multMin, r.multMax)
        : (r.multMax - r.multMin + 1);

    if (gameState.multiplication.mode === 'trail') {
        // Se já houver progresso salvo no ciclo, joga apenas o restante para fechar o ciclo.
        const idx = Number.isInteger(gameState.multiplication.trailPairIndex) ? gameState.multiplication.trailPairIndex : 0;
        const remaining = Math.max(0, bankSize - idx);
        gameState.totalQuestions = remaining > 0 ? remaining : bankSize;
    } else {
        gameState.totalQuestions = bankSize;
    }

    saveMultiplicationConfig();
}




    // 2. Configura o tempo máximo baseado no nível e acessibilidade
    let baseTime;
    switch (level) {
        case 'easy':
            baseTime = 150; // 15s (10 ticks/s)
            break;
        case 'medium':
            baseTime = 300; // 30s
            break;
        case 'advanced':
            baseTime = 450; // 45s
            break;
        default:
            baseTime = 300;
    }

    // Regra de Acessibilidade: Dobra o tempo se o Modo Rápido estiver ativo E Acessibilidade (Voz ou Libras) estiver ativa
    const isLibrasActive = document.body.classList.contains('libras-mode');
    const isAccessibilityActive = gameState.isVoiceReadActive || isLibrasActive;
    
    // Atualiza o tempo máximo. Se não for Modo Rápido, o tempo é infinito
    if (gameState.isRapidMode) {
        gameState.maxTime = isAccessibilityActive ? baseTime * 2 : baseTime;
    } else {
        gameState.maxTime = Infinity;
    }
    
    gameState.timeLeft = gameState.maxTime;


    // 3. Atualizar UI do Game Header
    playerScoreElement.textContent = `0 Pontos`;
    
    // 4. Configurações de UI para Modo Estudo vs Rápido
    const timeContainer = timeBar.parentElement;
    if (!gameState.isRapidMode) {
        timeContainer.style.display = 'none';
        btnExtendTime.style.display = 'none';
        btnShowAnswer.style.display = 'block'; // Ajuda é foco no modo Estudo
    } else {
        timeContainer.style.display = 'block';
        btnExtendTime.style.display = 'block';
        btnShowAnswer.style.display = 'block';
        timeBar.style.width = '100%';
        timeBar.style.backgroundColor = 'var(--cor-sucesso)';
    }

    // 5. Iniciar o ciclo de perguntas
    nextQuestion();
    
    // 6. Iniciar o Timer (Se for Modo Rápido)
    if (gameState.isRapidMode) {
        startTimer();
    }

    // 7. Mudar para a tela de jogo
    exibirTela('game-screen');

    // Mostra/atualiza o progresso do ciclo da Tabuada (se aplicável)
    updateCycleProgressUI();
}


function nextQuestion() {
    // Fim de jogo (Modo Rápido) OU rodada completa da Tabuada (modo direto/trilha)
    const isTabuadaRound = (gameState.currentOperation === 'multiplication' && gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail'));
    if ((gameState.isRapidMode && gameState.questionNumber >= gameState.totalQuestions) || (isTabuadaRound && gameState.questionNumber >= gameState.totalQuestions)) {
        endGame();
        return;
    }
gameState.questionNumber++;
    
    // 1. Gerar nova questão 
    const newQ = generateQuestion(gameState.currentOperation);
    gameState.currentQuestion = newQ;
    gameState.attemptsThisQuestion = 0;
// 2. Atualizar UI
    const totalDisplay = (gameState.isRapidMode || isTabuadaRound) ? gameState.totalQuestions : '∞';
    questionCounter.textContent = `Questão: ${gameState.questionNumber}/${totalDisplay}`;
    questionText.textContent = newQ.question;

    // Atualiza badge de progresso do ciclo (Tabuada)
    updateCycleProgressUI();
    
    // 3. Atualizar opções de resposta
    answerOptions.forEach((btn, index) => {
        // Garante o prefixo "1) 2) 3) 4)" (menor que o número da resposta)
        let idxSpan = btn.querySelector('.answer-index');
        const txtSpan = btn.querySelector('.answer-text');
        if (!idxSpan) {
            idxSpan = document.createElement('span');
            idxSpan.className = 'answer-index';
            btn.insertBefore(idxSpan, txtSpan);
        }
        idxSpan.textContent = `${index + 1})`;

        // Usa o texto da opção gerada
        txtSpan.textContent = newQ.options[index];
        btn.classList.remove('correct', 'wrong');
        btn.disabled = false;
    });

    // 4. Leitura de Voz
    announceCurrentQuestion();
}


/** Salva a pergunta que foi respondida incorretamente e persiste no localStorage. */
function saveError(question, userAnswer) {
    const errorData = {
        question: question.question,
        correctAnswer: question.answer,
        userAnswer: userAnswer,
        operation: question.operacao,
        num1: question.num1 ?? null,
        num2: question.num2 ?? null,
        // para potenciação, num2 é o expoente
        timestamp: Date.now()
    };
    gameState.errors.unshift(errorData);
    salvarErros();
}


function handleAnswer(selectedAnswer, selectedButton) {
    if (!gameState.isGameActive) return;
    if (gameState.answerLocked) return;
    if (selectedButton && selectedButton.disabled) return;

    const q = gameState.currentQuestion;
    if (!q) return;

    const isTraining = !!gameState.isTrainingErrors;
    const isCorrect = selectedAnswer === q.answer;

    // Trava clique duplo muito rápido
    gameState.answerLocked = true;
    setTimeout(() => { gameState.answerLocked = false; }, 220);

    // Em treino: sem timer. No jogo: só para o timer quando for finalizar a questão.
    if (isTraining) {
        stopTimer();
    }

    // Estilo: destaca o botão clicado
    if (selectedButton) {
        selectedButton.classList.remove('correct', 'wrong');
        selectedButton.classList.add(isCorrect ? 'correct' : 'wrong');
    }

    if (isCorrect) {
        // Finaliza (correto)
        if (gameState.isRapidMode && !isTraining) stopTimer();

        // Desabilita todos os botões
        answerOptions.forEach(btn => btn.disabled = true);

        // Marca a correta (caso tenha clicado em outra por algum bug)
        answerOptions.forEach(btn => {
            const v = parseInt(btn.querySelector('.answer-text').textContent);
            if (v === q.answer) btn.classList.add('correct');
        });

        // Pontos e XP (menos pontos se acertar depois de errar)
        gameState.acertos++;
        const baseGain = gameState.isRapidMode ? 20 * gameState.questionNumber : 10;
        const multiplier = (gameState.attemptsThisQuestion === 0) ? 1 : 0.7;
        const scoreGain = Math.round(baseGain * multiplier);
        const xpGain = gameState.isRapidMode ? 5 : 2;

        gameState.score += scoreGain;
        atualizarXP(xpGain);
        playerScoreElement.textContent = `${gameState.score} Pontos`;

        // Se acertou, repõe o tempo total para a próxima questão
        if (gameState.isRapidMode && !isTraining) {
            gameState.timeStep = gameState.baseTimeStep;
            gameState.lowTimeAlerted = false;
            gameState.timeLeft = gameState.maxTime;
            timeBar.style.width = '100%';
            timeBar.style.backgroundColor = 'var(--cor-sucesso)';
            librasAlert.classList.add('hidden');
        }

        showFeedbackMessage(
            (gameState.attemptsThisQuestion === 0) ? 'RESPOSTA CORRETA!' : 'CORRETA (após tentar de novo)!',
            'success'
        );

        if (isTraining) {
            // Avança só quando acertar
            setTimeout(() => {
                gameState.trainingIndex++;
                nextTrainingQuestion();
            }, 900);
            return;
        }

        // Próxima questão no jogo
        setTimeout(() => {
            if (gameState.isRapidMode) startTimer();
            nextQuestion();
        }, 1100);

        return;
    }

    // ERRO
    gameState.attemptsThisQuestion++;

    // Salva erro (mesmo que depois acerte, isso ajuda a mapear as dificuldades)
    gameState.erros++;
    atualizarXP(-2);
    saveError(q, selectedAnswer);

    // No treino: não revela a resposta; deixa refazer até acertar
    if (isTraining) {
        // Desabilita só a alternativa errada (evita repetir a mesma)
        if (selectedButton) selectedButton.disabled = true;
        showFeedbackMessage('Ainda não. Tente outra alternativa!', 'warning', 1600);
        return;
    }

    // No jogo normal: permite refazer 1 vez (2 tentativas no total)
    if (gameState.attemptsThisQuestion < gameState.maxAttemptsPerQuestion) {
        if (selectedButton) selectedButton.disabled = true; // não deixa clicar de novo na mesma
        showFeedbackMessage('Quase! Tente outra alternativa.', 'warning', 1600);

        // Mantém o tempo correndo normalmente (não para o timer)
        if (gameState.isRapidMode) {
            // nada a fazer; o timer já está rodando
        }
        return;
    }

    // Finaliza (errou todas as tentativas)
    if (gameState.isRapidMode) stopTimer();

    // Revela a correta
    answerOptions.forEach(btn => {
        const v = parseInt(btn.querySelector('.answer-text').textContent);
        if (v === q.answer) btn.classList.add('correct');
        btn.disabled = true;
    });

    showFeedbackMessage('RESPOSTA INCORRETA!', 'warning', 1800);

    // Próxima questão (sem repor tempo)
    setTimeout(() => {
        if (gameState.isRapidMode) startTimer();
        nextQuestion();
    }, 1200);
}


function endGame() {
    gameState.isGameActive = false;
    if (gameState.isRapidMode) stopTimer();

    // 1. Calcular XP Ganhos na Rodada (apenas para exibição)
    const xpGained = gameState.acertos * (gameState.isRapidMode ? 5 : 2) - gameState.erros * 2;
    
    // 2. Atualizar UI de Resultados
    document.getElementById('final-score').textContent = gameState.score;
    document.getElementById('total-hits').textContent = gameState.acertos;
    document.getElementById('total-misses').textContent = gameState.erros;
    document.getElementById('xp-gained').textContent = `+${xpGained}`;
    document.getElementById('xp-total').textContent = gameState.xp;

    const studySuggestion = document.getElementById('study-suggestion');
    if (gameState.erros > gameState.acertos / 2) {
         studySuggestion.textContent = `Você teve muitos erros! Recomendamos usar o Modo Estudo para treinar a ${gameState.currentOperation} (Nível ${gameState.currentLevel.toUpperCase()}).`;
    } else if (gameState.score > 1000 && gameState.currentLevel === 'advanced') {
         studySuggestion.textContent = `Fantástico! Você está dominando a ${gameState.currentOperation} no Nível Avançado! Tente outro desafio.`;
    } else {
         studySuggestion.textContent = 'Continue praticando para alcançar o próximo nível de mestre!';
    }


    // 3. Mudar para a tela de resultado
    const sugg = document.getElementById('study-suggestion');
    if (sugg) {
        if (gameState.currentOperation === 'multiplication' && gameState.multiplication && (gameState.multiplication.mode === 'direct' || gameState.multiplication.mode === 'trail')) {
            const modeLabel = gameState.multiplication.mode === 'trail' ? 'Trilha automática' : 'Tabuada escolhida';

            if (gameState.multiplication.mode === 'trail') {
                const tMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
                const tMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
                const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
                const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
                const bankSize = getTrailPairsBankSize(tMin, tMax, mMin, mMax);
                const restante = Math.max(0, bankSize - (gameState.multiplication.trailPairIndex || 0));
                sugg.textContent =
                    `${modeLabel}: Tabuadas ${tMin}–${tMax} com multiplicadores ${mMin}–${mMax}. ` +
                    `A trilha não repete contas até completar (total ${bankSize}). ` +
                    `Faltam ${restante} para fechar o ciclo atual.`;
            } else {
                const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
                const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
                sugg.textContent =
                    `${modeLabel}: Tabuada do ${gameState.multiplication.tabuada} (×${mMin}–${mMax}). ` +
                    `Dica: use “Treinar Erros” para fixar onde você errou.`;
            }
        } else {
            sugg.textContent = '';
        }
    }
    // Ranking: registra partida (histórico local)
    try {
        const total = (gameState.totalQuestions && gameState.totalQuestions !== '∞') ? Number(gameState.totalQuestions) : Number(gameState.questionNumber);
        const attemptsTotal = Math.max(1, gameState.acertos + gameState.erros);
        const accuracy = (gameState.acertos / attemptsTotal) * 100;

        const submode = (gameState.currentOperation === 'multiplication')
            ? (gameState.multiplication.mode === 'direct' ? `Direto (Tabuada ${gameState.multiplication.tabuada})` : `Trilha (${gameState.multiplication.trailMin}–${gameState.multiplication.trailMax})`)
            : '';

        registrarPartidaNoRanking({
            score: gameState.score,
            operation: gameState.currentOperation,
            level: gameState.currentLevel,
            mode: gameState.isRapidMode ? 'rapido' : 'estudo',
            submode,
            acertos: gameState.acertos,
            erros: gameState.erros,
            total: total,
            accuracy: accuracy
        });
    } catch (e) { console.warn('Falha ao registrar ranking:', e); }

    // Atualiza a Trilha (mapa): para níveis não-tabuada, 1 sessão aprovada = +1 etapa
    try {
        const attemptsTotal2 = Math.max(1, gameState.acertos + gameState.erros);
        const accuracy2 = (gameState.acertos / attemptsTotal2) * 100;
        const passed = (accuracy2 >= 70) && (attemptsTotal2 >= 10);

        if (gameState.currentOperation !== 'multiplication') {
            if (passed) {
                const cur = getPathDone(gameState.currentOperation, gameState.currentLevel);
                setPathDone(gameState.currentOperation, gameState.currentLevel, cur + 1);
            }
        } else if (gameState.multiplication && gameState.multiplication.mode === 'trail') {
            const tMin = Number.isInteger(gameState.multiplication.trailMin) ? gameState.multiplication.trailMin : 0;
            const tMax = Number.isInteger(gameState.multiplication.trailMax) ? gameState.multiplication.trailMax : 20;
            const mMin = Number.isInteger(gameState.multiplication.multMin) ? gameState.multiplication.multMin : 0;
            const mMax = Number.isInteger(gameState.multiplication.multMax) ? gameState.multiplication.multMax : 20;
            const bankSize2 = getTrailPairsBankSize(tMin, tMax, mMin, mMax);
            setSavedTrailIndexForKey(gameState.multiplication.trailRangeKey, Math.max(0, Number(gameState.multiplication.trailPairIndex) || 0));
        }
    } catch (_) {}

    exibirTela('result-screen');
}


// --- LÓGICA DO TEMPORIZADOR ---

function startTimer() {
    if (gameState.timer) clearInterval(gameState.timer);
    if (!gameState.isRapidMode) return; // Não iniciar timer no modo estudo

    // Ajustamos o intervalo para rodar a cada 100ms (10 Ticks por segundo)
    gameState.timer = setInterval(() => {
        if (!gameState.isGameActive) {
            clearInterval(gameState.timer);
            return;
        }

        gameState.timeLeft -= gameState.timeStep;

        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timer);
            playAlertSound();
            showFeedbackMessage("Tempo esgotado! Game Over!", 'error', 3000);
            endGame(); 
            return;
        }
        
        const percentage = (gameState.timeLeft / gameState.maxTime) * 100;
        
        // Atualiza a barra de progresso
        timeBar.style.width = `${percentage}%`;

                // Alerta: sem mensagem visual (apenas som aos 5s finais)
        if (librasAlert) librasAlert.classList.add('hidden');

        // Mantém cores do timer para feedback visual
        if (percentage < 25) {
            timeBar.style.backgroundColor = 'var(--cor-erro)';
        } else if (percentage < 50) {
            timeBar.style.backgroundColor = 'var(--cor-secundaria)';
        } else {
            timeBar.style.backgroundColor = 'var(--cor-sucesso)';
        }

        // Som de alerta aos 5 segundos finais (toca 1x por questão)
        const fiveSecThreshold = 5 * 10 * gameState.timeStep; // 10 ticks = 1 segundo
        if (gameState.timeLeft <= fiveSecThreshold && gameState.timeLeft > 0) {
            if (!gameState.lowTimeAlerted) {
                playAlertSound();
                gameState.lowTimeAlerted = true;
            }
        } else {
            gameState.lowTimeAlerted = false;
        }

    }, 100); 
}

function stopTimer() {
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
}


// --- LISTENERS DE EVENTOS ---

function attachEventListeners() {
    
    // 1. Seleção de Operação (Vai para a tela de Nível)
    operationButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Guarda a operação para ser usada quando o nível for selecionado
            gameState.currentOperation = button.getAttribute('data-operation');
            
            // MUDANÇA: Vai para a tela de seleção de nível
            exibirTela('level-selection-screen');
            
            // Atualiza trilha (mapa) na tela de nível
            try { renderLearningMapPreview(gameState.currentOperation); } catch (_) {}
speak(`Operação ${gameState.currentOperation} selecionada. Agora escolha o nível!`);
            showFeedbackMessage(`Operação ${gameState.currentOperation.toUpperCase()} selecionada. Agora escolha o nível!`, 'info', 2500);
        });
    });
    
    // 2. Seleção de Nível (Inicia o Jogo)
    levelButtons.forEach(button => {
        button.addEventListener('click', () => {
            const level = button.getAttribute('data-level');
            // Inicia o jogo com a operação já salva e o nível recém-clicado
            if (gameState.currentOperation === 'multiplication') {
                openMultiplicationConfig(level);
            } else {
                startGame(gameState.currentOperation, level);
            } 
        });
    });

    // Botão para voltar da tela de nível para a home (Mudar Operação)
    btnVoltarHome.forEach(button => {
        // Garantindo que apenas os botões de voltar da home usem o ID 'btn-voltar-home'
        // Os demais botões de voltar home já devem ter o listener anexado.
        button.addEventListener('click', () => {
            stopTimer(); // Para o timer se estiver ativo (ex: saindo do jogo)
                    exibirTela('home-screen');
        });
    });

    // 3. Botão de Quit Game (na tela de jogo)
    btnQuitGame.addEventListener('click', () => {
        stopTimer();
        if (gameState.isGameActive) {
            showFeedbackMessage("Rodada cancelada.", 'warning', 2000);
            gameState.isGameActive = false;
        }
        exibirTela('home-screen');
    });

    // 4. Opções de Resposta
    answerOptions.forEach(button => {
        button.addEventListener('click', (e) => {
            // O texto do botão é a resposta
            const answer = parseInt(e.currentTarget.querySelector('.answer-text').textContent); 
            handleAnswer(answer, e.currentTarget);
        });
    });

    
    // 4.1 Responder pelo teclado (1,2,3,4) ou NumPad (1–4)
    document.addEventListener('keydown', (e) => {
        if (!gameState.isGameActive) return;

        // não captura se estiver digitando em algum campo (caso exista futuramente)
        const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;

        let idx = null;
        if (e.key === '1' || e.code === 'Numpad1') idx = 0;
        if (e.key === '2' || e.code === 'Numpad2') idx = 1;
        if (e.key === '3' || e.code === 'Numpad3') idx = 2;
        if (e.key === '4' || e.code === 'Numpad4') idx = 3;

        if (idx !== null) {
            e.preventDefault();
            const btn = answerOptions[idx];
            if (btn && !btn.disabled) btn.click();
        }

        // Atalho extra: R repete a leitura da questão (modo voz)
        if ((e.key === 'r' || e.key === 'R') && gameState.isVoiceReadActive && gameState.currentQuestion) {
            e.preventDefault();
            announceCurrentQuestion();
}
    });

// 5. Toggle Modo Rápido/Estudo
    modeRapidoBtn.addEventListener('click', () => {
        gameState.isRapidMode = true;
        modeRapidoBtn.classList.add('active');
        modeEstudoBtn.classList.remove('active');
        showFeedbackMessage("Modo Rápido (20 Questões com Tempo) selecionado!", 'incentive', 2500);
    });

    modeEstudoBtn.addEventListener('click', () => {
        gameState.isRapidMode = false;
        modeEstudoBtn.classList.add('active');
        modeRapidoBtn.classList.remove('active');
        showFeedbackMessage("Modo Estudo (Infinito, Sem Tempo) selecionado! Use o botão 'Mostrar Resposta' para aprender.", 'incentive', 2500);
    });

    // 6. Toggle Leitura de Voz
    if (toggleVoiceRead) {
        toggleVoiceRead.addEventListener('click', () => {
            const isActive = !gameState.isVoiceReadActive;
            gameState.isVoiceReadActive = isActive;
            toggleVoiceRead.classList.toggle('active', isActive);
            if(synth) synth.cancel();
            speak(`Leitura de Voz ${isActive ? 'ativada' : 'desativada'}!`);
            showFeedbackMessage(`Leitura de Voz ${isActive ? 'ativada' : 'desativada'}!`, 'info', 2000);
        });
    }
    
    // 7. Toggle Modo Libras 
    if (toggleLibras) {
        toggleLibras.addEventListener('click', () => {
            const isActive = document.body.classList.toggle('libras-mode');
            toggleLibras.classList.toggle('active', isActive);
            const message = isActive 
                ? 'Modo Libras (Acessibilidade) ATIVADO! O tempo de jogo será dobrado no Modo Rápido.'
                : 'Modo Libras DESATIVADO.';
            showFeedbackMessage(message, 'info', 3000);
        });
    }

    // 8. Lógica para Dark/Light Mode
    if (toggleNightMode) {
         toggleNightMode.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            document.body.classList.toggle('dark-mode');
            const isDarkMode = document.body.classList.contains('dark-mode');
            toggleNightMode.querySelector('.icon').textContent = isDarkMode ? '☀️' : '🌙';
        });
    }

    // 9. Botões de Ação do Jogo (Estender Tempo / Ajuda)
    btnExtendTime.addEventListener('click', () => {
        const cost = 100;
        if (gameState.xp >= cost) {
            atualizarXP(-cost);
            // Adiciona 50 ticks (+5 segundos)
            gameState.timeLeft = Math.min(gameState.maxTime, gameState.timeLeft + 50); 
            showFeedbackMessage("Tempo estendido! +5 segundos!", 'success');
        } else {
             showFeedbackMessage(`XP insuficiente. Você precisa de ${cost} XP!`, 'error');
        }
    });

    btnShowAnswer.addEventListener('click', () => {
        const cost = 250;
        if (gameState.xp >= cost) {
            atualizarXP(-cost);
            // Mostra a resposta correta e desabilita os botões para forçar o avanço
            answerOptions.forEach(btn => {
                const answerElement = btn.querySelector('.answer-text');
                if (parseInt(answerElement.textContent) === gameState.currentQuestion.answer) {
                    btn.classList.add('correct');
                }
                btn.disabled = true; 
            });
            stopTimer();
            showFeedbackMessage(`A resposta correta era ${gameState.currentQuestion.answer}. Treine mais!`, 'warning', 3500);

             // Avança para a próxima questão após 3 segundos
            setTimeout(() => {
                if (gameState.isRapidMode) startTimer();
                nextQuestion();
            }, 3000);

        } else {
             showFeedbackMessage(`XP insuficiente. Você precisa de ${cost} XP!`, 'error');
        }
    });
    
    // 10. Navegação para Ranking e Erros
    document.getElementById('btn-show-ranking').addEventListener('click', () => {
        carregarRanking();
        renderRanking();
        exibirTela('ranking-screen');
    });

    const btnClearRanking = document.getElementById('btn-clear-ranking');
    if (btnClearRanking) {
        btnClearRanking.addEventListener('click', () => {
            if (confirm('Tem certeza que deseja limpar o ranking?')) {
                gameState.highScores = [];
                salvarRanking();
                renderRanking();
                showFeedbackMessage('Ranking limpo!', 'info');
            }
        });
    }

    
    // Botão para ir para a tela de treinamento de erros (da tela de resultados)
    if (btnTreinarErros) {
        btnTreinarErros.addEventListener('click', () => {
            updateErrorTrainingButton(); // Atualiza a lista e mensagem
            exibirTela('error-training-screen');
        });
    }

    // Botão para limpar a lista de erros salvos
    if (btnClearErrors) {
        btnClearErrors.addEventListener('click', () => {
            if (confirm("Tem certeza que deseja limpar todos os erros salvos?")) {
                gameState.errors = [];
                salvarErros();
                showFeedbackMessage("Erros salvos limpos com sucesso!", 'info');
                updateErrorTrainingButton();
            }
        });
    }

    if (btnStartTraining) {
        btnStartTraining.addEventListener('click', () => {
            startErrorTraining();
        });
    }


    // Inicialização final
    exibirTela(gameState.currentScreen);

}


// --- INICIALIZAÇÃO DO DOCUMENTO ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega o estado persistente
    carregarXP();
    carregarErros();
    carregarRanking();
    loadTeacherPrefs();
    initPWA(); 
    
    // 2. Anexa todos os listeners
    loadMultiplicationConfig();
    
    // Progresso separado por faixa/nível da tabuada + perfil (opcional)
    loadMultProgressMap();
    loadStudentProfile();
    ensureProfileUI();
attachEventListeners();
    initTeacherPanel();

    // Inicializa o badge de progresso (fica oculto até o jogo começar)
    ensureCycleProgressBadge();
    
    // 3. Atualiza o estado inicial do botão de Treinar Erros
    updateErrorTrainingButton();

    // Aplica o Dark Mode se o body já tiver a classe
    if (document.body.classList.contains('dark-mode')) {
        toggleNightMode.querySelector('.icon').textContent = '☀️';
    }
});