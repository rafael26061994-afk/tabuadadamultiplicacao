// --- VARIÁVEIS DE ESTADO GLOBAL E CACHE DE ELEMENTOS ---
const screens = document.querySelectorAll('.screen');
const questionText = document.getElementById('question-text');
const answerButtons = document.querySelectorAll('.btn-answer'); 
const timeBar = document.getElementById('time-bar');
const timeDisplay = document.getElementById('time-display'); 
const timeContainer = document.getElementById('timer-container'); 
const playerScoreElement = document.getElementById('player-score');
const playerXPElement = document.getElementById('player-xp');
const questionCounter = document.getElementById('question-counter');
const feedbackMessageElement = document.getElementById('feedback-message');
const alertSound = document.getElementById('alert-sound');
const librasAlert = document.getElementById('libras-alert');

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
const modeEstudoBtn = document = document.getElementById('mode-estudo');
const levelButtons = document.querySelectorAll('.level-btn'); 

// Cache de elementos de erro
const btnTreinarErros = document.getElementById('btn-treinar-erros');
const btnStartTraining = document.getElementById('btn-start-training');
const btnClearErrors = document.getElementById('btn-clear-errors');
const errorCountMessage = document.getElementById('error-count-message');
const errorListContainer = document.getElementById('error-list-container');


// VARIÁVEIS DE TEMPO E JOGO
let timerInterval;
const TIME_SETTINGS = {
    // Tempo em segundos
    easy: 15,
    medium: 30,
    advanced: 45
};

const ACCESSIBILITY_MULTIPLIER = 2; // Tempo dobra com acessibilidade ativada

let gameState = {
    currentScreen: 'home-screen',
    operation: '',
    level: '',
    score: 0,
    xp: 0,
    questionCount: 0,
    totalQuestions: 99999, // Virtualmente ilimitado
    consecutiveCorrectAnswers: 0, // Contador para progressão (usado para operações não-multiplicação)
    maxConsecutiveAnswers: 10,  // Alvo para progressão
    multiplicationTracking: [], // NOVO: Armazena (fator1, fator2) pendentes
    timeRemaining: 0,
    isTimerRunning: false,
    mode: 'rapido', // 'rapido' ou 'estudo'
    accessibility: {
        voice: false,
        libras: false,
        nightMode: false
    },
    errors: [], // Array para salvar questões erradas
    isErrorTraining: false, // Novo estado para saber se está em Treinamento de Erros
    errorTrainingQuestions: [], // Questões carregadas para o treinamento
    currentErrorIndex: 0,
    currentQuestionData: null // Objeto para armazenar a questão atual (texto, resposta, opções)
};

// --- FUNÇÕES DE UTILIDADE E FLUXO ---

function salvarXP() {
    localStorage.setItem('matemagicaXP', gameState.xp.toString());
}

function carregarXP() {
    const savedXP = localStorage.getItem('matemagicaXP');
    if (savedXP) {
        gameState.xp = parseInt(savedXP, 10);
        playerXPElement.textContent = `XP: ${gameState.xp}`;
    }
}

function salvarErros() {
    localStorage.setItem('matemagicaErrors', JSON.stringify(gameState.errors));
}

function carregarErros() {
    const savedErrors = localStorage.getItem('matemagicaErrors');
    if (savedErrors) {
        // Garante que o array carregado não ultrapasse 20 erros
        const errorsArray = JSON.parse(savedErrors);
        gameState.errors = errorsArray.slice(0, 20); 
    }
}

/**
 * Cria a lista completa de combinações de multiplicação para o nível atual.
 * @param {string} level 
 */
function initializeMultiplicationTracking(level) {
    let multMin1, multMax1, multMax2;

    if (level === 'easy') {
        multMin1 = 0; multMax1 = 5; multMax2 = 10;
    } else if (level === 'medium') {
        multMin1 = 6; multMax1 = 10; multMax2 = 10;
    } else { // advanced
        multMin1 = 11; multMax1 = 20; multMax2 = 20;
    }

    gameState.multiplicationTracking = [];
    
    // Gera todas as combinações (fator1, fator2)
    for (let f1 = multMin1; f1 <= multMax1; f1++) {
        for (let f2 = 0; f2 <= multMax2; f2++) {
            // Usa uma string única como ID para a combinação
            gameState.multiplicationTracking.push(`${f1},${f2}`);
        }
    }
    
    // Embaralha a lista para que as questões não venham em ordem
    gameState.multiplicationTracking.sort(() => Math.random() - 0.5);
}


/**
 * Exibe uma tela e oculta as outras.
 * @param {string} id Id da tela a ser exibida.
 */
function exibirTela(id) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(id);
    if (targetScreen) {
        targetScreen.classList.add('active');
        gameState.currentScreen = id;
    }

    // Ações específicas de tela
    if (id === 'home-screen') {
        // Reinicializa o score, o contador e as respostas consecutivas
        gameState.score = 0;
        playerScoreElement.textContent = '0 Pontos';
        gameState.questionCount = 0;
        gameState.consecutiveCorrectAnswers = 0; // Reinicia a contagem
        // Garante que o timer pare se o jogador desistir
        stopTimer(); 
    }
    
    if (id === 'game-screen') {
        // Garante que o timerContainer esteja visível/oculto dependendo do modo
        timeContainer.style.display = gameState.mode === 'rapido' ? 'block' : 'none';
    }

    if (id === 'result-screen') {
        // Se saiu do treinamento, reseta o estado
        gameState.isErrorTraining = false;
        // Atualiza a tela de resultados
        updateResultScreen();
    }
    
    if (id === 'error-training-screen') {
        updateErrorTrainingButton();
    }
}

/**
 * Mapeia o nível atual para o próximo nível.
 * @param {string} currentLevel 'easy', 'medium', ou 'advanced'
 * @returns {string | null} O próximo nível ou null se já estiver no avançado.
 */
function getNextLevel(currentLevel) {
    if (currentLevel === 'easy') return 'medium';
    if (currentLevel === 'medium') return 'advanced';
    return null; // Já está no nível avançado
}

/**
 * Inicia uma nova rodada de jogo (resetando contadores, mas mantendo score).
 * Usado para mudar de nível.
 * @param {string} newLevel 
 */
function startNewRound(newLevel) {
    gameState.level = newLevel;
    gameState.questionCount = 1; 
    gameState.consecutiveCorrectAnswers = 0; // Reinicia o contador de acertos
    
    // Se for multiplicação, reinicializa o tracking
    if (gameState.operation === 'multiplication') {
        initializeMultiplicationTracking(newLevel);
    }
    
    // Feedback e transição
    showFeedbackMessage(`Parabéns! Nível ${newLevel.toUpperCase()} desbloqueado!`, 'incentive');

    const nextQ = generateQuestion();
    exibirTela('game-screen');
    displayQuestion(nextQ);
}

/**
 * Mostra uma mensagem de feedback no topo da tela.
 * @param {string} message 
 * @param {('success'|'error'|'warning'|'info'|'incentive')} type 
 */
function showFeedbackMessage(message, type = 'info') {
    feedbackMessageElement.textContent = message;
    feedbackMessageElement.className = `feedback-message show ${type}`;
    
    // Oculta após 3 segundos
    setTimeout(() => {
        feedbackMessageElement.classList.remove('show');
    }, 3000);
}


// --- LÓGICA DO TEMPORIZADOR ---

/**
 * Calcula o tempo total baseado no nível e configurações de acessibilidade.
 * @returns {number} O tempo total em segundos.
 */
function calculateTotalTime() {
    let baseTime = TIME_SETTINGS[gameState.level] || TIME_SETTINGS.medium;
    
    const isAccessibilityActive = gameState.accessibility.voice || gameState.accessibility.libras;
    
    // Se acessibilidade ativa, dobra o tempo
    if (isAccessibilityActive) {
        baseTime *= ACCESSIBILITY_MULTIPLIER;
    }
    
    return baseTime;
}

/**
 * Atualiza visualmente a barra de tempo (largura, cor) e o display de segundos.
 * @param {number} totalTime O tempo total original da questão.
 */
function updateTimeBar(totalTime) {
    // Calcula a porcentagem restante
    const percentage = (gameState.timeRemaining / totalTime) * 100;
    
    timeBar.style.width = `${percentage}%`;
    timeDisplay.textContent = `${Math.ceil(gameState.timeRemaining)}s`;
    
    // Define a cor
    if (percentage > 50) {
        // Verde (maioria do tempo)
        timeBar.style.backgroundColor = 'var(--cor-sucesso)';
        timeContainer.classList.remove('critical');
    } else if (percentage > 20) {
        // Amarelo (metade para o fim)
        timeBar.style.backgroundColor = 'var(--cor-incentivo)';
        timeContainer.classList.remove('critical');
    } else {
        // Vermelho (tempo crítico - 20% ou menos)
        timeBar.style.backgroundColor = 'var(--cor-erro)';
        timeContainer.classList.add('critical'); // Adiciona a animação de pulso
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    gameState.isTimerRunning = false;
    timeContainer.classList.remove('critical');
}

/**
 * Inicia o cronômetro para a questão atual.
 */
function startTimer() {
    stopTimer(); // Garante que qualquer timer anterior seja parado

    // Se estiver no modo estudo, não há timer
    if (gameState.mode === 'estudo') {
        timeContainer.style.display = 'none';
        return;
    }
    
    timeContainer.style.display = 'block';

    const totalTime = calculateTotalTime();
    gameState.timeRemaining = totalTime;
    gameState.isTimerRunning = true;

    // Atualiza a barra imediatamente para 100%
    updateTimeBar(totalTime); 

    timerInterval = setInterval(() => {
        gameState.timeRemaining -= 0.1; // Diminui em décimos de segundo

        if (gameState.timeRemaining <= 0) {
            stopTimer();
            gameState.timeRemaining = 0;
            // Força a atualização final para 0 e cor de erro
            updateTimeBar(totalTime); 
            
            // Ação de tempo esgotado
            showFeedbackMessage("Tempo esgotado!", 'error');
            
            // Passa para a próxima questão (como se tivesse errado)
            checkAnswer(null); 
            
            return;
        }

        updateTimeBar(totalTime);
        
        // Alerta de Libras (se ativo e tempo crítico)
        if (gameState.accessibility.libras && gameState.timeRemaining <= 5 && gameState.timeRemaining > 4.9) {
            alertSound.play();
            librasAlert.classList.remove('hidden');
            setTimeout(() => librasAlert.classList.add('hidden'), 3000);
        }

    }, 100); // Atualiza a cada 100ms para uma transição suave
}


// --- LÓGICA DE QUESTÕES E GERAÇÃO ---


/**
 * Salva um erro no armazenamento local.
 * Garante que o array não ultrapasse 20 erros (as 20 mais recentes).
 * @param {object} error A questão errada e a resposta do usuário.
 */
function saveError(error) {
    // Adiciona o novo erro no início
    gameState.errors.unshift(error);
    
    // Limita o array a 20 erros
    if (gameState.errors.length > 20) {
        gameState.errors = gameState.errors.slice(0, 20);
    }
    salvarErros();
}

/**
 * Lógica de geração de questões (adaptada para treinamento de erros e tabuada).
 * @returns {object} A questão gerada.
 */
function generateQuestion() {
    let question;

    if (gameState.isErrorTraining) {
        // Modo Treinamento de Erros: Pega a próxima questão salva
        question = gameState.errorTrainingQuestions[gameState.currentErrorIndex];
    } else {
        // Modo Jogo Normal: Gera uma nova questão
        const operation = gameState.operation;
        const level = gameState.level;
        
        let correctAnswer;
        let questionTextString = '';
        let multKey = null; // Chave para rastreamento da multiplicação

        switch (operation) {
            case 'addition':
                // Aumenta a dificuldade em níveis mais altos
                const addMax = level === 'advanced' ? 50 : (level === 'medium' ? 30 : 15);
                const addMin = level === 'advanced' ? 10 : 1;
                const add1 = Math.floor(Math.random() * (addMax - addMin + 1)) + addMin;
                const add2 = Math.floor(Math.random() * (addMax - addMin + 1)) + addMin;
                correctAnswer = add1 + add2;
                questionTextString = `${add1} + ${add2} = ?`;
                break;
            case 'subtraction':
                const subMax = level === 'advanced' ? 50 : (level === 'medium' ? 30 : 20);
                const subMin = level === 'advanced' ? 10 : 5;
                const sub1 = Math.floor(Math.random() * (subMax - subMin + 1)) + subMin;
                const sub2 = Math.floor(Math.random() * (subMax - subMin + 1)) + subMin;
                const high = Math.max(sub1, sub2);
                const low = Math.min(sub1, sub2);
                correctAnswer = high - low;
                questionTextString = `${high} - ${low} = ?`;
                break;
            case 'multiplication':
                // Lógica de Geração por Combinação PENDENTE (Domínio Total)
                
                // Se a lista de pendentes estiver vazia, a progressão deveria ter ocorrido.
                // Isso é uma medida de segurança, mas nextQuestion() deve prevenir.
                if (gameState.multiplicationTracking.length === 0) {
                    // Se chegou aqui, o nível foi dominado.
                    return null; 
                }
                
                // Pega o primeiro item da lista embaralhada (e o remove temporariamente)
                const multKeyString = gameState.multiplicationTracking[0];
                const [f1, f2] = multKeyString.split(',').map(Number);
                
                const mult1 = f1;
                const mult2 = f2;

                correctAnswer = mult1 * mult2;
                questionTextString = `${mult1} x ${mult2} = ?`;
                multKey = multKeyString; // Salva a chave para rastreamento
                
                break;
            case 'division':
                // Garante divisão exata
                const divMax = level === 'advanced' ? 10 : (level === 'medium' ? 7 : 5);
                const result = Math.floor(Math.random() * divMax) + 2; 
                const divisor = Math.floor(Math.random() * divMax) + 2; 
                const dividend = result * divisor;
                correctAnswer = result;
                questionTextString = `${dividend} ÷ ${divisor} = ?`;
                break;
            case 'potenciacao':
                const basePot = level === 'advanced' ? 5 : 3; 
                const exponentPot = level === 'advanced' ? 4 : 3;
                const base = Math.floor(Math.random() * basePot) + 2; 
                const exponent = Math.floor(Math.random() * exponentPot) + 2; 
                correctAnswer = Math.pow(base, exponent);
                questionTextString = `${base}ⁿ = ? (n=${exponent})`;
                break;
            case 'radiciacao':
                const rootMax = level === 'advanced' ? 10 : 7;
                const root = Math.floor(Math.random() * rootMax) + 2;
                correctAnswer = root;
                questionTextString = `√${root * root} = ?`;
                break;
        }

        question = {
            text: questionTextString,
            correctAnswer: correctAnswer.toString(),
            options: generateOptions(correctAnswer),
            multiplicationKey: multKey // NOVO: Salva a chave se for multiplicação
        };
    }
    
    // Armazena a questão atual no estado do jogo
    gameState.currentQuestionData = question;
    
    return question;
}

/**
 * Cria opções de resposta incorretas. (Função inalterada)
 */
function generateOptions(correctAnswer) {
    const options = new Set();
    options.add(correctAnswer.toString());
    
    while (options.size < 4) {
        const deviation = Math.floor(Math.random() * 5) + 1; 
        const sign = Math.random() < 0.5 ? 1 : -1;
        
        let wrongAnswer = correctAnswer + (deviation * sign);
        
        if (wrongAnswer <= 0 || wrongAnswer === correctAnswer) {
            wrongAnswer = correctAnswer + deviation;
        }
        
        options.add(wrongAnswer.toString());
    }
    
    const optionsArray = Array.from(options);
    for (let i = optionsArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
    }
    
    return optionsArray;
}


function displayQuestion(question) {
    // Se a questão gerada for nula (fim de progressão), encerra o jogo imediatamente
    if (!question) {
        exibirTela('result-screen');
        return;
    }
    
    // Para o timer anterior e inicia um novo
    if (gameState.mode === 'rapido') {
        startTimer();
    }
    
    questionText.textContent = question.text;
    
    answerButtons.forEach((btn, index) => {
        const optionValue = question.options[index];
        btn.textContent = optionValue;
        btn.setAttribute('data-answer', optionValue);
        btn.disabled = false;
        btn.classList.remove('correct', 'wrong');
    });

    // NOVO: Exibe o progresso diferente para multiplicação
    if (gameState.operation === 'multiplication' && !gameState.isErrorTraining) {
         const totalQuestions = gameState.multiplicationTracking.length + 1; // +1 porque a atual ainda não foi removida
         questionCounter.textContent = `Tabuadas Pendentes: ${gameState.multiplicationTracking.length} / ${totalQuestions}`;
    } else if (!gameState.isErrorTraining) {
        questionCounter.textContent = `Questão: ${gameState.questionCount} (Acertos: ${gameState.consecutiveCorrectAnswers}/${gameState.maxConsecutiveAnswers})`;
    } else {
        questionCounter.textContent = `Erro ${gameState.currentErrorIndex + 1} / ${gameState.errorTrainingQuestions.length}`;
    }
    
    if (gameState.accessibility.voice) {
        let optionsText = question.options.map((opt, i) => `${String.fromCharCode(65 + i)}: ${opt}`).join(', ');
        speak(`Nova questão: ${question.text}. Opções: ${optionsText}`);
    }
}

/**
 * Função principal para avançar para a próxima questão ou encerrar o jogo.
 */
function nextQuestion() {
    stopTimer(); 
    let shouldAdvance = true;

    // Lógica para o modo Jogo Normal
    if (!gameState.isErrorTraining) {
        
        // 1. Lógica de Progressão para MULTIPLICAÇÃO (Domínio Total)
        if (gameState.operation === 'multiplication' && gameState.multiplicationTracking.length === 0) {
            
            const nextLevel = getNextLevel(gameState.level);
            
            if (nextLevel) {
                startNewRound(nextLevel);
            } else {
                // FIM DA PROGRESSÃO DE MULTIPLICAÇÃO
                showFeedbackMessage("Parabéns! Você dominou TODAS as tabuadas!", 'incentive');
                exibirTela('result-screen'); 
            }
            shouldAdvance = false;

        // 2. Lógica de Progressão para OUTRAS OPERAÇÕES (10 Acertos Consecutivos)
        } else if (gameState.consecutiveCorrectAnswers >= gameState.maxConsecutiveAnswers) {
            
            const nextLevel = getNextLevel(gameState.level);
            
            if (nextLevel) {
                startNewRound(nextLevel);
            } else {
                // FIM DA PROGRESSÃO DE OUTRAS OPERAÇÕES
                showFeedbackMessage("Parabéns! Você dominou o nível Avançado! Progressão finalizada.", 'incentive');
                exibirTela('result-screen'); 
            }
            shouldAdvance = false;
        }
        
        if (shouldAdvance) {
            gameState.questionCount++; 
        }

    } else {
        // Lógica para o modo Treinamento de Erros (usando a lógica anterior de progressão de nível)
        gameState.currentErrorIndex++;
        
        if (gameState.currentErrorIndex >= gameState.errorTrainingQuestions.length) {
            showFeedbackMessage("Treinamento de erros concluído! ✅", 'success');
            
            const nextLevel = getNextLevel(gameState.level);
            if (nextLevel) {
                 startNewRound(nextLevel);
            } else {
                exibirTela('result-screen'); 
            }
            shouldAdvance = false;
        }
    }
    
    // Avança a questão apenas se não houve progressão de nível/fim de treinamento
    if (shouldAdvance) {
        const nextQ = generateQuestion();
        displayQuestion(nextQ);
    }
}

/**
 * Verifica a resposta do usuário ou processa o tempo esgotado (answer === null).
 * @param {string | null} answer A resposta escolhida pelo usuário ou null se o tempo acabou.
 */
function checkAnswer(answer) {
    if (gameState.isTimerRunning) {
        stopTimer();
    }
    
    answerButtons.forEach(btn => btn.disabled = true);

    const currentQuestionData = gameState.isErrorTraining 
        ? gameState.errorTrainingQuestions[gameState.currentErrorIndex]
        : gameState.currentQuestionData; 

    const correctAnswer = currentQuestionData.correctAnswer;
    const isCorrect = answer === correctAnswer;
    const answeredInTime = answer !== null;

    // Lógica de Feedback e Pontuação
    if (isCorrect && answeredInTime) {
        showFeedbackMessage("Correto! 🎉", 'success');
        gameState.score += 10;
        gameState.xp += 5; 
        
        // Se for multiplicação, remove a chave da lista de pendentes
        if (gameState.operation === 'multiplication' && currentQuestionData.multiplicationKey) {
            const index = gameState.multiplicationTracking.indexOf(currentQuestionData.multiplicationKey);
            if (index > -1) {
                gameState.multiplicationTracking.splice(index, 1);
            }
        }
        
        // Progressão para OUTRAS OPERAÇÕES
        if (gameState.operation !== 'multiplication') {
            gameState.consecutiveCorrectAnswers++;
        }
        
        // Destaca a resposta correta
        answerButtons.forEach(btn => {
            if (btn.getAttribute('data-answer') === correctAnswer) {
                btn.classList.add('correct');
            }
        });
        
    } else {
        // Erro ou Tempo Esgotado
        const message = answeredInTime ? "Errado. Tente de novo! 😟" : "Tempo esgotado! ⏳";
        showFeedbackMessage(message, 'error');

        // Progressão para OUTRAS OPERAÇÕES: Reseta o contador ao errar
        if (gameState.operation !== 'multiplication') {
            gameState.consecutiveCorrectAnswers = 0; 
        }

        // Se errou no modo normal (ou tempo esgotado), salva o erro
        if (!gameState.isErrorTraining) {
            const userAnswer = answeredInTime ? answer : 'Tempo Esgotado';
            const error = {
                text: currentQuestionData.text,
                correctAnswer: currentQuestionData.correctAnswer,
                userAnswer: userAnswer,
                options: currentQuestionData.options,
                operation: gameState.operation,
                level: gameState.level,
                date: new Date().toISOString()
            };
            saveError(error);
        }

        // Destaca a correta e a errada
        answerButtons.forEach(btn => {
            if (btn.getAttribute('data-answer') === correctAnswer) {
                btn.classList.add('correct'); // Correta
            } else if (answeredInTime && btn.getAttribute('data-answer') === answer) {
                btn.classList.add('wrong'); // Errada do usuário
            }
        });
    }

    // Atualiza o display de score e XP
    playerScoreElement.textContent = `${gameState.score} Pontos`;
    playerXPElement.textContent = `XP: ${gameState.xp}`;
    salvarXP();

    // Próxima questão após 1.5 segundos de feedback visual
    setTimeout(() => {
        nextQuestion();
    }, 1500);
}


// --- LÓGICA DE TELAS DE RESULTADO E ERROS ---

function updateResultScreen() {
    // O total de questões é o contador ATUAL, pois o jogo é ilimitado
    const totalQuestionsPlayed = gameState.questionCount; 
    
    // Total de acertos é a pontuação dividida por 10 (cada acerto vale 10)
    const totalHits = gameState.score / 10; 
    
    // O total de erros é o número de questões *respondidas* menos os acertos
    const totalMisses = totalQuestionsPlayed - totalHits; 

    document.getElementById('final-score').textContent = gameState.score;
    document.getElementById('total-hits').textContent = totalHits;
    document.getElementById('total-misses').textContent = totalMisses;
    document.getElementById('xp-gained').textContent = `+${totalHits * 5}`;
    document.getElementById('xp-total').textContent = gameState.xp;

    const suggestionElement = document.getElementById('study-suggestion');
    if (totalMisses > 0) {
        suggestionElement.textContent = `Você jogou ${totalQuestionsPlayed} questões. Errou ${totalMisses}. Revise a ${gameState.operation} no nível ${gameState.level}!`;
    } else if (totalQuestionsPlayed > 0) {
        suggestionElement.textContent = `Parabéns! Desempenho excelente! Você acertou todas as ${totalQuestionsPlayed} questões! 🎉`;
    } else {
         suggestionElement.textContent = "Comece um jogo na Home para começar a ganhar pontos!";
    }

    // Atualiza o estado do botão de Treinar Erros
    updateErrorTrainingButton();
}

function updateErrorTrainingButton() {
    // Atualiza o botão da tela de resultados
    if (btnTreinarErros) {
        if (gameState.errors.length > 0) {
            btnTreinarErros.style.display = 'inline-block';
            btnTreinarErros.textContent = `Treinar Erros (${gameState.errors.length})`;
        } else {
            btnTreinarErros.style.display = 'none';
        }
    }
    
    // Atualiza a tela de Treinamento de Erros
    if (errorCountMessage) {
        const count = gameState.errors.length;
        errorCountMessage.textContent = count === 0 
            ? "Você não tem erros salvos. Comece um jogo para treinar!" 
            : `Você tem ${count} erro(s) salvo(s) de rodadas anteriores.`;
            
        // Habilita/Desabilita botões da tela de erros
        btnStartTraining.disabled = count === 0;
        btnClearErrors.disabled = count === 0;
        
        // Lista de erros salvos
        errorListContainer.innerHTML = '';
        if (count > 0) {
            gameState.errors.forEach((error, index) => {
                const item = document.createElement('div');
                item.className = 'error-item';
                item.innerHTML = `
                    <p><strong>${index + 1}. ${error.text}</strong></p>
                    <p>Sua resposta: <span class="wrong-answer">${error.userAnswer}</span></p>
                    <p>Resposta correta: <span class="correct-answer">${error.correctAnswer}</span></p>
                    <p class="stat-label" style="font-size: 0.8em;">Operação: ${error.operation} | Nível: ${error.level}</p>
                `;
                errorListContainer.appendChild(item);
            });
        }
    }
}


// --- LÓGICA DE EVENT LISTENERS ---

function attachEventListeners() {
    // Botões de Operação (Home Screen)
    operationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            gameState.operation = btn.getAttribute('data-operation');
            exibirTela('level-selection-screen');
        });
    });

    // Botões de Nível
    levelButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedLevel = btn.getAttribute('data-level');
            
            gameState.level = selectedLevel;
            gameState.questionCount = 1; 
            gameState.score = 0;
            gameState.isErrorTraining = false; 
            gameState.consecutiveCorrectAnswers = 0; 
            
            // NOVO: Inicializa o rastreamento se for multiplicação
            if (gameState.operation === 'multiplication') {
                 initializeMultiplicationTracking(selectedLevel);
            }
            
            const firstQuestion = generateQuestion();
            exibirTela('game-screen');
            displayQuestion(firstQuestion);
        });
    });

    // Botões de Resposta
    answerButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedAnswer = btn.getAttribute('data-answer');
            checkAnswer(selectedAnswer);
        });
    });
    
    // Botões Voltar para Home / Mudar Operação
    btnVoltarHome.forEach(btn => {
        btn.addEventListener('click', () => exibirTela('home-screen'));
    });
    
    // Botão Sair do Jogo: Agora termina o jogo e vai para a tela de resultados
    if (btnQuitGame) {
        btnQuitGame.addEventListener('click', () => exibirTela('result-screen'));
    }

    // Botões de Modo de Jogo
    modeRapidoBtn.addEventListener('click', () => {
        gameState.mode = 'rapido';
        modeRapidoBtn.classList.add('active');
        modeEstudoBtn.classList.remove('active');
        showFeedbackMessage("Modo Rápido ativado. Prepare-se para o desafio!", 'info');
    });
    
    modeEstudoBtn.addEventListener('click', () => {
        gameState.mode = 'estudo';
        modeEstudoBtn.classList.add('active');
        modeRapidoBtn.classList.remove('active');
        showFeedbackMessage("Modo Estudo ativado. Sem tempo limite.", 'info');
    });

    // Toggles de Acessibilidade (Voz e Libras)
    const updateAccessibility = () => {
        const voice = toggleVoiceRead.classList.contains('active');
        const libras = toggleLibras.classList.contains('active');
        gameState.accessibility.voice = voice;
        gameState.accessibility.libras = libras;
    };

    toggleVoiceRead.addEventListener('click', () => {
        toggleVoiceRead.classList.toggle('active');
        updateAccessibility();
        if (gameState.accessibility.voice) {
             showFeedbackMessage("Leitura de Voz ATIVADA. O tempo de jogo dobrou!", 'info');
        } else {
             showFeedbackMessage("Leitura de Voz DESATIVADA.", 'info');
        }
    });

    toggleLibras.addEventListener('click', () => {
        toggleLibras.classList.toggle('active');
        updateAccessibility();
         if (gameState.accessibility.libras) {
             showFeedbackMessage("Modo Libras ATIVADO. O tempo de jogo dobrou!", 'info');
        } else {
             showFeedbackMessage("Modo Libras DESATIVADO.", 'info');
        }
    });
    
    // Toggle Modo Noite
    toggleNightMode.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        gameState.accessibility.nightMode = document.body.classList.contains('dark-mode');
        showFeedbackMessage(gameState.accessibility.nightMode ? "Modo Noite ATIVADO" : "Modo Claro ATIVADO", 'info');
    });

    // Botão para ir para a tela de treinamento de erros (da tela de resultados)
    if (btnTreinarErros) {
        btnTreinarErros.addEventListener('click', () => {
            updateErrorTrainingButton(); 
            exibirTela('error-training-screen');
        });
    }

    // Botão para limpar a lista de erros salvos
    if (btnClearErrors) {
        btnClearErrors.addEventListener('click', () => {
            if (confirm("Tem certeza que deseja limpar todos os erros salvos?")) {
                gameState.errors = [];
                salvarErros();
                showFeedbackMessage("Erros salvos limpos com sucesso! ✅", 'info');
                updateErrorTrainingButton();
            }
        });
    }

    // Botão para INICIAR o Treinamento de Erros
    if (btnStartTraining) {
        btnStartTraining.addEventListener('click', () => {
            if (gameState.errors.length > 0) {
                // Configura o estado para o treinamento
                gameState.isErrorTraining = true;
                gameState.errorTrainingQuestions = [...gameState.errors]; 
                gameState.currentErrorIndex = 0;
                gameState.questionCount = 0; 
                
                // Define o nível com base no nível do primeiro erro para a coerência visual e de tempo
                gameState.level = gameState.errors[0].level;
                gameState.operation = gameState.errors[0].operation; // Define a operação para o rastreamento visual no displayQuestion
                
                gameState.mode = 'rapido'; // O treinamento usa o tempo do modo rápido
                
                // Inicia o jogo na primeira questão de erro
                const firstErrorQuestion = generateQuestion();
                exibirTela('game-screen');
                displayQuestion(firstErrorQuestion);
                
                showFeedbackMessage(`Iniciando treinamento com ${gameState.errors.length} erro(s). Boa sorte!`, 'incentive');
            } else {
                showFeedbackMessage("Nenhum erro para treinar!", 'warning');
            }
        });
    }

    // Funcionalidade de Leitura de Voz (Text-to-Speech)
    function speak(text) {
        if (!gameState.accessibility.voice) return;
        
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR'; 
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn("API de Fala não suportada neste navegador.");
        }
    }


    // TODO: Implementar a lógica do Ranking

    // Botões de Ajuda/Ações (Extender Tempo, Mostrar Resposta)
    // Implementação pendente: Esconder/Mostrar conforme a pontuação XP
    // Por enquanto, ficam invisíveis conforme o index.html

}


// --- INICIALIZAÇÃO DO DOCUMENTO ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carrega o estado persistente
    carregarXP();
    carregarErros(); 
    
    // 2. Anexa todos os listeners
    attachEventListeners();
    
    // 3. Atualiza o estado inicial do botão de Treinar Erros
    updateErrorTrainingButton();
    
    // 4. Aplica o Dark Mode se o body já estiver na classe dark-mode
    if (document.body.classList.contains('dark-mode')) {
        gameState.accessibility.nightMode = true;
    }

    // 5. Inicia na tela correta
    exibirTela(gameState.currentScreen);
});