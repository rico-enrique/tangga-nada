// Tangga Nada Frekuensi (C Major Scale approximate frequencies in Hz)
// Kita menggunakan oktaf 4 (C4 - C5) sebagai referensi standar untuk suara
const NOTES = [
    { name: 'Do', freq: 261.63 }, // C4
    { name: 'Re', freq: 293.66 }, // D4
    { name: 'Mi', freq: 329.63 }, // E4
    { name: 'Fa', freq: 349.23 }, // F4
    { name: 'So', freq: 392.00 }, // G4
    { name: 'La', freq: 440.00 }, // A4
    { name: 'Ti', freq: 493.88 }, // B4
    { name: 'Do^', freq: 523.25 } // C5
];

let audioContext;
let analyser;
let microphone;
let pitch; // Model TensorFlow ml5.js
let latestDetectedFreq = -1;
let isPlaying = false;
let score = 0;
let currentPitch = 0;
let volumeThreshold = 0.02; // Threshold awal

// Calibration DOM Elements
const calibVolume = document.getElementById('calibVolume');
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
const startOverlay = document.getElementById('startOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const scoreDisplay = document.getElementById('scoreDisplay');
const noteDisplay = document.getElementById('noteDisplay');
const finalScore = document.getElementById('finalScore');

// Game Entities
let ball = {
    x: 100,
    y: canvas.height / 2,
    radius: 15,
    targetY: canvas.height / 2
};

let obstacles = [];
const OBSTACLE_WIDTH = 60;
const OBSTACLE_SPEED = 1.5; // Diperlambat dari 3
const HOLE_HEIGHT = 120; // Diperbesar sedikit agar lebih mudah
let frameCount = 0;

// Menghitung batas kebisingan suara
function getRMS(buffer) {
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
        rms += buffer[i] * buffer[i];
    }
    return Math.sqrt(rms / buffer.length);
}

// Convert frequency to Y position on canvas
function getPitchYPosition(freq) {
    if (freq === -1) return ball.y; // Tetap di posisi jika tidak ada suara
    
    // Cari rentang frekuensi
    const minFreq = NOTES[0].freq * 0.8; // Sedikit di bawah Do
    const maxFreq = NOTES[NOTES.length-1].freq * 1.2; // Sedikit di atas Do tinggi

    // Posisikan: frekuensi rendah di bawah (y besar), tinggi di atas (y kecil)
    let y = canvas.height - ((freq - minFreq) / (maxFreq - minFreq)) * canvas.height;
    
    // Clamp
    if (y < 0) y = 0;
    if (y > canvas.height) y = canvas.height;
    
    return y;
}

function getClosestNoteName(freq) {
    if (freq === -1) return "-";
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
        startBtn.innerText = "Memuat AI Model...";
        startBtn.disabled = true;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Memuat Model Pitch Detection CREPE (Tensorflow.js)
        pitch = ml5.pitchDetection(
            'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/',
            audioContext,
            stream,
            modelLoaded
        );

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

    } catch (err) {
        alert("Gagal mengakses mikrofon: " + err);
        startBtn.innerText = "Mulai Bermain";
        startBtn.disabled = false;
    }
}

function modelLoaded() {
    startBtn.innerText = "Mulai Bermain";
    startBtn.disabled = false;
    startGame();
    getPitchLoop(); // Jalankan loop deteksi TensorFlow
}

// Loop asinkronous untuk membaca pitch dari TensorFlow
function getPitchLoop() {
    if (pitch && isPlaying) {
        pitch.getPitch((err, frequency) => {
            if (frequency) {
                latestDetectedFreq = frequency;
            } else {
                latestDetectedFreq = -1;
            }
            getPitchLoop(); // Panggil lagi
        });
    }
}

function spawnObstacle() {
    // Pilih nada target secara acak
    const randomNoteIndex = Math.floor(Math.random() * NOTES.length);
    const targetFreq = NOTES[randomNoteIndex].freq;
    const holeY = getPitchYPosition(targetFreq);

    obstacles.push({
        x: canvas.width,
        holeY: holeY,
        noteName: NOTES[randomNoteIndex].name,
        passed: false
    });
}

function update() {
    if (!isPlaying) return;

    // Cek Volume untuk Noise Threshold
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    let rms = getRMS(buffer);
    
    // Update Volume di Panel Kalibrasi
    calibVolume.innerText = rms.toFixed(4);
    if (rms < volumeThreshold) {
        calibVolume.style.color = '#ccc';
    } else {
        calibVolume.style.color = 'var(--primary)';
    }

    // Gunakan frekuensi dari ML5 jika melebihi batas noise
    let rawPitch = (rms >= volumeThreshold) ? latestDetectedFreq : -1;
    
    if (rawPitch !== -1) {
        calibFreq.innerText = rawPitch.toFixed(1) + ' Hz';
        
        // Filter pitch menggunakan Low-pass filter agar tidak lompat-lompat
        if (currentPitch === 0 || currentPitch === -1) {
            currentPitch = rawPitch;
        } else {
            // Memadukan 80% nada sebelumnya dengan 20% nada baru (membuatnya stabil)
            currentPitch = (currentPitch * 0.8) + (rawPitch * 0.2); 
        }
        
        calibSmoothed.innerText = currentPitch.toFixed(1) + ' Hz';
        ball.targetY = getPitchYPosition(currentPitch);
        noteDisplay.innerText = getClosestNoteName(currentPitch);
    } else {
        calibFreq.innerText = '- Hz';
        calibSmoothed.innerText = '- Hz';
        // Jangan ubah currentPitch agar bola tetap di posisinya,
        // tapi kita biarkan perlahan turun (pilihan, saat ini ditahan)
    }

    // Interpolate ball Y position (Smooth movement agar pergerakan bola lebih lembut)
    ball.y += (ball.targetY - ball.y) * 0.05;

    // Update obstacles
    frameCount++;
    if (frameCount % 220 === 0) { // Spawn rate diperlambat
        spawnObstacle();
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.x -= OBSTACLE_SPEED;

        // Collision detection
        if (obs.x < ball.x + ball.radius && obs.x + OBSTACLE_WIDTH > ball.x - ball.radius) {
            // Check if ball is outside the hole
            if (ball.y - ball.radius < obs.holeY - HOLE_HEIGHT / 2 || 
                ball.y + ball.radius > obs.holeY + HOLE_HEIGHT / 2) {
                gameOver();
            }
        }

        // Score logic
        if (obs.x + OBSTACLE_WIDTH < ball.x && !obs.passed) {
            obs.passed = true;
            score++;
            scoreDisplay.innerText = score;
        }

        // Remove off-screen obstacles
        if (obs.x + OBSTACLE_WIDTH < 0) {
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
        ctx.fillText(note.name, 10, y - 5);
    });

    // Draw obstacles (Walls with holes)
    obstacles.forEach(obs => {
        ctx.fillStyle = '#4a2511'; // Warna kayu
        
        // Wall Top
        ctx.fillRect(obs.x, 0, OBSTACLE_WIDTH, obs.holeY - HOLE_HEIGHT / 2);
        // Wall Bottom
        ctx.fillRect(obs.x, obs.holeY + HOLE_HEIGHT / 2, OBSTACLE_WIDTH, canvas.height);
        
        // Draw Note Label inside the hole area
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 24px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(obs.noteName, obs.x + OBSTACLE_WIDTH/2, obs.holeY + 8);
    });

    // Draw Ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF6B6B'; // Warna bola primary
    ctx.fill();
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#FF6B6B';
    ctx.closePath();
    
    // Reset shadow
    ctx.shadowBlur = 0;
}

function gameLoop() {
    if (!isPlaying) return;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    startOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    obstacles = [];
    score = 0;
    scoreDisplay.innerText = score;
    ball.y = canvas.height / 2;
    isPlaying = true;
    frameCount = 0;
    
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    gameLoop();
    getPitchLoop(); // Pastikan loop ml5 berjalan kembali jika di-restart
}

function gameOver() {
    isPlaying = false;
    finalScore.innerText = score;
    gameOverOverlay.classList.remove('hidden');
}

startBtn.addEventListener('click', startAudio);
restartBtn.addEventListener('click', startGame);
