import { PitchDetector } from "pitchy";

// Tangga Nada Frekuensi Map (Akan diisi dinamis saat kalibrasi)
let NOTES = [];

// Base Frequency & Ratios based on user's Slendro tuning
let basePitchHz = 84;
const RATIOS = {
    '1': 1.0,
    '2': 1.190476,
    '3': 1.297619,
    '5': 1.369047,
    '6': 1.488095,
    '1^': 1.845238,
    '2^': 1.964285
};

// Batas minimum dan maksimum kanvas dinamis
let canvasMinFreq = 60;
let canvasMaxFreq = 185;

function generateNotes(baseHz) {
    NOTES = [
        { name: '1', freq: baseHz * RATIOS['1'] },
        { name: '2', freq: baseHz * RATIOS['2'] },
        { name: '3', freq: baseHz * RATIOS['3'] },
        { name: '5', freq: baseHz * RATIOS['5'] },
        { name: '6', freq: baseHz * RATIOS['6'] },
        { name: '1^', freq: baseHz * RATIOS['1^'] },
        { name: '2^', freq: baseHz * RATIOS['2^'] }
    ];
    canvasMinFreq = baseHz - 20; // Kasih ruang napas di bawah
    canvasMaxFreq = (baseHz * RATIOS['2^']) + 20; // Kasih ruang napas di atas
}

// Macapat Kinanthi Baris
const LEVELS = [
    // Level 0: Pemanasan Tangga Nada Naik (Urutan Slendro)
    [
        {n: '1', l: 'ji'}, {n: '2', l: 'ro'}, {n: '3', l: 'lu'}, 
        {n: '5', l: 'mo'}, {n: '6', l: 'nem'}, {n: '1^', l: 'ji'}, {n: '2^', l: 'ro'}
    ],
    // Level 1: Pemanasan Tangga Nada Turun
    [
        {n: '2^', l: 'ro'}, {n: '1^', l: 'ji'}, {n: '6', l: 'nem'}, {n: '5', l: 'mo'}, 
        {n: '3', l: 'lu'}, {n: '2', l: 'ro'}, {n: '1', l: 'ji'}
    ],
    [
        {n: '5', l: 'mang'}, {n: '6', l: 'ka'}, {n: '6', l: 'kan'}, {n: '6', l: 'thi'}, 
        {n: '6', l: 'ning'}, {n: '1^', l: 'tu'}, {n: '2^', l: 'mu'}, {n: '2^', l: 'wuh'}
    ],
    [
        {n: '2^', l: 'sa'}, {n: '2^', l: 'la'}, {n: '1^', l: 'mi'}, {n: '1^', l: 'mung'}, 
        {n: '6', l: 'a'}, {n: '6', l: 'was'}, {n: '1^', l: 'was'}, {n: '5', l: 'e'}, {n: '6', l: 'ling'}
    ],
    [
        {n: '5', l: 'e'}, {n: '6', l: 'ling'}, {n: '1^', l: 'lu'}, {n: '1^', l: 'ki'}, 
        {n: '1^', l: 'ta'}, {n: '1^', l: 'ning'}, {n: '1^', l: 'a'}, {n: '6', l: 'lam'}, {n: '1^', l: 'lam'}
    ],
    [
        {n: '5', l: 'da'}, {n: '5', l: 'di'}, {n: '5', l: 'wir'}, {n: '5', l: 'ya'}, 
        {n: '5', l: 'ning'}, {n: '2', l: 'du'}, {n: '3', l: 'ma'}, {n: '2', l: 'ma'}, {n: '1', l: 'di'}
    ],
    [
        {n: '1', l: 'su'}, {n: '2', l: 'pa'}, {n: '3', l: 'di'}, {n: '5', l: 'nir'}, 
        {n: '5', l: 'ing'}, {n: '5', l: 'sang'}, {n: '5', l: 'sa'}, {n: '5', l: 'ya'}
    ],
    [
        {n: '3', l: 'ye'}, {n: '2', l: 'ku'}, {n: '2', l: 'pang'}, {n: '2', l: 'rek'}, 
        {n: '2', l: 'sa'}, {n: '3', l: 'ning'}, {n: '2', l: 'ning'}, {n: '3', l: 'u'}, {n: '5', l: 'rip'}
    ]
];

let audioContext;
let analyser;
let microphone;
let floatDataArray;
let detector;
let animationId;

let isPlaying = false;
let isLevelComplete = false;

// Game states
let score = 0;
let currentLevel = 0;
let noteIndex = 0;
let bouncesRemaining = 4;
let invulnerableFrames = 0;

let currentPitch = 0;
let volumeThreshold = 0.01; // Threshold awal

// Calibration DOM Elements
const calibVolume = document.getElementById('calibVolume');
const calibRawVoice = document.getElementById('calibRawVoice');
const calibFreq = document.getElementById('calibFreq');
const calibSmoothed = document.getElementById('calibSmoothed');
const threshSlider = document.getElementById('volumeThreshold');
const threshDisplay = document.getElementById('threshDisplay');

// Update Threshold Slider
threshSlider.addEventListener('input', (e) => {
    volumeThreshold = parseFloat(e.target.value);
    threshDisplay.innerText = volumeThreshold.toFixed(3);
});

// Game Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const nextLevelBtn = document.getElementById('nextLevelBtn');

const startOverlay = document.getElementById('startOverlay');
const preCalibOverlay = document.getElementById('preCalibOverlay');
const liveCalibHz = document.getElementById('liveCalibHz');
const manualHzInput = document.getElementById('manualHzInput');
const lockPitchBtn = document.getElementById('lockPitchBtn');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const levelCompleteOverlay = document.getElementById('levelCompleteOverlay');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownTitle = document.getElementById('countdownTitle');
const countdownSubtitle = document.getElementById('countdownSubtitle');
const countdownTimer = document.getElementById('countdownTimer');

const victoryOverlay = document.getElementById('victoryOverlay');
const victoryScore = document.getElementById('victoryScore');
const victoryRestartBtn = document.getElementById('victoryRestartBtn');

const scoreDisplay = document.getElementById('scoreDisplay');
const levelDisplay = document.getElementById('levelDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const noteDisplay = document.getElementById('noteDisplay');
const finalScore = document.getElementById('finalScore');

// Game Entities
let ball = {
    x: 100,
    y: canvas.height,
    radius: 15,
    targetY: canvas.height
};

let obstacles = [];
const OBSTACLE_WIDTH = 60;
const OBSTACLE_SPEED = 1.5;
const HOLE_HEIGHT = 120;
let frameCount = 0;
let nextSpawnFrame = 0;

// Convert Frequency to Y position on canvas
function getPitchYPosition(freq) {
    if (freq === -1 || freq < canvasMinFreq - 10) return canvas.height;
    
    let clampedFreq = Math.max(canvasMinFreq, Math.min(freq, canvasMaxFreq));
    
    // Logarithmic-like mapping (using simple linear for now)
    let percent = (clampedFreq - canvasMinFreq) / (canvasMaxFreq - canvasMinFreq);
    
    let y = canvas.height - (percent * canvas.height);
    
    const margin = ball.radius + 10;
    if (y < margin) y = margin;
    if (y > canvas.height - margin) y = canvas.height - margin;
    
    return y;
}

function getClosestNoteName(freq) {
    if (freq === -1 || freq < canvasMinFreq - 10) return "-";
    if (NOTES.length === 0) return "-";
    let closest = NOTES[0];
    let minDiff = Math.abs(freq - closest.freq);
    
    for(let i = 1; i < NOTES.length; i++) {
        let diff = Math.abs(freq - NOTES[i].freq);
        if (diff < minDiff) {
            minDiff = diff;
            closest = NOTES[i];
        }
    }
    return closest.name;
}

async function startAudio() {
    try {
        startBtn.innerText = "Mengaktifkan Mikrofon...";
        startBtn.disabled = true;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.8;
        
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        floatDataArray = new Float32Array(analyser.fftSize);
        detector = PitchDetector.forFloat32Array(analyser.fftSize);

        // Tanpa loading AI/Algoritma pitch, langsung mulai game
        startBtn.innerText = "Mulai Bermain";
        startBtn.disabled = false;
        currentLevel = 0;
        score = 0;
        
        // Mulai fase kalibrasi
        startOverlay.classList.add('hidden');
        preCalibOverlay.classList.remove('hidden');
        isCalibrating = true;
        calibrationLoop();

    } catch (err) {
        alert("Gagal mengakses mikrofon: " + err);
        startBtn.innerText = "Mulai Bermain";
        startBtn.disabled = false;
    }
}

function spawnObstacle() {
    if (noteIndex >= LEVELS[currentLevel].length) {
        // Cek jika rintangan habis dan baris selesai
        if (obstacles.length === 0 && !isLevelComplete) {
            triggerLevelComplete();
        }
        return;
    }

    const targetNote = LEVELS[currentLevel][noteIndex];
    const targetNoteObj = NOTES.find(n => n.name === targetNote.n);
    const targetFreq = targetNoteObj ? targetNoteObj.freq : NOTES[0].freq;
    const holeY = getPitchYPosition(targetFreq);

    let width = OBSTACLE_WIDTH;
    let gap = 140; // Jarak standar (sama seperti sebelum diupdate)

    // Pola Macapat hanya berlaku untuk lagu utama (currentLevel >= 2)
    if (currentLevel >= 2) {
        // Tiap suku kata genap (index 1, 3, 5, 7) dibuat panjang dan senggangnya panjang
        let isLong = (noteIndex % 2 !== 0); 
        width = isLong ? OBSTACLE_WIDTH * 2 : OBSTACLE_WIDTH;
        gap = isLong ? 220 : 60; // Jeda panjang (senggang) vs Jeda pendek antar kata
    }

    obstacles.push({
        x: canvas.width,
        holeY: holeY,
        noteName: targetNote.n,
        lyric: targetNote.l,
        passed: false,
        width: width
    });
    
    // Tentukan kapan rintangan berikutnya akan muncul
    // = frame saat ini + waktu rintangan ini lewat sepenuhnya + jeda
    nextSpawnFrame = frameCount + (width / OBSTACLE_SPEED) + gap;
    
    noteIndex++;
}

function triggerLevelComplete() {
    isLevelComplete = true;
    isPlaying = false;
    levelCompleteOverlay.classList.remove('hidden');
}

function update() {
    if (!isPlaying) return;

    // AMBIL DATA AUDIO
    analyser.getFloatTimeDomainData(floatDataArray);
    
    let sumSquares = 0;
    for (let i = 0; i < floatDataArray.length; i++) {
        sumSquares += floatDataArray[i] * floatDataArray[i];
    }
    let rms = Math.sqrt(sumSquares / floatDataArray.length);
    
    calibVolume.innerText = rms.toFixed(4);
    if (rms < volumeThreshold) {
        calibVolume.style.color = '#ccc';
        calibFreq.innerText = 'Diam';
        calibSmoothed.innerText = '- Hz';
        if (calibRawVoice) calibRawVoice.innerText = '- Hz';
        // Saat diam, turunkan bola ke bawah secara perlahan
        ball.targetY = canvas.height;
        currentPitch = 0;
    } else {
        calibVolume.style.color = 'var(--primary)';
        
        let [freq, clarity] = detector.findPitch(floatDataArray, audioContext.sampleRate);
        
        // Clarify check untuk mengabaikan noise (0.8 adalah angka yang baik untuk suara nyanyian)
        if (clarity > 0.8 && freq !== -1 && !isNaN(freq) && freq !== Infinity && freq > 50) {
            
            // Tampilkan frekuensi asli suara mikrofon sebelum dikalikan
            if (calibRawVoice) {
                calibRawVoice.innerText = freq.toFixed(1) + ' Hz';
            }

            // OCTAVE MULTIPLIER (DIMATIKAN)
            // Menggunakan data asli mikrofon tanpa dikalikan
            // const voiceMultiplier = parseInt(document.getElementById('voiceType').value);
            // freq *= voiceMultiplier;

            calibFreq.innerText = freq.toFixed(1) + ' Hz';
            
            // Smoothing cerdas untuk mencegah jumping (outlier rejection)
            if (currentPitch === 0) {
                currentPitch = freq;
            } else {
                // Jika lompatan frekuensi sangat drastis (misal > 120 Hz)
                // Ini biasanya adalah glitch oktaf (sub-harmoni). Kita perlambat responnya.
                if (Math.abs(freq - currentPitch) > 120) {
                    currentPitch = (currentPitch * 0.95) + (freq * 0.05); 
                } else {
                    // Smoothing normal (sedikit diperhalus dari 0.8 ke 0.85)
                    currentPitch = (currentPitch * 0.85) + (freq * 0.15); 
                }
            }
            
            calibSmoothed.innerText = currentPitch.toFixed(1) + ' Hz';
            ball.targetY = getPitchYPosition(currentPitch);
            noteDisplay.innerText = getClosestNoteName(currentPitch);
        } else {
            // Suara bising tanpa nada yang jelas
            calibFreq.innerText = 'Noise / Diam';
            if (calibRawVoice) calibRawVoice.innerText = '- Hz';
        }
    }

    // Interpolate ball Y position (Smooth movement)
    ball.y += (ball.targetY - ball.y) * 0.15;
    
    // Smoothly return ball X to 100 if it was bounced back
    if (ball.x < 100) {
        ball.x += (100 - ball.x) * 0.05;
    }

    if (invulnerableFrames > 0) {
        invulnerableFrames--;
    }

    frameCount++;
    if (frameCount >= nextSpawnFrame) { // Gunakan pola waktu dinamis
        spawnObstacle();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.x -= OBSTACLE_SPEED;

        // Collision detection
        if (obs.x < ball.x + ball.radius && obs.x + obs.width > ball.x - ball.radius) {
            // Check if ball is outside the hole
            if (ball.y - ball.radius < obs.holeY - HOLE_HEIGHT / 2 || 
                ball.y + ball.radius > obs.holeY + HOLE_HEIGHT / 2) {
                
                if (invulnerableFrames <= 0) {
                    livesDisplay.innerText = '❤️ ∞';
                    
                    // Bounce effect (bola didorong mundur tapi tidak mengurangi nyawa)
                    ball.x = obs.x - ball.radius - 20; 
                    invulnerableFrames = 90; // Kebal ~1.5 detik
                }
            }
        }

        // Score logic
        if (obs.x + obs.width < ball.x && !obs.passed) {
            obs.passed = true;
            score++;
            scoreDisplay.innerText = score;
        }

        // Remove off-screen obstacles
        if (obs.x + obs.width < 0) {
            obstacles.splice(i, 1);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines for notes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '16px Outfit';
    ctx.textAlign = 'left';
    
    NOTES.forEach(note => {
        let y = getPitchYPosition(note.freq);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
        
        let displayName = note.name.replace('^', '̇');
        ctx.fillText(displayName, 10, y - 5);
    });

    // Draw obstacles (Walls with holes)
    obstacles.forEach(obs => {
        ctx.fillStyle = '#4a2511'; // Warna kayu
        
        ctx.fillRect(obs.x, 0, obs.width, obs.holeY - HOLE_HEIGHT / 2);
        ctx.fillRect(obs.x, obs.holeY + HOLE_HEIGHT / 2, obs.width, canvas.height);
        
        // Draw Note Label and Lyric (Javanese Solmization)
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 22px Outfit';
        ctx.textAlign = 'center';
        let displayNoteName = obs.noteName.replace('^', '̇'); // ganti tanda ^ dengan titik atas untuk notasi
        ctx.fillText(displayNoteName, obs.x + obs.width/2, obs.holeY - 2);
        
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '18px Outfit';
        
        let solmization = '';
        if (obs.noteName === '1') solmization = 'ji';
        else if (obs.noteName === '2') solmization = 'ro';
        else if (obs.noteName === '3') solmization = 'lu';
        else if (obs.noteName === '4') solmization = 'pat';
        else if (obs.noteName === '5') solmization = 'mo';
        else if (obs.noteName === '6') solmization = 'nem';
        else if (obs.noteName === '1^') solmization = 'ji̇'; // ji titik atas
        else if (obs.noteName === '2^') solmization = 'rȯ'; // ro titik atas
        else solmization = obs.lyric; // fallback
        
        ctx.fillText(solmization, obs.x + obs.width/2, obs.holeY + 20);
    });

    // Draw Ball (with blink effect if invulnerable)
    if (invulnerableFrames > 0 && Math.floor(frameCount / 10) % 2 === 0) {
        // Skip draw to create blink effect
    } else {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = (invulnerableFrames > 0) ? '#FFFFFF' : '#FF6B6B'; 
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = (invulnerableFrames > 0) ? '#FFFFFF' : '#FF6B6B';
        ctx.closePath();
    }
    
    ctx.shadowBlur = 0;
}

function gameLoop() {
    if (!isPlaying && !isLevelComplete) return; 
    
    if (isPlaying) {
        update();
    }
    draw();
    if (isPlaying || isLevelComplete) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

let isCalibrating = false;
let calibAnimationId;

function calibrationLoop() {
    if (!isCalibrating) return;
    
    analyser.getFloatTimeDomainData(floatDataArray);
    let sumSquares = 0;
    for (let i = 0; i < floatDataArray.length; i++) {
        sumSquares += floatDataArray[i] * floatDataArray[i];
    }
    let rms = Math.sqrt(sumSquares / floatDataArray.length);
    
    if (rms >= volumeThreshold) {
        let [freq, clarity] = detector.findPitch(floatDataArray, audioContext.sampleRate);
        if (clarity > 0.8 && freq !== -1 && freq > 40 && freq < 1000) {
            liveCalibHz.innerText = freq.toFixed(1) + ' Hz';
            // Auto update input if it's not focused
            if (document.activeElement !== manualHzInput) {
                manualHzInput.value = Math.round(freq);
            }
        } else {
            liveCalibHz.innerText = 'Noise';
        }
    } else {
        liveCalibHz.innerText = '- Hz';
    }
    
    calibAnimationId = requestAnimationFrame(calibrationLoop);
}

lockPitchBtn.addEventListener('click', () => {
    isCalibrating = false;
    cancelAnimationFrame(calibAnimationId);
    
    basePitchHz = parseFloat(manualHzInput.value);
    if (isNaN(basePitchHz) || basePitchHz < 40) basePitchHz = 84;
    
    generateNotes(basePitchHz);
    
    preCalibOverlay.classList.add('hidden');
    showCountdown("Yuk Pemanasan!", "Pemanasan menggunakan nada Srembangan Naik", 5, startGame);
});

// Function for showing countdown
function showCountdown(title, subtitle, seconds, callback) {
    countdownTitle.innerText = title;
    countdownSubtitle.innerText = subtitle;
    preCalibOverlay.classList.add('hidden');
    countdownOverlay.classList.remove('hidden');
    startOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    levelCompleteOverlay.classList.add('hidden');
    victoryOverlay.classList.add('hidden');
    
    let time = seconds;
    countdownTimer.innerText = time;
    
    let interval = setInterval(() => {
        time--;
        if (time > 0) {
            countdownTimer.innerText = time;
        } else {
            clearInterval(interval);
            countdownOverlay.classList.add('hidden');
            callback();
        }
    }, 1000);
}

function startGame() {
    preCalibOverlay.classList.add('hidden');
    startOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    levelCompleteOverlay.classList.add('hidden');
    victoryOverlay.classList.add('hidden');
    
    obstacles = [];
    bouncesRemaining = "∞";
    noteIndex = 0;
    
    scoreDisplay.innerText = score;
    if (currentLevel === 0) {
        levelDisplay.innerText = "Pemanasan Naik";
    } else if (currentLevel === 1) {
        levelDisplay.innerText = "Pemanasan Turun";
    } else {
        levelDisplay.innerText = "Baris " + (currentLevel - 1) + " / " + (LEVELS.length - 2);
    }
    livesDisplay.innerText = '❤️ ∞';
    
    ball.x = 100;
    ball.y = canvas.height;
    ball.targetY = canvas.height;
    invulnerableFrames = 0;
    currentPitch = 0;
    
    isPlaying = true;
    isLevelComplete = false;
    frameCount = 0;
    nextSpawnFrame = 0; // Reset kapan obstacle pertama akan muncul
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    gameLoop();
}

function triggerVictory() {
    isPlaying = false;
    victoryScore.innerText = score;
    victoryOverlay.classList.remove('hidden');
    
    // Confetti effect!
    if (window.confetti) {
        var duration = 3000;
        var end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#fbbf24', '#f59e0b', '#10b981', '#3b82f6']
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#fbbf24', '#f59e0b', '#10b981', '#3b82f6']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }
}

function nextLevel() {
    currentLevel++;
    if (currentLevel === 1) {
        showCountdown("Kerja Bagus!", "Sekarang coba nada turun (Ro' ke Ji)", 3, startGame);
    } else if (currentLevel >= LEVELS.length) {
        triggerVictory();
    } else {
        startGame();
    }
}

function gameOver() {
    isPlaying = false;
    finalScore.innerText = score;
    gameOverOverlay.classList.remove('hidden');
    
    // Reset back to level 0 when dying completely
    currentLevel = 0;
}

startBtn.addEventListener('click', startAudio);
restartBtn.addEventListener('click', () => {
    score = 0;
    currentLevel = 0;
    showCountdown("Yuk Pemanasan!", "Pemanasan menggunakan nada Srembangan Naik", 5, startGame);
});
victoryRestartBtn.addEventListener('click', () => {
    score = 0;
    currentLevel = 0;
    showCountdown("Yuk Pemanasan!", "Pemanasan menggunakan nada Srembangan Naik", 5, startGame);
});
nextLevelBtn.addEventListener('click', nextLevel);
