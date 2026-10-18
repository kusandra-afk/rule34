// ============================================================
// Confetti Animation Engine
// ============================================================
let _cachedConfettiPerfMode = null;

export function spawnConfetti(container) {
    if (_cachedConfettiPerfMode === null) {
        _cachedConfettiPerfMode = localStorage.getItem('r34_low_power_mode') === 'true' || localStorage.getItem('r34_reduced_motion') === 'true' || localStorage.getItem('r34_puzzle_perf_mode') === 'true';
    }
    if (_cachedConfettiPerfMode) return;

    const existingCanvas = container.querySelector('.puzzle-confetti-canvas');
    if (existingCanvas) existingCanvas.remove();

    const canvas = document.createElement('canvas');
    canvas.className = 'puzzle-confetti-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '60000';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Получаем цвета из CSS переменных для синхронизации с темой
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff3b6b';
    const accentAltColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-alt').trim() || '#ff5e8c';
    const lightColor = getComputedStyle(document.documentElement).getPropertyValue('--light').trim() || '#f4f6fb';
    
    const colors = [
        accentColor,
        accentAltColor,
        '#f59e0b', 
        '#10b981', 
        '#3b82f6', 
        '#f472b6', 
        '#a78bfa', 
        '#22d3ee'
    ];
    const pieces = [];

    for (let i = 0; i < 80; i++) {
        const shapeRoll = Math.random();
        let shape = 'rect';
        if (shapeRoll > 0.7) shape = 'circle';
        else if (shapeRoll > 0.5) shape = 'star';

        pieces.push({
            x: Math.random() * width,
            y: Math.random() * -height - 20,
            r: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            tiltAngleIncremental: Math.random() * 0.08 + 0.03,
            tiltAngle: Math.random() * Math.PI,
            speed: Math.random() * 3 + 2,
            shape: shape,
            width: Math.random() * 8 + 6,
            height: Math.random() * 14 + 6,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: Math.random() * 0.04 - 0.02
        });
    }

    let animationFrameId;
    const startTime = Date.now();
    const duration = 4000;

    function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
        let rot = Math.PI / 2 * 3;
        let step = Math.PI / spikes;
        ctx.beginPath();
        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
            rot += step;
            ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
        ctx.fill();
    }

    function update() {
        if (!canvas.isConnected) {
            cancelAnimationFrame(animationFrameId);
            return;
        }
        const elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            cancelAnimationFrame(animationFrameId);
            canvas.remove();
            return;
        }

        ctx.clearRect(0, 0, width, height);
        let active = false;

        for (let i = 0; i < pieces.length; i++) {
            const p = pieces[i];
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += p.speed;
            p.x += Math.sin(p.tiltAngle) * 0.6 + Math.sin(elapsed / 500 + p.tiltAngle) * 0.4;
            p.rotation += p.rotationSpeed;

            if (p.y < height + 20) {
                active = true;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;

            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;

            if (elapsed > duration - 1000) {
                ctx.globalAlpha = 1 - (elapsed - (duration - 1000)) / 1000;
            } else {
                ctx.globalAlpha = 0.95;
            }

            if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.r, 0, Math.PI * 2, true);
                ctx.fill();
            } else if (p.shape === 'star') {
                drawStar(ctx, 0, 0, 5, p.r + 2, p.r * 0.4);
            } else {
                ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
            }
            ctx.restore();
        }

        if (active) {
            animationFrameId = requestAnimationFrame(update);
        } else {
            canvas.remove();
        }
    }
    update();
}
