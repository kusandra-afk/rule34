import { fetchPuzzleCompleted, savePuzzleCompleted, fetchPostById } from '../api.js';
import { icon } from '../icons.js';

// ============================================================
// Web Audio API Retro Sound Effects (БЕЗ ИЗМЕНЕНИЙ)
// ============================================================
let audioCtx = null;
let _cachedPerfMode = null;

function playSound(type) {
    if (_cachedPerfMode === null) {
        _cachedPerfMode = localStorage.getItem('r34_low_power_mode') === 'true' || localStorage.getItem('r34_reduced_motion') === 'true' || localStorage.getItem('r34_puzzle_perf_mode') === 'true';
    }
    if (_cachedPerfMode) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);
            osc.frequency.exponentialRampToValueAtTime(750, now + 0.05);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'swap') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'wrong') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.22);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.start(now);
            osc.stop(now + 0.22);
        } else if (type === 'correct') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(660, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'tray' || type === 'fold') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(580, now + 0.10);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
            osc.start(now);
            osc.stop(now + 0.10);
        } else if (type === 'success') {
            const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, index) => {
                const t = now + index * 0.08;
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.connect(g);
                g.connect(audioCtx.destination);
                o.type = 'sine';
                o.frequency.setValueAtTime(freq, t);
                g.gain.setValueAtTime(0.09, t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                o.start(t);
                o.stop(t + 0.4);
            });
        }
    } catch (e) {
        console.warn("Web Audio API warning:", e);
    }
}

// ============================================================
// // ИЗМЕНЕНО: Конфетти — 80 частиц, свечение, новые цвета,
// убран resize-listener, добавлена форма "звезда"
// ============================================================
let _cachedConfettiPerfMode = null;

function spawnConfetti(container) {
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
    
    // // ИЗМЕНЕНО: Новые цвета (синхронизированы с темой)
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

    // // ИЗМЕНЕНО: 80 частиц вместо 110
    for (let i = 0; i < 80; i++) {
        const shapeRoll = Math.random();
        let shape = 'rect';
        if (shapeRoll > 0.7) shape = 'circle';
        else if (shapeRoll > 0.5) shape = 'star'; // // НОВАЯ форма

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

    // // ИЗМЕНЕНО: Функция рисования звезды
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
            // // ИЗМЕНЕНО: Добавлен горизонтальный "ветер"
            p.x += Math.sin(p.tiltAngle) * 0.6 + Math.sin(elapsed / 500 + p.tiltAngle) * 0.4;
            p.rotation += p.rotationSpeed;

            if (p.y < height + 20) {
                active = true;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;

            // // ИЗМЕНЕНО: Свечение частиц
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

// ============================================================
// Математика пазлов (БЕЗ ИЗМЕНЕНИЙ)
// ============================================================
function getJigsawPt(x1, y1, x2, y2, t, n_val, W, H) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    if (!W || !H) {
        const L = Math.hypot(vx, vy);
        if (L < 0.0001) return { x: x1, y: y1 };
        const ux = vx / L;
        const uy = vy / L;
        const nx = -uy;
        const ny = ux;
        return {
            x: x1 + t * vx + n_val * nx * L,
            y: y1 + t * vy + n_val * ny * L
        };
    }
    const nx = -vy * (H / W);
    const ny = vx * (W / H);
    return {
        x: x1 + t * vx + n_val * nx,
        y: y1 + t * vy + n_val * ny
    };
}

function getSeamBaselineN(t, seam) {
    if (!seam) return 0;
    const baseCurve = seam.baseCurve || 0;
    return baseCurve * Math.sin(t * Math.PI);
}

function getCanonicalJigsawSegments(x1, y1, x2, y2, seam, W, H) {
    const pos = seam.tabPos || 0.5;
    const size = seam.tabSize || 0.18;
    const rawWidth = seam.tabWidth || 0.18;
    const rawNeck = seam.neckWidth || 0.085;
    const width = Math.max(0.14, Math.min(0.28, rawWidth));
    const neck = Math.max(0.06, Math.min(width * 0.45, rawNeck));
    const h = size * (seam.dir || 1);
    const nBase = (t) => getSeamBaselineN(t, seam);
    const pt = (t, nTab) => getJigsawPt(x1, y1, x2, y2, t, nBase(t) + nTab, W, H);
    const startPt = pt(0, 0);
    const endPt = pt(1, 0);
    const segs = [];

    const curve = (pStart, pEnd, cp1YFunct, cp2YFunct) => {
        const cp1x = pStart.t + (pEnd.t - pStart.t) * 0.3;
        const cp2x = pStart.t + (pEnd.t - pStart.t) * 0.7;
        return {
            isLine: false,
            start: pt(pStart.t, pStart.nTab),
            cp1: pt(cp1x, cp1YFunct(pStart.nTab, pEnd.nTab)),
            cp2: pt(cp2x, cp2YFunct(pStart.nTab, pEnd.nTab)),
            end: pt(pEnd.t, pEnd.nTab)
        };
    };

    if (seam.shape === 'wavy') {
        const wBase = width * 0.8;
        const wNeck = neck * 0.45;
        const wBulb = width * 0.5;
        const pts = {
            p1: { t: pos - wBase, nTab: 0 },
            pDip1: { t: pos - (wBase + wNeck) * 0.5, nTab: -h * 0.15 },
            p2: { t: pos - wNeck, nTab: h * 0.35 },
            p3: { t: pos - wBulb, nTab: h * 0.95 },
            p4: { t: pos + wBulb, nTab: h * 0.95 },
            p5: { t: pos + wNeck, nTab: h * 0.35 },
            pDip2: { t: pos + (wBase + wNeck) * 0.5, nTab: -h * 0.15 },
            p6: { t: pos + wBase, nTab: 0 }
        };
        const t1 = pts.p1.t;
        segs.push({ isLine: false, start: startPt, cp1: pt(t1 * 0.33, 0), cp2: pt(t1 * 0.66, 0), end: pt(t1, 0) });
        segs.push(curve(pts.p1, pts.pDip1, (sn) => sn, (sn, en) => en));
        segs.push(curve(pts.pDip1, pts.p2, (sn) => sn, (sn, en) => en - h * 0.1));
        segs.push(curve(pts.p2, pts.p3, (sn, en) => sn + h * 0.3, (sn, en) => en - h * 0.1));
        segs.push({ isLine: false, start: pt(pts.p3.t, pts.p3.nTab), cp1: pt(pts.p3.t + (pts.p4.t - pts.p3.t) * 0.1, pts.p3.nTab + h * 0.25), cp2: pt(pts.p4.t - (pts.p4.t - pts.p3.t) * 0.1, pts.p4.nTab + h * 0.25), end: pt(pts.p4.t, pts.p4.nTab) });
        segs.push(curve(pts.p4, pts.p5, (sn) => sn - h * 0.1, (sn, en) => en + h * 0.3));
        segs.push(curve(pts.p5, pts.pDip2, (sn) => sn - h * 0.1, (sn, en) => en));
        segs.push(curve(pts.pDip2, pts.p6, (sn) => sn, (sn, en) => en));
        const t6 = pts.p6.t;
        const tSpan = 1 - t6;
        segs.push({ isLine: false, start: pt(t6, 0), cp1: pt(t6 + tSpan * 0.33, 0), cp2: pt(t6 + tSpan * 0.66, 0), end: endPt });
    } else {
        const wBase = width * 0.5;
        const wNeck = neck * 0.5;
        const wBulb = width * 0.4;
        const pts = {
            p1: { t: pos - wBase, nTab: 0 },
            p2: { t: pos - wNeck, nTab: h * 0.3 },
            p3: { t: pos - wBulb, nTab: h * 0.9 },
            p4: { t: pos + wBulb, nTab: h * 0.9 },
            p5: { t: pos + wNeck, nTab: h * 0.3 },
            p6: { t: pos + wBase, nTab: 0 }
        };
        const t1 = pts.p1.t;
        segs.push({ isLine: false, start: startPt, cp1: pt(t1 * 0.33, 0), cp2: pt(t1 * 0.66, 0), end: pt(t1, 0) });
        segs.push(curve(pts.p1, pts.p2, (sn) => sn, (sn, en) => en - h * 0.1));
        segs.push(curve(pts.p2, pts.p3, (sn, en) => sn + h * 0.3, (sn, en) => en - h * 0.1));
        segs.push({ isLine: false, start: pt(pts.p3.t, pts.p3.nTab), cp1: pt(pts.p3.t + (pts.p4.t - pts.p3.t) * 0.1, pts.p3.nTab + h * 0.25), cp2: pt(pts.p4.t - (pts.p4.t - pts.p3.t) * 0.1, pts.p4.nTab + h * 0.25), end: pt(pts.p4.t, pts.p4.nTab) });
        segs.push(curve(pts.p4, pts.p5, (sn) => sn - h * 0.1, (sn, en) => en + h * 0.3));
        segs.push(curve(pts.p5, pts.p6, (sn) => sn - h * 0.1, (sn, en) => en));
        const t6 = pts.p6.t;
        const tSpan = 1 - t6;
        segs.push({ isLine: false, start: pt(t6, 0), cp1: pt(t6 + tSpan * 0.33, 0), cp2: pt(t6 + tSpan * 0.66, 0), end: endPt });
    }
    return segs;
}

function drawJigsawEdge(x1, y1, x2, y2, isReverse, seam, W, H) {
    if (!seam || !seam.shape) {
        return `L ${x2.toFixed(4)} ${y2.toFixed(4)}`;
    }
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 0.0001) return `L ${x2.toFixed(4)} ${y2.toFixed(4)}`;
    const f = n => n.toFixed(4);
    let segs;
    if (!isReverse) {
        segs = getCanonicalJigsawSegments(x1, y1, x2, y2, seam, W, H);
    } else {
        segs = getCanonicalJigsawSegments(x2, y2, x1, y1, seam, W, H);
    }
    let str = '';
    if (!isReverse) {
        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (seg.isLine) {
                str += ` L ${f(seg.end.x)} ${f(seg.end.y)}`;
            } else {
                str += ` C ${f(seg.cp1.x)} ${f(seg.cp1.y)}, ${f(seg.cp2.x)} ${f(seg.cp2.y)}, ${f(seg.end.x)} ${f(seg.end.y)}`;
            }
        }
    } else {
        for (let i = segs.length - 1; i >= 0; i--) {
            const seg = segs[i];
            if (seg.isLine) {
                str += ` L ${f(seg.start.x)} ${f(seg.start.y)}`;
            } else {
                str += ` C ${f(seg.cp2.x)} ${f(seg.cp2.y)}, ${f(seg.cp1.x)} ${f(seg.cp1.y)}, ${f(seg.start.x)} ${f(seg.start.y)}`;
            }
        }
    }
    return str;
}

// ============================================================
// Основной класс PuzzleGame
// ============================================================
export class PuzzleGame {
    constructor(post, onClose, onNext) {
        this.post = post;
        this.onClose = onClose;
        this.onNext = onNext;
        this.mode = 'complex';
        this.lowPowerMode = localStorage.getItem('r34_low_power_mode') === 'true';
        this.reducedMotion = localStorage.getItem('r34_reduced_motion') === 'true' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        this.puzzlePerfMode = localStorage.getItem('r34_puzzle_perf_mode') === 'true';

        const weightedTargets = [36, 36, 36, 49, 49, 49, 64, 64, 81, 81, 100, 100];
        const targetPool = (this.lowPowerMode || this.puzzlePerfMode || this.reducedMotion) ? [25, 36, 36, 49, 49] : weightedTargets;
        this.targetPieces = localStorage.getItem('puzzleTargetPieces') ? parseInt(localStorage.getItem('puzzleTargetPieces'), 10) : targetPool[Math.floor(Math.random() * targetPool.length)];
        this.shapeStyle = localStorage.getItem('puzzleShapeStyle') || ((this.lowPowerMode || this.puzzlePerfMode || this.reducedMotion) ? 'classic' : 'angular');
        this.trayColsUser = localStorage.getItem('puzzleTrayCols') ? parseInt(localStorage.getItem('puzzleTrayCols'), 10) : null;
        this.tiles = [];
        this.gridJunctions = [];
        this.horizSeams = [];
        this.vertSeams = [];
        this.tileElements = new Map();
        this.tileById = new Map();
        this.groupTiles = new Map();
        this.tileShapeCache = new Map();
        this.correctTilePositionCache = new Map();
        this.selectedIdx = null;
        this.moves = 0;
        this.timerInterval = null;
        this.seconds = 0;
        this.isPlaying = false;
        this.hasWon = false;
        this.showHintActive = false;
        this.isHintActive = false;
        this.hintTimer = null;
        this.hintCountInterval = null;
        this.hintCooldownTimer = null;
        this.hintCooldown = 0;
        this.showNumbersActive = localStorage.getItem('puzzleShowNumbers') === 'true';
        this.isSolving = false;
        this.draggedTileId = null;
        this.lastDragTarget = null;
        this.autoScrollInterval = null;
        this._currentScrollSpeed = 0;
        this.gameId = 'pg_' + Math.random().toString(36).substring(2, 8);
        this._resourceLoadToken = 0;

        const isGif = (post.file_url?.split('.').pop() || '').toLowerCase() === 'gif';
        this.isGif = isGif; // // ИЗМЕНЕНО: сохраняем флаг для дальнейшего использования

        if (isGif) {
            this.imgUrl = post.file_url || '';
        } else {
            const isSaveData = localStorage.getItem('r34_save_data') === 'true';
            const useLightSource = this.lowPowerMode || this.puzzlePerfMode || this.reducedMotion;
            if (useLightSource) {
                this.imgUrl = post.sample_url || post.file_url || post.preview_url || '';
            } else {
                this.imgUrl = isSaveData ? (post.preview_url || post.sample_url || post.file_url || '') : (post.sample_url || post.file_url || post.preview_url || '');
            }
        }

        this.displayUrl = this.imgUrl;
        this.tileDisplayUrl = this.imgUrl;
        this.loadResource(this.imgUrl);
        this.overlay = null;

        let ratio = 1.0;
        if (post && post.width && post.height && post.width > 0 && post.height > 0) {
            ratio = post.width / post.height;
        }
        const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
        this.aspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.7, Math.min(1.8, ratio));
        this.updateGridDimensions();

        this._cachedTrayGrid = null;
        this._trayGridDirty = true;
        this._cachedBoardRect = null;
        this._cachedTrayRect = null;
        this._layoutBoardRect = null;
        this._layoutTrayRect = null;
        this._suppressLayoutReads = false;
        this._overlapFrame = null;
        this._dragSuppressNextClick = false;
        this._desktopDragState = null;
        this._desktopDragMoveHandler = null;
        this._desktopDragUpHandler = null;
        this._abortController = null;
        this._posToTileMap = new Map();
        this._dragRAFId = null;
        this._boardHToW = 1 / (this.aspectRatio || 1);
        this._resizeHandler = null;
        this.injectStyles();
    }

    calculateGrid(target, ratio) {
        const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
        
        // Ограничения на максимальный размер стороны
        const maxDim = allowLong ? 50 : 25;
        
        // Если изображение экстремально длинное или широкое и разрешены длинные картинки
        if (allowLong && (ratio < 0.5 || ratio > 2.0)) {
            let cols, rows;
            if (ratio < 1.0) {
                // Вертикальная картинка (ширина - короткая сторона)
                // Ограничиваем короткую сторону от 5 до maxDim
                cols = Math.max(5, Math.round(Math.sqrt(target * ratio)));
                cols = Math.min(maxDim, cols);
                // Высота подбирается так, чтобы элементы были идеально квадратными
                rows = Math.round(cols / ratio);
                rows = Math.max(5, Math.min(maxDim, rows));
                // Корректируем cols, если rows уперся в maxDim
                cols = Math.max(5, Math.min(maxDim, Math.round(rows * ratio)));
            } else {
                // Горизонтальная картинка (высота - короткая сторона)
                // Ограничиваем короткую сторону от 5 до maxDim
                rows = Math.max(5, Math.round(Math.sqrt(target / ratio)));
                rows = Math.min(maxDim, rows);
                // Ширина подбирается так, чтобы элементы были идеально квадратными
                cols = Math.round(rows * ratio);
                cols = Math.max(5, Math.min(maxDim, cols));
                // Корректируем rows, если cols уперся в maxDim
                rows = Math.max(5, Math.min(maxDim, Math.round(cols / ratio)));
            }
            return { cols, rows };
        }

        // Рассчитываем комфортный минимум для сторон в зависимости от желаемого числа деталей.
        // Для маленьких пазлов (16) допускаем минимум 3 детали по стороне.
        // Для средних и больших (36+) поднимаем планку, чтобы избежать длинных тонких полосок.
        const targetSide = Math.sqrt(target);
        const minDim = Math.max(3, Math.round(targetSide * 0.35));

        let bestCols = 0;
        let bestRows = 0;
        let bestScore = Infinity;

        // Поиск оптимальной сетки
        for (let c = 1; c <= maxDim; c++) {
            for (let r = 1; r <= maxDim; r++) {
                const total = c * r;
                
                // Проверяем разумные рамки по количеству деталей (в пределах 0.5x - 2.0x от целевого)
                if (total < target * 0.5 || total > target * 2.0) {
                    continue;
                }

                // Штраф за выход за пределы желаемого минимума по ширине/высоте
                let minDimPenalty = 0;
                if (c < minDim) minDimPenalty += (minDim - c) * 10;
                if (r < minDim) minDimPenalty += (minDim - r) * 10;

                // Для совсем экстремальных случаев (1 деталь по какой-то стороне) - огромный штраф
                if (c === 1) minDimPenalty += 100;
                if (r === 1) minDimPenalty += 100;

                // 1. Штраф за отклонение от целевого количества деталей
                const countRatio = total / target;
                const countPenalty = Math.pow(countRatio - 1, 2) * 5.0;

                // 2. Штраф за растянутость деталей (соотношение сторон отдельного пазла)
                const tileRatio = ratio * (r / c);
                // Используем логарифм, чтобы пропорционально оценивать растянутость (например, 2.0 и 0.5 одинаково штрафуются)
                const ratioPenalty = Math.pow(Math.log(tileRatio), 2) * 2.5;

                const score = countPenalty + ratioPenalty + minDimPenalty;

                if (score < bestScore) {
                    bestScore = score;
                    bestCols = c;
                    bestRows = r;
                }
            }
        }

        // Если не удалось найти подходящий вариант в цикле, используем дефолтный простой расчет
        if (bestCols === 0 || bestRows === 0) {
            bestCols = Math.max(2, Math.round(Math.sqrt(target * ratio)));
            bestRows = Math.max(2, Math.round(bestCols / ratio));
        }

        return { cols: bestCols, rows: bestRows };
    }

    updateGridDimensions() {
        let ratio = this.aspectRatio || 1.0;
        let target = this.targetPieces || 36;
        const { cols, rows } = this.calculateGrid(target, ratio);
        this.cols = cols;
        this.rows = rows;
    }

    updateDifficultyUI() {
        const root = this.overlay || document.querySelector('.puzzle-overlay');
        if (!root) return;
        const selector = root.querySelector('.puzzle-difficulty-selector');
        if (!selector) return;

        // Полностью очищаем и заново генерируем уникальные кнопки сложностей во избежание дублирования
        selector.innerHTML = '';

        const baseTargets = [16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 324, 400];
        const diffs = [];
        const seenSizes = new Set();
        baseTargets.forEach(target => {
            const { cols: c, rows: r } = this.calculateGrid(target, this.aspectRatio || 1.0);
            const exactPieces = c * r;
            const sizeKey = `${c}x${r}`;
            if (!seenSizes.has(sizeKey)) {
                seenSizes.add(sizeKey);
                diffs.push({ target: target, cols: c, rows: r, label: `${exactPieces} дет. (${c}x${r})` });
            }
        });

        diffs.forEach(d => {
            const btn = document.createElement('button');
            const isActive = (d.cols === this.cols && d.rows === this.rows);
            btn.className = `puzzle-diff-btn ${isActive ? 'active' : ''}`;
            btn.dataset.target = d.target;
            btn.textContent = d.label;
            btn.onclick = () => this.changeDifficulty(d.target);
            selector.appendChild(btn);
        });
    }

    // ============================================================
    // loadResource (БЕЗ ИЗМЕНЕНИЙ)
    // ============================================================
    async loadResource(url) {
        if (!url) return;
        const loadToken = ++this._resourceLoadToken;
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();
        const signal = this._abortController.signal;

        if (this.displayUrl && this.displayUrl.startsWith('blob:') && this.originalUrl === url) {
            this.tileDisplayUrl = this.displayUrl;
            this.updateAllImages();
            return;
        }

        this.originalUrl = url;
        if (!this.displayUrl || this.displayUrl.startsWith('blob:') || this.displayUrl !== url) {
            this.displayUrl = url;
            this.tileDisplayUrl = url;
            this.updateAllImages();
        }

        this.showLoader(true);
        this.updateLoaderProgress(0);
        this.updateLoaderText('Подключение...');

        try {
            const response = await fetch(url, { mode: 'cors', signal });
            if (loadToken !== this._resourceLoadToken) return;
            if (!response.ok) throw new Error('CORS or network error');

            const contentLength = response.headers.get('content-length');
            const total = parseInt(contentLength, 10);

            if (isNaN(total) || total <= 0) {
                this.updateLoaderText('Загрузка (размер неизвестен)...');
                const blob = await response.blob();
                if (loadToken === this._resourceLoadToken) this.handleBlob(blob, loadToken);
            } else {
                const reader = response.body.getReader();
                let loaded = 0;
                const chunks = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    const pct = (loaded / total) * 100;
                    this.updateLoaderProgress(pct);
                    this.updateLoaderText(`Загрузка: ${Math.round(loaded / 1024)} KB / ${Math.round(total / 1024)} KB`);
                }
                const blob = new Blob(chunks);
                if (loadToken === this._resourceLoadToken) this.handleBlob(blob, loadToken);
            }
        } catch (err) {
            if (loadToken !== this._resourceLoadToken) return;
            if (err.name === 'AbortError') {
                console.log('Fetch aborted by new load request');
                return;
            }
            console.warn('Fetch with progress failed, using direct URL fallback:', err);
            this.showLoader(false);
            if (this.displayUrl !== url) {
                this.displayUrl = url;
                this.tileDisplayUrl = url;
                this.updateAllImages();
            }
        }
    }

    async createStaticFrameForGif(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || 600;
                    canvas.height = img.naturalHeight || 600;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                    resolve(dataUrl);
                } catch (e) {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    updateAllImages() {
        if (!this.displayUrl) return;
        if (this.board && this.board.classList.contains('intro-mode')) {
            const bgUrl = `url("${this.displayUrl}")`;
            if (this.board.style.backgroundImage !== bgUrl) {
                this.board.style.backgroundImage = bgUrl;
                this.board.style.opacity = '0.4';
            }
        }
        const targetTileSrc = this.tileDisplayUrl || this.displayUrl;
        if (this.tileElements) {
            this.tileElements.forEach((el) => {
                const img = el.querySelector('.puzzle-tile-img img');
                if (img && img.src !== targetTileSrc) {
                    img.src = targetTileSrc;
                }
            });
        }
        if (this.hintOverlay) {
            const hintImg = this.hintOverlay.querySelector('img');
            if (hintImg && hintImg.src !== this.displayUrl) {
                hintImg.src = this.displayUrl;
            }
        }
    }

    showLoader(show) {
        if (!this.loaderOverlay) return;
        if (show) {
            this.loaderOverlay.classList.add('active');
        } else {
            this.loaderOverlay.classList.remove('active');
        }
    }

    updateLoaderProgress(pct) {
        if (!this.loaderProgressBar) return;
        this.loaderProgressBar.style.width = `${pct}%`;
    }

    updateLoaderText(text) {
        if (!this.loaderText) return;
        this.loaderText.textContent = text;
    }

    setControlsEnabled(enabled) {
        if (this.resetBtn) this.resetBtn.disabled = !enabled;
        if (this.hintBtn) this.hintBtn.disabled = !enabled;
        if (this.solveBtn) this.solveBtn.disabled = !enabled;
    }

    // ============================================================
    // // ИЗМЕНЕНО: handleBlob — для GIF создаём статичный кадр
    // ============================================================
    async handleBlob(blob, loadToken = null) {
        if (loadToken !== null && loadToken !== this._resourceLoadToken) return;

        if (this.displayUrl && this.displayUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.displayUrl);
        }

        this.displayUrl = URL.createObjectURL(blob);
        this.tileDisplayUrl = this.displayUrl;

        // // ИЗМЕНЕНО: Для GIF создаём статичный кадр для плиток
        // Это предотвращает 400 отдельных декодирований GIF
        if (this.isGif) {
            const staticFrame = await this.createStaticFrameForGif(this.displayUrl);
            if (staticFrame) {
                this.tileDisplayUrl = staticFrame;
            }
        }

        this.updateAllImages();
        this.updateLoaderProgress(100);
        setTimeout(() => {
            if (loadToken === null || loadToken === this._resourceLoadToken) {
                this.showLoader(false);
            }
        }, 400);
    }

    // ============================================================
    // updateBoardSize (БЕЗ ИЗМЕНЕНИЙ — функция слишком большая,
    // оставляем как есть)
    // ============================================================
    updateBoardSize(skipTiles = false) {
        if (!this.board || !this.boardContainer) return;
        
        const boardRatio = (this.cols && this.rows) ? (this.cols / this.rows) : (this.aspectRatio || 1.0);
        if (this.boardContainer.style.aspectRatio !== `${boardRatio}`) {
            this.boardContainer.style.aspectRatio = `${boardRatio}`;
        }
        
        const isDesktop = window.innerWidth >= 900;
        if (isDesktop && this.isComplexMode) {
            this.boardContainer.style.width = '100%';
            this.boardContainer.style.height = 'auto';
        } else {
            this.boardContainer.style.width = '';
            this.boardContainer.style.height = '';
        }

        this._trayGridDirty = true;
        let rect = this._suppressLayoutReads ? this._layoutBoardRect : null;
        if (!rect) {
            rect = this.board.getBoundingClientRect();
            this._layoutBoardRect = rect;
        }
        let trayRect = this._suppressLayoutReads ? this._layoutTrayRect : null;
        if (!trayRect && this.trayDiv) {
            trayRect = this.trayDiv.getBoundingClientRect();
            this._layoutTrayRect = trayRect;
        } else if (!trayRect) {
            trayRect = rect;
            this._layoutTrayRect = rect;
        }
        const w = Math.round(rect.width || this.board.clientWidth || 480);
        const h = Math.round(rect.height || this.board.clientHeight || (w / boardRatio) || 480);
        if (rect.width > 0 && rect.height > 0) {
            this._boardHToW = rect.height / rect.width;
        } else if (w > 0 && h > 0) {
            this._boardHToW = h / w;
        }
        if (w > 0 && h > 0) {
            this.board.style.setProperty('--bw', `${w}px`);
            this.board.style.setProperty('--bh', `${h}px`);
            const strokeLightW = Math.max(0.8, Math.min(3.5, (w / this.cols) * 0.038));
            const strokeDarkW = Math.max(0.6, Math.min(3.0, (w / this.cols) * 0.032));
            this.board.style.setProperty('--stroke-light-w', `${strokeLightW.toFixed(1)}px`);
            this.board.style.setProperty('--stroke-dark-w', `${strokeDarkW.toFixed(1)}px`);
            this.getTrayGrid();
            const { trayCellH, trayCols, isDesktop, trayWidthPct } = this._cachedTrayGrid;
            const totalTiles = this.cols * this.rows;
            const trayCount = this._trayTileCount || 0;
            let rows = Math.ceil(trayCount / trayCols);
            if (!this.isPlaying && this.winOverlay && this.winOverlay.classList.contains('visible')) {
                rows = Math.max(rows, isDesktop ? 2 : 3);
            }
            if (isDesktop) {
                if (this.trayDiv) {
                    this.trayDiv.style.position = 'relative';
                    this.trayDiv.style.top = '';
                    this.trayDiv.style.left = '';
                    this.trayDiv.style.width = '100%';
                    this.trayDiv.style.height = '';
                    this.trayDiv.style.maxHeight = 'none';
                    this.trayDiv.style.flex = '1';
                    this.trayDiv.style.minHeight = '300px';
                    this.trayDiv.style.overflowY = 'auto';
                    this.trayDiv.style.overflowX = 'hidden';
                    this.trayDiv.style.pointerEvents = 'auto';
                    this.trayDiv.style.scrollbarWidth = 'none';
                    this.trayDiv.style.msOverflowStyle = 'none';
                    if (!this.trayScrollbarStyle) {
                        this.trayScrollbarStyle = document.createElement('style');
                        this.trayScrollbarStyle.textContent = `.puzzle-tray::-webkit-scrollbar { display: none; }`;
                        document.head.appendChild(this.trayScrollbarStyle);
                    }
                    if (!this.trayScrollSpacer) {
                        this.trayScrollSpacer = document.createElement('div');
                        this.trayScrollSpacer.style.width = '1px';
                        this.trayScrollSpacer.style.pointerEvents = 'none';
                        this.trayDiv.appendChild(this.trayScrollSpacer);
                    }
                    const actualRows = Math.max(1, Math.ceil(trayCount / trayCols));
                    const gapBetween = 4;
                    const cellWidthPx = trayRect.width / trayCols;
                    const tileWidthPx = Math.max(20, cellWidthPx - gapBetween);
                    const boardHToW = this._boardHToW || 1;
                    const avgTileHToW = boardHToW * (this.cols / this.rows);
                    const trayRowHeightPx = tileWidthPx * avgTileHToW;
                    const totalTrayHeightPx = actualRows * (trayRowHeightPx + gapBetween) + 8;
                    this.trayScrollSpacer.style.height = `${totalTrayHeightPx}px`;
                }
                const newMargin = `20px`;
                if (this.boardContainer.style.marginBottom !== newMargin) {
                    this.boardContainer.style.marginBottom = newMargin;
                }
                const newTransform = `none`;
                if (this.boardContainer.style.transform !== newTransform) {
                    this.boardContainer.style.transform = newTransform;
                }
                this.boardContainer.classList.add('desktop-complex');
            } else {
                const maxMobileTrayHeightPx = Math.min(260, Math.max(180, h * 0.28));
                if (this.trayDiv) {
                    this.trayDiv.style.position = 'relative';
                    this.trayDiv.style.bottom = '';
                    this.trayDiv.style.zIndex = '';
                    this.trayDiv.style.flex = 'none';
                    this.trayDiv.style.minHeight = '';
                    this.trayDiv.style.top = '';
                    this.trayDiv.style.left = '0';
                    this.trayDiv.style.width = '100%';
                    this.trayDiv.style.height = `${Math.max(140, Math.min(340, maxMobileTrayHeightPx))}px`;
                    this.trayDiv.style.maxHeight = '38vh';
                    this.trayDiv.style.overflowY = 'auto';
                    this.trayDiv.style.overflowX = 'hidden';
                    this.trayDiv.style.scrollbarWidth = 'none';
                    this.trayDiv.style.msOverflowStyle = 'none';
                    if (!this.trayScrollSpacer) {
                        this.trayScrollSpacer = document.createElement('div');
                        this.trayScrollSpacer.style.width = '1px';
                        this.trayScrollSpacer.style.pointerEvents = 'none';
                        this.trayDiv.appendChild(this.trayScrollSpacer);
                    }
                    const gapBetween = 4;
                    const cellWidthPx = trayRect.width / trayCols;
                    const tileWidthPx = Math.max(20, cellWidthPx - gapBetween);
                    const boardHToW = this._boardHToW || 1;
                    const avgTileHToW = boardHToW * (this.cols / this.rows);
                    const trayRowHeightPx = tileWidthPx * avgTileHToW;
                    const actualRows = Math.max(1, Math.ceil(trayCount / trayCols));
                    const totalTrayHeightPx = actualRows * (trayRowHeightPx + gapBetween) + 8;
                    this.trayScrollSpacer.style.height = `${totalTrayHeightPx}px`;
                }
                const newMargin = `0px`;
                if (this.boardContainer.style.marginBottom !== newMargin) {
                    this.boardContainer.style.marginBottom = newMargin;
                }
                if (this.boardContainer.style.transform !== 'none') {
                    this.boardContainer.style.transform = 'none';
                }
                this.boardContainer.classList.remove('desktop-complex');
            }
            if (!skipTiles && this.tiles && this.tiles.length > 0) {
                this.tiles.forEach(tile => {
                    const el = this.tileElements.get(tile.id);
                    if (el) {
                        this.updateTileElementPosition(el, tile, true);
                    }
                });
            }
        }
    }

    // ============================================================
    // loadPostAndStart, start, closeLibraryModals, launchLibraryPuzzle
    // (БЕЗ ИЗМЕНЕНИЙ)
    // ============================================================
    async loadPostAndStart(post, targetPieces, imageUrlOverride = null) {
        if (typeof targetPieces === 'number') {
            this.targetPieces = targetPieces;
        }
        if (post) {
            this.post = post;
            let ratio = 1.0;
            if (post.width && post.height && post.width > 0 && post.height > 0) {
                ratio = post.width / post.height;
            }
            const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
            this.aspectRatio = allowLong ? Math.max(0.05, Math.min(20.0, ratio)) : Math.max(0.4, Math.min(1.8, ratio));
            this.updateGridDimensions();
            if (this.boardContainer) {
                const boardRatio = (this.cols && this.rows) ? (this.cols / this.rows) : this.aspectRatio;
                this.boardContainer.style.aspectRatio = `${boardRatio}`;
            }
            this._boardHToW = 1 / (this.aspectRatio || 1);
        } else {
            this.updateGridDimensions();
        }
        this.updateDifficultyUI(); // Update UI whenever grid or aspect ratio changes
        const imageUrl = imageUrlOverride || (this.post ? (this.post.sample_url || this.post.file_url || this.post.preview_url || '') : this.imgUrl || '') || this.imgUrl || '';
        if (imageUrl) {
            this.imgUrl = imageUrl;
            this.displayUrl = imageUrl;
            this.tileDisplayUrl = imageUrl;
            if (this.board) {
                this.board.classList.remove('cutting');
                this.board.style.backgroundImage = `url('${imageUrl}')`;
                this.board.style.backgroundSize = '100% 100%';
                this.board.style.backgroundPosition = 'center';
                this.board.style.backgroundRepeat = 'no-repeat';
                this.board.style.opacity = '1';
            }
            this.updateAllImages();
            await this.loadResource(imageUrl);
        }
        this.initPuzzle();
    }

    async start() {
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
        }
        document.body.style.overflow = 'hidden';
        if (window.gallery && window.gallery.observer) {
            window.gallery.observer.disconnect();
        }
        this.createUI();
        await this.loadPostAndStart(this.post, this.targetPieces, this.imgUrl);
    }

    closeLibraryModals() {
        document.querySelectorAll('.puzzle-stats-modal').forEach(modal => modal.remove());
    }

    async launchLibraryPuzzle(post, size, imageUrl) {
        if (window.puzzleGameInstance) {
            window.puzzleGameInstance.destroy();
        }
        window.puzzleGameActive = true;
        this.createUI();
        await this.loadPostAndStart(post, size, imageUrl);
    }

    // ============================================================
    // showCompletedModal, showPuzzleStats, getStableImageUrl,
    // getPuzzleImageUrl, resolvePuzzleImageUrl, saveCompletedPuzzle,
    // formatTime — БЕЗ ИЗМЕНЕНИЙ (слишком длинные, не трогаем)
    // ============================================================
    async showCompletedModal() {
        if (this._animationFrameId) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
        if (this.board) {
            this.board.style.display = 'none';
        }
        const loadingModal = document.createElement('div');
        loadingModal.className = 'keep-animation';
        loadingModal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:70000;animation:fadeIn 0.2s ease-out;`;
        const loadingContent = document.createElement('div');
        loadingContent.className = 'keep-animation';
        loadingContent.style.cssText = `background:rgba(30,30,35,0.95);color:white;padding:40px 50px;border-radius:20px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.5);border:1px solid rgba(16,185,129,0.3);animation:slideUp 0.3s cubic-bezier(0.4,0,0.2,1);`;
        const spinner = document.createElement('div');
        spinner.className = 'spinner keep-animation';
        spinner.style.cssText = `width:50px;height:50px;border:4px solid rgba(16,185,129,0.2);border-top:4px solid #10b981;border-radius:50%;margin:0 auto 20px;animation:spin 1s linear infinite;`;
        const loadingText = document.createElement('div');
        loadingText.textContent = 'Загрузка библиотеки...';
        loadingText.style.cssText = `font-size:1.2rem;font-weight:500;margin-bottom:10px;`;
        const loadingSubtext = document.createElement('div');
        loadingSubtext.textContent = 'Синхронизация с базой данных';
        loadingSubtext.style.cssText = `font-size:0.9rem;color:rgba(255,255,255,0.6);`;
        loadingContent.appendChild(spinner);
        loadingContent.appendChild(loadingText);
        loadingContent.appendChild(loadingSubtext);
        loadingModal.appendChild(loadingContent);
        document.body.appendChild(loadingModal);

        if (!document.getElementById('puzzle-library-animations')) {
            const style = document.createElement('style');
            style.id = 'puzzle-library-animations';
            style.textContent = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `;
            document.head.appendChild(style);
        }

        const completedPuzzles = await fetchPuzzleCompleted();
        loadingModal.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => loadingModal.remove(), 200);

        const modal = document.createElement('div');
        modal.className = 'puzzle-completed-modal';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.88);z-index:60000;display:flex;align-items:stretch;justify-content:stretch;opacity:0;transition:opacity 0.3s ease;`;
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `background:var(--modal-bg);border:none;border-radius:0;padding:28px;width:100vw;height:100vh;max-width:100vw;max-height:100vh;overflow-y:auto;box-shadow:none;transform:scale(0.98);transition:transform 0.3s ease;box-sizing:border-box;`;

        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--glass-border);`;
        const titleContainer = document.createElement('div');
        titleContainer.style.cssText = `display:flex;align-items:center;gap:12px;`;
        const title = document.createElement('h2');
        title.innerHTML = `${icon('trophy', { size: 24 })} Библиотека Пазлов`;
        title.style.cssText = `color:#10b981;font-size:1.5rem;font-weight:800;margin:0;text-shadow:0 0 20px rgba(16,185,129,0.3);`;
        const countBadge = document.createElement('span');
        countBadge.textContent = completedPuzzles.length;
        countBadge.style.cssText = `background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;font-size:0.85rem;font-weight:700;padding:4px 12px;border-radius:20px;box-shadow:0 4px 12px rgba(16,185,129,0.3);`;
        titleContainer.appendChild(title);
        titleContainer.appendChild(countBadge);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeBtn.style.cssText = `background:var(--glass-bg-strong);border:1px solid var(--glass-border);color:rgba(255,255,255,0.8);cursor:pointer;padding:8px;border-radius:var(--radius-sm);transition:all 0.2s;display:flex;align-items:center;justify-content:center;`;
        closeBtn.onmouseenter = () => { closeBtn.style.background = 'var(--accent)'; closeBtn.style.borderColor = 'var(--accent)'; closeBtn.style.color = '#fff'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'var(--glass-bg-strong)'; closeBtn.style.borderColor = 'var(--glass-border)'; closeBtn.style.color = 'rgba(255,255,255,0.8)'; };
        closeBtn.onclick = () => {
            modal.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
            setTimeout(() => {
                modal.remove();
                this._libraryOpen = false;
                if (this.board) {
                    this.board.style.display = 'grid';
                    if (this.isPlaying && this.board.classList.contains('intro-mode')) {
                        this.initPuzzle();
                    }
                }
                if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-stats-modal')) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
            }, 300);
        };
        header.appendChild(titleContainer);
        header.appendChild(closeBtn);

        const listContainer = document.createElement('div');
        
        // Адаптивная сетка для мобильных: минимум 2 колонки
        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            listContainer.style.cssText = `display:grid;grid-template-columns:repeat(2,1fr);gap:16px;`;
        } else {
            listContainer.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;`;
        }

        if (completedPuzzles.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.style.cssText = `grid-column:1/-1;text-align:center;padding:60px 20px;background:var(--glass-bg);border-radius:var(--radius-lg);border:2px dashed var(--glass-border);`;
            emptyMessage.innerHTML = `<div style="font-size:3rem;margin-bottom:16px;">${icon('puzzle', { size: 48 })}</div><div style="font-size:1.1rem;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:8px;">Библиотека пуста</div><div style="font-size:0.9rem;color:rgba(255,255,255,0.4);">Начните собирать пазлы, чтобы они появились здесь!</div>`;
            listContainer.appendChild(emptyMessage);
        } else {
            completedPuzzles.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
            completedPuzzles.forEach((puzzle, index) => {
                const card = document.createElement('div');
                card.style.cssText = `background:var(--glass-bg-strong);border:1px solid var(--glass-border);border-radius:var(--radius-lg);padding:16px;display:flex;flex-direction:column;gap:12px;cursor:pointer;transition:transform 0.3s,border-color 0.3s,box-shadow 0.3s;position:relative;overflow:hidden;`;
                card.onmouseenter = () => { card.style.transform = 'translateY(-4px)'; card.style.borderColor = 'rgba(16,185,129,0.4)'; card.style.boxShadow = '0 12px 24px rgba(0,0,0,0.3),0 0 0 1px rgba(16,185,129,0.2)'; };
                card.onmouseleave = () => { card.style.transform = 'translateY(0)'; card.style.borderColor = 'var(--glass-border)'; card.style.boxShadow = 'none'; };

                const indexBadge = document.createElement('div');
                indexBadge.textContent = `#${index + 1}`;
                indexBadge.style.cssText = `position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.6);color:rgba(255,255,255,0.8);font-size:0.75rem;font-weight:700;padding:4px 10px;border-radius:var(--radius-lg);`;

                const thumbContainer = document.createElement('div');
                thumbContainer.style.cssText = `position:relative;border-radius:12px;overflow:hidden;background:#1a1a2e;`;
                const thumb = document.createElement('img');
                thumb.style.cssText = `width:100%;height:auto;max-height:180px;object-fit:cover;transition:transform 0.3s ease;`;
                thumb.alt = 'Puzzle thumbnail';
                thumb.onerror = () => { if (!thumb.dataset.fallbackApplied && puzzle.imageUrl && thumb.src !== puzzle.imageUrl) { thumb.dataset.fallbackApplied = 'true'; thumb.src = puzzle.imageUrl; } };
                const thumbSrc = this.getPuzzleImageUrl(puzzle);
                if (thumbSrc) { thumb.src = thumbSrc; }
                else if (puzzle?.post?.id || puzzle?.id) { this.resolvePuzzleImageUrl(puzzle).then(resolved => { if (resolved) thumb.src = resolved; }).catch(() => {}); }
                thumb.onmouseenter = () => { thumb.style.transform = 'scale(1.05)'; };
                thumb.onmouseleave = () => { thumb.style.transform = 'scale(1)'; };
                thumbContainer.appendChild(thumb);

                card.onclick = () => {
                    modal.style.opacity = '0';
                    modal.style.transition = 'opacity 0.2s ease';
                    setTimeout(() => { modal.style.display = 'none'; this.showPuzzleStats(puzzle, true); }, 200);
                };

                const info = document.createElement('div');
                info.style.cssText = `display:flex;flex-direction:column;gap:6px;`;
                const variantCount = document.createElement('div');
                variantCount.style.cssText = `font-size:0.8rem;font-weight:700;color:#10b981;display:flex;align-items:center;gap:6px;`;
                variantCount.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>${puzzle.variants.length} вариант(ов)`;
                const lastDate = document.createElement('div');
                lastDate.style.cssText = `font-size:0.75rem;color:rgba(255,255,255,0.5);display:flex;align-items:center;gap:4px;`;
                lastDate.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${new Date(puzzle.lastUpdated).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;

                const variantsContainer = document.createElement('div');
                variantsContainer.style.cssText = `margin-top:8px;display:flex;flex-direction:column;gap:4px;`;
                const getVariantPieces = (v) => v.targetPieces || ((v.cols && v.rows) ? v.cols * v.rows : null) || (v.size ? v.size * v.size : 0);
                puzzle.variants.sort((a, b) => getVariantPieces(a) - getVariantPieces(b)).forEach(variant => {
                    const variantCols = variant.cols || variant.size || 4;
                    const variantRows = variant.rows || variant.size || 4;
                    const variantInfo = document.createElement('div');
                    variantInfo.style.cssText = `font-size:0.75rem;color:rgba(255,255,255,0.7);display:flex;justify-content:space-between;padding:4px 8px;background:var(--glass-bg);border-radius:var(--radius-xs);`;
                    variantInfo.innerHTML = `<span>${variantCols}x${variantRows} (${getVariantPieces(variant)})</span><span>${this.formatTime(variant.time)} • ${variant.moves} ходов</span>`;
                    variantsContainer.appendChild(variantInfo);
                });

                info.appendChild(variantCount);
                info.appendChild(lastDate);
                info.appendChild(variantsContainer);
                card.appendChild(indexBadge);
                card.appendChild(thumbContainer);
                card.appendChild(info);
                listContainer.appendChild(card);
            });
        }

        modalContent.appendChild(header);
        modalContent.appendChild(listContainer);
        modal.appendChild(modalContent);
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.opacity = '0';
                modalContent.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    modal.remove();
                    if (this.board) { this.board.style.display = 'grid'; }
                    if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-stats-modal')) {
                        document.body.classList.remove('modal-open');
                        document.documentElement.classList.remove('modal-open');
                    }
                }, 300);
            }
        };
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(modal);
        requestAnimationFrame(() => { modal.style.opacity = '1'; modalContent.style.transform = 'scale(1)'; });
    }

    async showPuzzleStats(puzzle, fromLibrary = false) {
        if (this.board) { this.board.style.display = 'none'; }
        const libraryModal = fromLibrary ? document.querySelector('.puzzle-completed-modal') : null;
        if (libraryModal) { libraryModal.style.display = 'none'; }

        const modal = document.createElement('div');
        modal.className = 'puzzle-stats-modal';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.88);z-index:60001;display:flex;align-items:stretch;justify-content:stretch;opacity:0;transition:opacity 0.3s ease;`;
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `background:var(--modal-bg);border:none;border-radius:0;padding:28px;width:100vw;height:100vh;max-width:100vw;max-height:100vh;overflow-y:auto;box-shadow:none;transform:scale(0.98);transition:transform 0.3s ease;box-sizing:border-box;`;

        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--glass-border);`;
        const titleContainer = document.createElement('div');
        titleContainer.style.cssText = `display:flex;align-items:center;gap:10px;`;
        const title = document.createElement('h2');
        title.innerHTML = `${icon('barChart', { size: 24 })} Статистика`;
        title.style.cssText = `color:#10b981;font-size:1.4rem;font-weight:800;margin:0;text-shadow:0 0 20px rgba(16,185,129,0.3);`;
        titleContainer.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        closeBtn.style.cssText = `background:var(--glass-bg-strong);border:1px solid var(--glass-border);color:rgba(255,255,255,0.8);cursor:pointer;padding:8px;border-radius:var(--radius-sm);transition:all 0.2s;display:flex;align-items:center;justify-content:center;`;
        closeBtn.onmouseenter = () => { closeBtn.style.background = 'var(--accent)'; closeBtn.style.borderColor = 'var(--accent)'; closeBtn.style.color = '#fff'; };
        closeBtn.onmouseleave = () => { closeBtn.style.background = 'var(--glass-bg-strong)'; closeBtn.style.borderColor = 'var(--glass-border)'; closeBtn.style.color = 'rgba(255,255,255,0.8)'; };
        closeBtn.onclick = () => {
            modal.style.opacity = '0';
            modalContent.style.transform = 'scale(0.95)';
            setTimeout(() => {
                modal.remove();
                if (libraryModal) { libraryModal.style.display = 'flex'; libraryModal.style.opacity = '0'; libraryModal.style.transition = 'opacity 0.2s ease'; setTimeout(() => { libraryModal.style.opacity = '1'; }, 10); }
                else if (fromLibrary) { this.showCompletedModal(); }
                else { if (this.board) { this.board.style.display = 'grid'; } }
                if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-completed-modal')) {
                    document.body.classList.remove('modal-open');
                    document.documentElement.classList.remove('modal-open');
                }
            }, 300);
        };
        header.appendChild(titleContainer);
        header.appendChild(closeBtn);

        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = `margin-bottom:24px;position:relative;border-radius:16px;overflow:hidden;background:#1a1a2e;`;
        const image = document.createElement('img');
        image.style.cssText = `width:100%;height:auto;max-height:250px;object-fit:contain;transition:transform 0.3s ease;`;
        image.alt = 'Puzzle preview';
        image.onerror = () => { if (!image.dataset.fallbackApplied && puzzle.imageUrl && image.src !== puzzle.imageUrl) { image.dataset.fallbackApplied = 'true'; image.src = puzzle.imageUrl; } };
        const imageSrc = this.getPuzzleImageUrl(puzzle);
        if (imageSrc) { image.src = imageSrc; }
        else if (puzzle?.post?.id || puzzle?.id) { this.resolvePuzzleImageUrl(puzzle).then(resolved => { if (resolved) image.src = resolved; }).catch(() => {}); }
        image.onmouseenter = () => { image.style.transform = 'scale(1.02)'; };
        image.onmouseleave = () => { image.style.transform = 'scale(1)'; };
        imageContainer.appendChild(image);

        const variantsList = document.createElement('div');
        variantsList.style.cssText = `display:flex;flex-direction:column;gap:12px;`;
        const getVariantPieces = (v) => v.targetPieces || ((v.cols && v.rows) ? v.cols * v.rows : null) || (v.size ? v.size * v.size : 0);
        const sortedVariants = puzzle.variants.sort((a, b) => getVariantPieces(a) - getVariantPieces(b));
        sortedVariants.forEach((variant, index) => {
            const variantCols = variant.cols || variant.size || 4;
            const variantRows = variant.rows || variant.size || 4;
            const totalPieces = getVariantPieces(variant);
            const playSize = variant.targetPieces || totalPieces;

            const variantCard = document.createElement('div');
            variantCard.style.cssText = `background:linear-gradient(135deg,rgba(59,130,246,0.1) 0%,rgba(59,130,246,0.03) 100%);border:1px solid rgba(59,130,246,0.2);border-radius:16px;padding:18px;cursor:pointer;transition:transform 0.3s,border-color 0.3s;position:relative;box-shadow:0 2px 10px rgba(59,130,246,0.1);`;
            variantCard.onmouseenter = () => { variantCard.style.transform = 'translateX(4px)'; variantCard.style.borderColor = 'rgba(59,130,246,0.4)'; };
            variantCard.onmouseleave = () => { variantCard.style.transform = 'translateX(0)'; variantCard.style.borderColor = 'rgba(59,130,246,0.2)'; };

            const variantHeader = document.createElement('div');
            variantHeader.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;`;
            const sizeLabel = document.createElement('div');
            sizeLabel.style.cssText = `font-size:1.1rem;font-weight:700;color:var(--adaptive-text-main, #3b82f6);`;
            sizeLabel.textContent = `${variantCols} × ${variantRows}`;
            const piecesCount = document.createElement('div');
            piecesCount.style.cssText = `font-size:0.8rem;color:var(--adaptive-text-main, rgba(255,255,255,0.5));`;
            piecesCount.textContent = `${totalPieces} деталей`;
            variantHeader.appendChild(sizeLabel);
            variantHeader.appendChild(piecesCount);

            const statsGrid = document.createElement('div');
            statsGrid.style.cssText = `display:grid;grid-template-columns:repeat(2,1fr);gap:12px;`;
            const timeStat = document.createElement('div');
            timeStat.style.cssText = `background:var(--glass-bg);padding:10px 14px;border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:4px;`;
            timeStat.innerHTML = `<span style="font-size:0.7rem;color:var(--adaptive-text-main, rgba(255,255,255,0.5));">${icon('clock', { size: 14 })} Время</span><span style="font-size:0.95rem;font-weight:600;color:var(--adaptive-text-main, #3b82f6);">${this.formatTime(variant.time)}</span>`;
            const movesStat = document.createElement('div');
            movesStat.style.cssText = `background:var(--glass-bg);padding:10px 14px;border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:4px;`;
            movesStat.innerHTML = `<span style="font-size:0.7rem;color:var(--adaptive-text-main, rgba(255,255,255,0.5));">${icon('target', { size: 14 })} Ходов</span><span style="font-size:0.95rem;font-weight:600;color:var(--adaptive-text-main, rgba(255,255,255,0.9));">${variant.moves}</span>`;
            statsGrid.appendChild(timeStat);
            statsGrid.appendChild(movesStat);

            const playBtn = document.createElement('button');
            playBtn.innerHTML = `<span style="display:flex;align-items:center;gap:8px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Играть снова</span>`;
            playBtn.style.cssText = `margin-top:12px;width:100%;padding:12px;background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);border:1px solid rgba(59,130,246,0.3);border-radius:10px;color:var(--btn-primary-color, #fff);font-size:0.9rem;font-weight:600;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s,border-color 0.2s;`;
            playBtn.onmouseenter = () => { playBtn.style.transform = 'translateY(-2px)'; playBtn.style.boxShadow = '0 8px 16px rgba(59,130,246,0.3)'; playBtn.style.borderColor = 'rgba(59,130,246,0.5)'; };
            playBtn.onmouseleave = () => { playBtn.style.transform = 'translateY(0)'; playBtn.style.boxShadow = 'none'; playBtn.style.borderColor = 'rgba(59,130,246,0.3)'; };
            playBtn.onclick = () => {
                modal.style.opacity = '0';
                modalContent.style.transform = 'scale(0.95)';
                setTimeout(() => { modal.remove(); this.launchLibraryPuzzle(puzzle.post, playSize, puzzle.imageUrl); }, 300);
            };

            variantCard.appendChild(variantHeader);
            variantCard.appendChild(statsGrid);
            variantCard.appendChild(playBtn);
            variantsList.appendChild(variantCard);
        });

        modalContent.appendChild(header);
        modalContent.appendChild(imageContainer);
        modalContent.appendChild(variantsList);
        modal.appendChild(modalContent);
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.opacity = '0';
                modalContent.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    modal.remove();
                    if (this.board) { this.board.style.display = 'grid'; }
                    if (!document.querySelector('#settings-modal.open, .puzzle-overlay, .puzzle-completed-modal')) {
                        document.body.classList.remove('modal-open');
                        document.documentElement.classList.remove('modal-open');
                    }
                }, 300);
            }
        };
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(modal);
        requestAnimationFrame(() => { modal.style.opacity = '1'; modalContent.style.transform = 'scale(1)'; });
    }

    getStableImageUrl() {
        return this.post?.sample_url || this.post?.file_url || this.post?.preview_url || this.imgUrl || this.displayUrl || '';
    }

    getPuzzleImageUrl(puzzle) {
        return puzzle?.imageUrl || puzzle?.thumbnail || puzzle?.post?.sample_url || puzzle?.post?.file_url || puzzle?.post?.preview_url || '';
    }

    async resolvePuzzleImageUrl(puzzle) {
        const existing = this.getPuzzleImageUrl(puzzle);
        if (existing) return existing;
        const postId = puzzle?.post?.id ?? puzzle?.id;
        if (!postId) return '';
        try {
            const post = await fetchPostById(String(postId));
            if (!post) return '';
            const resolved = post.sample_url || post.file_url || post.preview_url || '';
            if (resolved) {
                puzzle.imageUrl = resolved;
                puzzle.thumbnail = resolved;
                if (puzzle.post && typeof puzzle.post === 'object') {
                    if (!puzzle.post.sample_url && post.sample_url) puzzle.post.sample_url = post.sample_url;
                    if (!puzzle.post.file_url && post.file_url) puzzle.post.file_url = post.file_url;
                    if (!puzzle.post.preview_url && post.preview_url) puzzle.post.preview_url = post.preview_url;
                }
                return resolved;
            }
        } catch (e) {
            console.warn('[Puzzle Library] Failed to resolve image for puzzle:', e);
        }
        return '';
    }

    async saveCompletedPuzzle() {
        if (this.isSolving) return;
        const completedPuzzles = await fetchPuzzleCompleted();
        const puzzleRecord = { cols: this.cols, rows: this.rows, targetPieces: this.targetPieces, time: this.seconds, moves: this.moves, date: new Date().toISOString() };
        let puzzleEntry = completedPuzzles.find(p => p.imageUrl === this.imgUrl);
        if (!puzzleEntry) {
            const stableImageUrl = this.getStableImageUrl();
            puzzleEntry = { imageUrl: stableImageUrl, thumbnail: stableImageUrl, post: this.post, variants: [], lastUpdated: new Date().toISOString() };
            completedPuzzles.push(puzzleEntry);
        }
        let variant = puzzleEntry.variants.find(v => (v.cols === this.cols && v.rows === this.rows) || v.targetPieces === this.targetPieces || v.size === this.targetPieces || v.size === this.cols);
        if (variant) {
            if (puzzleRecord.time < variant.time || (puzzleRecord.time === variant.time && puzzleRecord.moves < variant.moves)) {
                variant.time = puzzleRecord.time;
                variant.moves = puzzleRecord.moves;
                variant.date = puzzleRecord.date;
            }
        } else {
            puzzleEntry.variants.push(puzzleRecord);
        }
        puzzleEntry.lastUpdated = new Date().toISOString();
        if (completedPuzzles.length > 100) {
            completedPuzzles.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
            completedPuzzles.splice(100);
        }
        await savePuzzleCompleted(completedPuzzles);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ============================================================
    // // ИЗМЕНЕНО: injectStyles — полный редизайн CSS
    // Убраны: backdrop-filter, transition:all, анимации left/top,
    // mix-blend-mode. Добавлены: новые цвета, glassmorphism,
    // spring-анимации, градиенты.
    // ============================================================
    injectStyles() {
        if (document.getElementById('puzzle-game-styles')) return;
        const style = document.createElement('style');
        style.id = 'puzzle-game-styles';
        style.textContent = `
            /* // ИЗМЕНЕНО: Убран backdrop-filter, добавлен многослойный градиент */
            .puzzle-overlay {
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100dvh;
                background:
                    radial-gradient(ellipse at 20% 20%, rgba(139,92,246,0.12), transparent 50%),
                    radial-gradient(ellipse at 80% 80%, rgba(236,72,153,0.08), transparent 50%),
                    rgba(8,8,16,0.97);
                z-index: 55000;
                display: flex;
                align-items: stretch;
                justify-content: stretch;
                color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                overflow-y: auto;
                padding: 0;
                box-sizing: border-box;
            }

            /* // ИЗМЕНЕНО: Fullscreen карточка */
            .puzzle-card {
                background: var(--glass-bg-strong);
                border: none;
                border-radius: 0;
                padding: clamp(14px, 2.5vw, 24px);
                padding-bottom: max(clamp(14px, 2.5vw, 24px), env(safe-area-inset-bottom, 20px) + 20px);
                width: 100vw;
                max-width: 100vw;
                height: 100dvh;
                max-height: 100dvh;
                overflow-y: auto;
                box-shadow: none;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: clamp(10px, 1.8vh, 16px);
                position: relative;
                box-sizing: border-box;
                margin: 0;
                backdrop-filter: blur(var(--glass-blur));
                -webkit-backdrop-filter: blur(var(--glass-blur));
            }
            /* // ДОБАВЛЕНО: Декоративная линия сверху */
            .puzzle-card::before {
                content: '';
                position: absolute;
                top: 0; left: 20%; right: 20%;
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(139,92,246,0.6), transparent);
            }

            /* // Fullscreen puzzle card без ограничений ширины */
            .puzzle-card.size-large { width: 100vw !important; max-width: 100vw !important; }

            .puzzle-header { width: 100%; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }

            /* // ИЗМЕНЕНО: Новый градиент заголовка */
            .puzzle-title {
                font-size: 1.35rem; font-weight: 800;
                background: linear-gradient(135deg, #a78bfa, #ec4899, #f59e0b);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: flex; align-items: center; gap: 8px;
                filter: drop-shadow(0 0 12px rgba(167,139,250,0.3));
            }

            /* // ИЗМЕНЕНО: Конкретные transition вместо all */
            .puzzle-close {
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                color: rgba(255,255,255,0.8);
                border-radius: 50%; width: 36px; height: 36px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 1.25rem;
                transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
            }
            .puzzle-close:hover {
                background: var(--accent);
                border-color: var(--accent);
                color: #fff;
                transform: rotate(90deg);
            }

            .puzzle-stats-row { display: flex; gap: 10px; width: 100%; justify-content: center; flex-wrap: wrap; }

            /* // ИЗМЕНЕНО: Бейджи с цветовыми акцентами */
            .puzzle-badge {
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                padding: 6px 12px; border-radius: var(--radius-sm);
                font-size: 0.82rem; font-weight: 600;
                color: rgba(255,255,255,0.9);
                display: flex; align-items: center; gap: 6px;
            }
            #puzzle-timer-badge { border-left: 3px solid #8b5cf6; }
            #puzzle-moves-badge { border-left: 3px solid #3b82f6; }
            #puzzle-record-badge { border-left: 3px solid #f59e0b; }

            .puzzle-mode-selector {
                display: flex; gap: 8px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                padding: 4px; border-radius: var(--radius-md);
                width: 100%; justify-content: center; flex-shrink: 0;
            }
            .puzzle-mode-btn {
                flex: 1; max-width: 180px;
                background: none; border: none;
                color: rgba(255,255,255,0.65);
                font-size: 0.82rem; font-weight: 700;
                padding: 8px 16px; border-radius: var(--radius-sm);
                cursor: pointer; white-space: nowrap; text-align: center;
                transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
            }
            .puzzle-mode-btn:hover { color: #ffffff; background: var(--glass-bg-strong); }
            /* // ИЗМЕНЕНО: Новый градиент активной кнопки */
            .puzzle-mode-btn.active {
                background: var(--accent);
                color: #ffffff;
                box-shadow: 0 4px 12px var(--accent-glow);
            }

            .puzzle-difficulty-selector, .puzzle-shape-selector {
                display: flex; flex-wrap: nowrap; justify-content: flex-start; gap: 6px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                padding: 6px; border-radius: var(--radius-md);
                width: 100%; overflow-x: auto; flex-shrink: 0;
                -webkit-overflow-scrolling: touch;
            }
            .puzzle-difficulty-selector::-webkit-scrollbar, .puzzle-shape-selector::-webkit-scrollbar { height: 4px; }
            .puzzle-difficulty-selector::-webkit-scrollbar-thumb, .puzzle-shape-selector::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }

            .puzzle-diff-btn, .puzzle-shape-btn {
                flex: 0 0 auto; min-width: 70px;
                background: none; border: none;
                color: var(--adaptive-text-main, rgba(255,255,255,0.6));
                opacity: 0.6;
                font-size: 0.8rem; font-weight: 600;
                padding: 8px 12px; border-radius: var(--radius-sm);
                cursor: pointer; white-space: nowrap; text-align: center;
                transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease, opacity 0.2s;
            }
            .puzzle-diff-btn:hover, .puzzle-shape-btn:hover { background: var(--glass-bg-strong); transform: translateY(-1px); opacity: 1; }
            /* // ИЗМЕНЕНО: Новый градиент */
            .puzzle-diff-btn.active, .puzzle-shape-btn.active {
                background: var(--accent);
                color: var(--btn-primary-color, #ffffff);
                opacity: 1;
                box-shadow: 0 2px 12px var(--accent-glow);
            }

            /* // ИЗМЕНЕНО: Доска с неоновым бордером */
            .puzzle-board-container {
                width: 100%;
                max-width: min(92vw, 680px);
                max-height: none !important;
                margin: 0 auto;
                background: var(--dark);
                border: 1px solid var(--glass-border);
                border-radius: var(--radius-lg);
                overflow: visible;
                position: relative;
                box-shadow: var(--shadow-md);
                box-sizing: border-box;
                display: flex; align-items: center; justify-content: center;
                padding: 0; flex-shrink: 0;
            }
            .puzzle-left-panel, .puzzle-right-panel { display: contents; }
            
            .puzzle-header { order: 1; }
            .puzzle-stats-row { order: 2; }
            .puzzle-mode-selector { order: 3; }
            .puzzle-difficulty-selector { order: 4; }
            .puzzle-tray-cols-selector { order: 5; }
            .puzzle-board-container { order: 6; }
            .puzzle-tray { order: 7; }
            .puzzle-controls { order: 8; }

            .puzzle-card.size-large .puzzle-board-container { max-width: min(95vw, 840px); max-height: none !important; }
            @media (min-width: 900px) {
                .puzzle-card.mode-complex { 
                    width: 100vw !important; max-width: 100vw !important;
                    flex-direction: row;
                    align-items: stretch;
                    gap: 20px;
                    padding: 24px;
                    overflow: hidden;
                }
                .puzzle-card.mode-complex .puzzle-left-panel {
                    display: flex;
                    flex-direction: column;
                    flex: 0 0 560px;
                    max-width: 560px;
                    gap: 12px;
                    height: 100%;
                    overflow-y: auto;
                    padding-right: 8px;
                }
                .puzzle-card.mode-complex .puzzle-left-panel::-webkit-scrollbar { width: 6px; }
                .puzzle-card.mode-complex .puzzle-left-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
                
                .puzzle-card.mode-complex .puzzle-right-panel {
                    display: flex;
                    flex: 1;
                    height: 100%;
                    overflow-y: auto;
                    justify-content: center;
                    align-items: flex-start;
                    padding-bottom: 40px;
                }
                .puzzle-card.mode-complex .puzzle-right-panel::-webkit-scrollbar { width: 8px; }
                .puzzle-card.mode-complex .puzzle-right-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }

                .puzzle-card.size-large .puzzle-board-container { max-width: 100%; max-height: none !important; }
                .puzzle-board-container.desktop-complex {
                    max-width: 100% !important;
                    margin: 0 auto !important;
                    max-height: none !important;
                }
            }

            .puzzle-board { width: 100%; height: 100%; position: relative; overflow: visible; z-index: 1; }
            .puzzle-tray { overflow: hidden; isolation: isolate; }

            .puzzle-board.intro-mode .puzzle-tile { opacity: 1; filter: none !important; pointer-events: none; }
            .puzzle-board.intro-mode .puzzle-tile-outline,
            .puzzle-board.intro-mode .puzzle-tile-shading { opacity: 0 !important; transition: none !important; }
            .puzzle-board.intro-mode .puzzle-grid-mesh { opacity: 0 !important; transition: none !important; }
            .puzzle-grid-mesh { opacity: 1.0; transition: opacity 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94); }

            /* // ИЗМЕНЕНО: Убраны transition на left/top, только transform */
            .puzzle-tile.folding-to-tray {
                transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.45s ease-in-out !important;
                will-change: transform, opacity;
                z-index: 100 !important;
            }

            /* // ИЗМЕНЕНО: Убраны transition на left/top, contain без paint/size */
            .puzzle-tile {
                position: absolute;
                box-sizing: border-box;
                cursor: grab;
                overflow: hidden;
                transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
                user-select: none;
                touch-action: none;
                z-index: 1;
                will-change: transform;
                transform: translateZ(0);
                contain: layout style;
            }

            /* // ИЗМЕНЕНО: Улучшенный hover */
            .puzzle-tile:hover:not(.selected) {
                z-index: 15;
                transform: translateY(-4px) scale(1.02);
                box-shadow: 0 8px 32px rgba(255, 59, 107, 0.25), 0 0 0 1px rgba(255, 59, 107, 0.15);
            }
            .puzzle-tile.group-hover { z-index: 10; transform: translateY(-2px) scale(1.005); }

            /* // ИЗМЕНЕНО: Улучшенный selected с физичной 3D-тенью */
            .puzzle-tile.selected {
                z-index: 100 !important;
                transform: scale(1.08) translateY(-10px) translateZ(0) !important;
                filter: drop-shadow(0 14px 16px rgba(0, 0, 0, 0.7));
            }
            .puzzle-tile.selected .puzzle-tile-outline path {
                stroke: var(--accent-alt) !important;
                stroke-width: 4px !important;
                opacity: 1 !important;
                animation: puzzle-selected-glow 1.5s ease-in-out infinite;
            }
            @keyframes puzzle-selected-glow {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
            .puzzle-tile.selected .puzzle-tile-shading {
                background: linear-gradient(135deg, rgba(255, 59, 107, 0.4) 0%, rgba(255,255,255,0.15) 50%, rgba(255, 59, 107, 0.4) 100%) !important;
                opacity: 1 !important;
            }
            .puzzle-tile.selected .puzzle-tile-img { z-index: 2; }

            /* // ИЗМЕНЕНО: Улучшенный drag-target */
            .puzzle-tile.drag-target {
                z-index: 50 !important;
                transform: scale(1.05) !important;
                box-shadow: 0 0 0 3px var(--accent-glow);
            }

            .puzzle-board.cutting .puzzle-tile { z-index: 2; }
            /* // ИЗМЕНЕНО: Лазерный эффект при разрезании */
            .puzzle-board.cutting .puzzle-tile-outline path {
                stroke: var(--accent-alt) !important;
                stroke-width: 1.5px !important;
                filter: drop-shadow(0 0 4px var(--accent-glow));
            }
            .puzzle-board.won .puzzle-tile {
                touch-action: auto !important;
                pointer-events: none !important;
            }

            /* // ИЗМЕНЕНО: Flash-анимации с box-shadow пульсацией */
            @keyframes puzzle-flash-red-pulse {
                0% { box-shadow: 0 0 0 0 var(--accent-glow); }
                70% { box-shadow: 0 0 0 12px rgba(255, 59, 107, 0); }
                100% { box-shadow: 0 0 0 0 rgba(255, 59, 107, 0); }
            }
            @keyframes puzzle-flash-green-pulse {
                0% { box-shadow: 0 0 0 0 var(--success); }
                70% { box-shadow: 0 0 0 12px rgba(52, 227, 154, 0); }
                100% { box-shadow: 0 0 0 0 rgba(52, 227, 154, 0); }
            }
            .puzzle-tile.flash-red { z-index: 50 !important; animation: puzzle-flash-red-pulse 0.6s ease-out; }
            .puzzle-tile.flash-red .puzzle-tile-outline path { stroke: var(--accent) !important; stroke-width: 3px !important; opacity: 1 !important; }
            .puzzle-tile.flash-green { z-index: 50 !important; animation: puzzle-flash-green-pulse 0.6s ease-out; }
            .puzzle-tile.flash-green .puzzle-tile-outline path { stroke: var(--success) !important; stroke-width: 3px !important; opacity: 1 !important; }

            .puzzle-tile-outline path {
                fill: none;
                transition: stroke 0.3s ease, stroke-width 0.3s ease;
                transition-delay: var(--row-delay, 0s);
                /* Removed expensive drop-shadow filter to resolve rendering lag entirely! */
            }

            /* // ИЗМЕНЕНО: Объемное 3D затенение для реалистичного рельефа */
            .puzzle-tile-shading {
                transition: opacity 0.35s ease;
                transition-delay: var(--row-delay, 0s);
                opacity: 0.85;
                background: linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.28) 100%);
            }
            .puzzle-tile:hover .puzzle-tile-shading { opacity: 1; }

            /* Высококонтрастные bevel-обводки для глубокого 3D рельефа деталей */
            .puzzle-tile:not(.selected) .puzzle-tile-outline .stroke-dark {
                stroke: rgba(0,0,0,0.72) !important;
                stroke-width: var(--stroke-dark-w, 1.8px) !important;
            }
            .puzzle-tile:not(.selected) .puzzle-tile-outline .stroke-light {
                stroke: rgba(255,255,255,0.65) !important;
                stroke-width: var(--stroke-light-w, 2.0px) !important;
            }

            .puzzle-tile-outline {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                pointer-events: none; opacity: 1;
                transition: opacity 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                transition-delay: var(--row-delay, 0s);
            }

            .puzzle-tile-num {
                position: absolute; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.85); color: #ffffff;
                font-size: 0.8rem; font-weight: 800;
                padding: 3px 8px; border-radius: 10px;
                border: 1px solid rgba(255,255,255,0.4);
                pointer-events: none; display: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.6); z-index: 5;
            }
            .puzzle-tile.show-num .puzzle-tile-num { display: block; }

            .puzzle-controls { width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 4px; flex-shrink: 0; }

            /* // ИЗМЕНЕНО: Конкретные transition */
            .puzzle-btn {
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                color: var(--adaptive-text-main, #ffffff); font-weight: 600; font-size: 0.78rem;
                padding: 10px 6px; border-radius: var(--radius-sm); cursor: pointer;
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
                transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
                white-space: nowrap;
            }
            .puzzle-btn:hover:not(:disabled) {
                background: var(--glass-bg-strong);
                border-color: var(--glass-border-strong);
                transform: translateY(-2px) scale(1.02);
            }
            .puzzle-btn:active:not(:disabled) { transform: scale(0.96); }
            .puzzle-btn.active-toggle { background: rgba(255, 59, 107, 0.2); border-color: var(--accent); color: var(--accent); }
            .puzzle-btn:disabled.active-toggle { opacity: 0.85; }
            .puzzle-btn:disabled { opacity: 0.35; cursor: not-allowed; }

            /* // ИЗМЕНЕНО: Новый градиент primary */
            .puzzle-btn-primary {
                background: var(--accent);
                border: none;
                box-shadow: 0 4px 12px var(--accent-glow);
                color: var(--btn-primary-color, #fff);
            }
            .puzzle-btn-primary:hover:not(:disabled) {
                background: var(--accent-alt);
                box-shadow: 0 6px 16px var(--accent-glow);
            }

            .puzzle-hint-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                border-radius: 16px; opacity: 0; visibility: hidden; pointer-events: none;
                transition: opacity 0.25s ease, visibility 0.25s ease;
                z-index: 25; box-sizing: border-box; overflow: hidden;
            }
            .puzzle-hint-overlay.visible { opacity: 0.65; visibility: visible; }
            .puzzle-board-container.hint-active .puzzle-tile { opacity: 0.35; transition: opacity 0.25s ease; }
            .puzzle-tile-img { width: 100%; height: 100%; pointer-events: none; }

            /* // ИЗМЕНЕНО: Win-оверлей с градиентным фоном */
            .puzzle-win-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                border-radius: var(--radius-lg);
                background: var(--modal-bg);
                border: 1px solid var(--success);
                z-index: 1000;
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
                opacity: 0; pointer-events: none;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
                transform: scale(0.95);
                padding: 20px; box-sizing: border-box;
                backdrop-filter: blur(var(--glass-blur));
                -webkit-backdrop-filter: blur(var(--glass-blur));
            }
            .puzzle-win-overlay.visible { opacity: 1; pointer-events: auto; transform: scale(1); }

            /* // ИЗМЕНЕНО: Градиентный заголовок, убрана бесконечная пульсация */
            .puzzle-win-title {
                font-size: 1.6rem; font-weight: 800;
                background: var(--title-gradient);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                filter: drop-shadow(0 0 20px var(--accent-glow));
                text-align: center;
                display: flex; align-items: center; justify-content: center; gap: 10px;
                animation: win-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            }
            @keyframes win-appear {
                0% { transform: scale(0.8); opacity: 0; }
                60% { transform: scale(1.05); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
            }

            .puzzle-win-text { font-size: 0.9rem; color: rgba(255,255,255,0.9); text-align: center; line-height: 1.5; padding: 0 16px; }

            /* // ИЗМЕНЕНО: Убран backdrop-filter из лоадера */
            .puzzle-loader-overlay {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: var(--modal-bg);
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                z-index: 200; border-radius: var(--radius-sm);
                transition: opacity 0.4s ease-in-out, visibility 0.4s ease-in-out;
                backdrop-filter: blur(var(--glass-blur));
                -webkit-backdrop-filter: blur(var(--glass-blur));
                pointer-events: none; opacity: 0; visibility: hidden;
            }
            .puzzle-loader-overlay.active { opacity: 1; visibility: visible; pointer-events: auto; }

            /* // ИЗМЕНЕНО: Новые цвета спиннера */
            .puzzle-loader-spinner {
                width: 54px; height: 54px;
                border: 4px solid rgba(255,255,255,0.08);
                border-left-color: #8b5cf6;
                border-top-color: #ec4899;
                border-radius: 50%;
                animation: puzzle-spin 1.2s cubic-bezier(0.5, 0.1, 0.4, 0.9) infinite;
                margin-bottom: 20px;
                box-shadow: 0 0 20px rgba(139,92,246,0.2);
            }
            .puzzle-loader-text { color: #fff; font-size: 0.95rem; font-weight: 700; margin-bottom: 12px; text-shadow: 0 2px 4px rgba(0,0,0,0.5); letter-spacing: 0.5px; }
            .puzzle-loader-progress-container { width: 220px; height: 8px; background: rgba(255,255,255,0.1); border-radius: 10px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.4); }

            /* // ИЗМЕНЕНО: Новый градиент прогресс-бара */
            .puzzle-loader-progress-bar {
                width: 0%; height: 100%;
                background: linear-gradient(90deg, #8b5cf6, #ec4899, #f59e0b);
                background-size: 200% 100%;
                animation: progress-shine 2s linear infinite;
                transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            @keyframes progress-shine { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
            @keyframes puzzle-spin { to { transform: rotate(360deg); } }

            @media (max-width: 600px) {
                .puzzle-card { padding: 12px 14px; border-radius: 0; gap: 10px; width: 100vw; height: 100vh; max-height: 100vh; }
                .puzzle-title { font-size: 1.15rem; }
                .puzzle-close { width: 32px; height: 32px; font-size: 1.1rem; }
                .puzzle-badge { padding: 4px 8px; font-size: 0.75rem; }
                .puzzle-mode-selector, .puzzle-difficulty-selector, .puzzle-shape-selector { gap: 4px; padding: 2px; border-radius: 10px; }
                .puzzle-mode-btn, .puzzle-diff-btn, .puzzle-shape-btn { padding: 5px 6px; font-size: 0.72rem; border-radius: 8px; min-width: 45px; }
                .puzzle-controls { grid-template-columns: repeat(2, 1fr); gap: 6px; }
                .puzzle-btn { padding: 12px 8px; font-size: 0.82rem; min-height: 44px; border-radius: 10px; }
                .puzzle-win-title { font-size: 1.3rem; }
                .puzzle-win-text { font-size: 0.82rem; }
            }
            .puzzle-tray-cols-selector select option { background: var(--modal-bg, #1a1a2e); color: var(--adaptive-text-main, #ffffff); padding: 4px 8px; }
            .puzzle-tray-cols-selector select:focus { border-color: rgba(139,92,246,0.6); box-shadow: 0 0 8px rgba(139,92,246,0.2); }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // // ИЗМЕНЕНО: createUI — статус-индикатор, прогресс-бар, трей
    // ============================================================
    createUI() {
        const overlay = document.createElement('div');
        this.overlay = overlay;
        overlay.className = 'puzzle-overlay';

        const svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgDefs.style.position = 'absolute';
        svgDefs.style.width = '0';
        svgDefs.style.height = '0';
        svgDefs.style.pointerEvents = 'none';
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svgDefs.appendChild(defs);
        overlay.appendChild(svgDefs);
        this.svgDefsContainer = defs;

        const card = document.createElement('div');
        this.card = card;
        card.className = `puzzle-card ${Math.max(this.cols, this.rows) >= 6 ? 'size-large' : ''} mode-complex`;
        overlay.appendChild(card);

        const leftPanel = document.createElement('div');
        leftPanel.className = 'puzzle-left-panel';
        card.appendChild(leftPanel);

        const rightPanel = document.createElement('div');
        rightPanel.className = 'puzzle-right-panel';
        card.appendChild(rightPanel);

        const header = document.createElement('div');
        header.className = 'puzzle-header';
        const title = document.createElement('div');
        title.className = 'puzzle-title';
        title.innerHTML = `${icon('puzzle', { size: 20 })} <span>Настольный Пазл</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'puzzle-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => this.destroy();
        header.appendChild(title);
        header.appendChild(closeBtn);
        leftPanel.appendChild(header);

        const statsRow = document.createElement('div');
        statsRow.className = 'puzzle-stats-row';
        const timerBadge = document.createElement('div');
        timerBadge.className = 'puzzle-badge';
        timerBadge.id = 'puzzle-timer-badge';
        timerBadge.innerHTML = `${icon('clock', { size: 16 })} <span>00:00</span>`;
        const movesBadge = document.createElement('div');
        movesBadge.className = 'puzzle-badge';
        movesBadge.id = 'puzzle-moves-badge';
        movesBadge.innerHTML = `${icon('refresh', { size: 16 })} Ходы: <span>0</span>`;
        const recordBadge = document.createElement('div');
        recordBadge.className = 'puzzle-badge';
        recordBadge.id = 'puzzle-record-badge';
        recordBadge.innerHTML = `${icon('trophy', { size: 16 })} Рекорд: <span>--</span>`;

        const completedBtn = document.createElement('button');
        completedBtn.className = 'puzzle-badge';
        completedBtn.id = 'puzzle-completed-btn';
        completedBtn.innerHTML = `${icon('clipboard', { size: 16 })} Библиотека`;
        completedBtn.title = 'Собранное';
        completedBtn.style.cssText = `background:linear-gradient(135deg,#10b981 0%,#059669 100%);border:2px solid rgba(16,185,129,0.5);color:#fff;padding:6px 14px;border-radius:10px;cursor:pointer;font-size:0.85rem;font-weight:700;box-shadow:0 4px 12px rgba(16,185,129,0.4);transition:transform 0.2s,box-shadow 0.2s,background 0.2s;`;
        completedBtn.onmouseover = () => { completedBtn.style.background = 'linear-gradient(135deg,#059669 0%,#047857 100%)'; completedBtn.style.boxShadow = '0 6px 20px rgba(16,185,129,0.6)'; completedBtn.style.transform = 'translateY(-2px)'; };
        completedBtn.onmouseout = () => { completedBtn.style.background = 'linear-gradient(135deg,#10b981 0%,#059669 100%)'; completedBtn.style.boxShadow = '0 4px 12px rgba(16,185,129,0.4)'; completedBtn.style.transform = 'translateY(0)'; };
        completedBtn.onclick = () => {
            const isFolding = this.tiles && this.tiles.some(t => { const el = this.tileElements.get(t.id); return el && el.classList.contains('folding-to-tray'); });
            const isCutting = this.board && this.board.classList.contains('cutting');
            if (isFolding || isCutting) return;
            this._libraryOpen = true;
            if (this.introCutTimer) { clearTimeout(this.introCutTimer); this.introCutTimer = null; }
            if (this.introAnimTimer) { clearTimeout(this.introAnimTimer); this.introAnimTimer = null; }
            if (this._animationFrameId) { cancelAnimationFrame(this._animationFrameId); this._animationFrameId = null; }
            if (this.board) { this.board.style.display = 'none'; }
            this.showCompletedModal();
        };

        const updateButtonState = () => {
            const isFolding = this.tiles && this.tiles.some(t => { const el = this.tileElements.get(t.id); return el && el.classList.contains('folding-to-tray'); });
            const isCutting = this.board && this.board.classList.contains('cutting');
            if (isFolding || isCutting) {
                completedBtn.style.background = 'linear-gradient(135deg,rgba(100,100,100,0.5) 0%,rgba(80,80,80,0.5) 100%)';
                completedBtn.style.borderColor = 'rgba(150,150,150,0.3)';
                completedBtn.style.boxShadow = 'none';
                completedBtn.style.cursor = 'not-allowed';
                completedBtn.style.opacity = '0.5';
            } else {
                completedBtn.style.background = 'linear-gradient(135deg,#10b981 0%,#059669 100%)';
                completedBtn.style.borderColor = 'rgba(16,185,129,0.5)';
                completedBtn.style.boxShadow = '0 4px 12px rgba(16,185,129,0.4)';
                completedBtn.style.cursor = 'pointer';
                completedBtn.style.opacity = '1';
            }
        };
        const buttonCheckInterval = setInterval(updateButtonState, 200);
        completedBtn.addEventListener('DOMNodeRemoved', () => { clearInterval(buttonCheckInterval); });

        statsRow.appendChild(timerBadge);
        statsRow.appendChild(movesBadge);
        statsRow.appendChild(recordBadge);
        statsRow.appendChild(completedBtn);
        leftPanel.appendChild(statsRow);

        const diffSelector = document.createElement('div');
        diffSelector.className = 'puzzle-difficulty-selector';
        const baseTargets = [16, 25, 36, 49, 64, 81, 100, 121, 144, 169, 196, 225, 256, 324, 400];
        const diffs = [];
        const seenSizes = new Set();
        baseTargets.forEach(target => {
            const { cols: c, rows: r } = this.calculateGrid(target, this.aspectRatio || 1.0);
            const exactPieces = c * r;
            const sizeKey = `${c}x${r}`;
            if (!seenSizes.has(sizeKey)) {
                seenSizes.add(sizeKey);
                diffs.push({ target: target, label: `${exactPieces} дет. (${c}x${r})` });
            }
        });
        diffs.forEach(d => {
            const btn = document.createElement('button');
            btn.className = `puzzle-diff-btn ${d.target === this.targetPieces ? 'active' : ''}`;
            btn.dataset.target = d.target;
            btn.textContent = d.label;
            btn.onclick = () => this.changeDifficulty(d.target);
            diffSelector.appendChild(btn);
        });
        leftPanel.appendChild(diffSelector);

        // Tray Columns Selector
        const trayColsSelector = document.createElement('div');
        trayColsSelector.className = 'puzzle-tray-cols-selector';
        trayColsSelector.style.cssText = `display:flex;align-items:center;gap:8px;width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:6px 10px;border-radius:14px;margin-top:8px;margin-bottom:2px;`;
        const trayColsLabel = document.createElement('span');
        trayColsLabel.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${icon('box', { size: 16 })} Лоток:</span>`;
        trayColsLabel.style.cssText = `font-size:0.8rem;font-weight:bold;color:var(--adaptive-text-main, #fbbf24);white-space:nowrap;display:flex;align-items:center;`;
        const trayColsSelect = document.createElement('select');
        trayColsSelect.className = 'puzzle-tray-cols-select';
        trayColsSelect.style.cssText = `background:var(--glass-bg-strong);border:1px solid rgba(255,255,255,0.1);color:var(--adaptive-text-main, #ffffff);font-size:0.8rem;padding:6px 10px;border-radius:8px;outline:none;cursor:pointer;font-weight:600;`;
        const autoOption = document.createElement('option');
        autoOption.value = '';
        autoOption.textContent = 'Авто';
        trayColsSelect.appendChild(autoOption);
        for (let cols = 2; cols <= 12; cols++) {
            const option = document.createElement('option');
            option.value = cols.toString();
            option.textContent = `${cols} столб.`;
            if (this.trayColsUser === cols) option.selected = true;
            trayColsSelect.appendChild(option);
        }
        trayColsSelect.onchange = () => {
            const val = trayColsSelect.value;
            if (val === 'auto' || val === '') { this.trayColsUser = null; localStorage.removeItem('puzzleTrayCols'); }
            else { this.trayColsUser = parseInt(val, 10); localStorage.setItem('puzzleTrayCols', val); }
            this._trayGridDirty = true;
            this._layoutTrayRect = null;
            const total = this.cols * this.rows;
            this.tiles.forEach(tile => {
                if (tile.currentPos >= total) {
                    const el = this.tileElements.get(tile.id);
                    if (el) { el.getAnimations().forEach(anim => anim.cancel()); this.updateTileElementPosition(el, tile, true); }
                }
            });
            this.updateBoardSize(true);
            playSound('click');
        };
        trayColsSelector.appendChild(trayColsLabel);
        trayColsSelector.appendChild(trayColsSelect);
        leftPanel.appendChild(trayColsSelector);

        // ID Selector
        const idSelector = document.createElement('div');
        idSelector.className = 'puzzle-id-selector';
        idSelector.style.cssText = `display:flex;gap:8px;width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:6px;border-radius:14px;margin-top:8px;margin-bottom:2px;align-items:center;`;
        const idLabel = document.createElement('span');
        idLabel.innerHTML = `${icon('search', { size: 14 })} ID:`;
        idLabel.style.cssText = `font-size:0.8rem;font-weight:bold;color:#a78bfa;margin-left:4px;white-space:nowrap;`;
        const idInput = document.createElement('input');
        idInput.type = 'text';
        idInput.className = 'puzzle-id-input';
        idInput.placeholder = 'Открыть по ID (например, 10142981)';
        idInput.style.cssText = `flex:1;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.1);color:#ffffff;font-size:0.8rem;padding:6px 12px;border-radius:8px;outline:none;text-align:center;transition:border-color 0.3s,box-shadow 0.3s;`;
        const showErrorFeedback = (msg) => {
            const oldPlaceholder = idInput.placeholder;
            idInput.value = '';
            idInput.placeholder = msg;
            idInput.style.borderColor = '#f87171';
            idInput.style.boxShadow = '0 0 8px rgba(248,113,113,0.4)';
            setTimeout(() => { idInput.placeholder = oldPlaceholder; idInput.style.borderColor = 'rgba(255,255,255,0.1)'; idInput.style.boxShadow = 'none'; }, 3000);
        };
        const idLoadBtn = document.createElement('button');
        idLoadBtn.className = 'puzzle-id-btn';
        idLoadBtn.textContent = 'Открыть';
        idLoadBtn.style.cssText = `background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#ffffff;border:none;padding:6px 14px;border-radius:8px;font-weight:bold;font-size:0.8rem;cursor:pointer;transition:opacity 0.2s;`;
        idLoadBtn.onmouseover = () => idLoadBtn.style.opacity = '0.9';
        idLoadBtn.onmouseout = () => idLoadBtn.style.opacity = '1';
        idInput.onkeydown = (e) => { if (e.key === 'Enter') { idLoadBtn.click(); } };
        idLoadBtn.onclick = async () => {
            const rawId = idInput.value.trim();
            if (!rawId) { showErrorFeedback('Введите ID!'); return; }
            idLoadBtn.disabled = true;
            idLoadBtn.textContent = 'Поиск...';
            try {
                const post = await fetchPostById(rawId);
                if (post && post.file_url) {
                    const isVideo = p => p && p.file_url && (p.file_url.endsWith('.webm') || p.file_url.endsWith('.mp4'));
                    const allowLong = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
                    const isTooTall = p => {
                        if (allowLong) return false;
                        return p && p.width && p.height && (p.height / p.width > 2.5);
                    };
                    if (isVideo(post)) { showErrorFeedback('Это видео (нельзя)!'); return; }
                    if (isTooTall(post)) { showErrorFeedback('Медиа слишком высокое!'); return; }
                    
                    // Пересчитываем количество пазлов для нового поста (если не зафиксировано в настройках)
                    if (!localStorage.getItem('puzzleTargetPieces')) {
                        const weightedTargets = [36, 36, 36, 49, 49, 49, 64, 64, 81, 81, 100, 100];
                        const targetPool = (this.lowPowerMode || this.puzzlePerfMode || this.reducedMotion) ? [25, 36, 36, 49, 49] : weightedTargets;
                        this.targetPieces = targetPool[Math.floor(Math.random() * targetPool.length)];
                    }
                    
                    await this.loadPostAndStart(post, this.targetPieces, post.sample_url || post.file_url || post.preview_url || '');
                    this.updateBoardSize();
                    idInput.value = '';
                } else { showErrorFeedback('ID не найден!'); }
            } catch (err) { console.error(err); showErrorFeedback('Ошибка загрузки!'); }
            finally { idLoadBtn.disabled = false; idLoadBtn.textContent = 'Открыть'; }
        };
        idSelector.appendChild(idLabel);
        idSelector.appendChild(idInput);
        idSelector.appendChild(idLoadBtn);
        leftPanel.appendChild(idSelector);

        // Allow Long Images Toggle
        const allowLongContainer = document.createElement('div');
        allowLongContainer.className = 'puzzle-allow-long-container';
        allowLongContainer.style.cssText = `display:flex;align-items:center;justify-content:space-between;width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);padding:6px 12px;border-radius:14px;margin-top:8px;margin-bottom:2px;`;
        
        const allowLongLeft = document.createElement('div');
        allowLongLeft.style.cssText = `display:flex;align-items:center;gap:6px;font-size:0.8rem;font-weight:bold;color:var(--adaptive-text-main, #ffffff);`;
        allowLongLeft.innerHTML = `${icon('image', { size: 16 })} <span>Разрешить длинные изображения</span>`;

        const allowLongToggle = document.createElement('label');
        allowLongToggle.className = 'r34-toggle-switch';
        const allowLongInput = document.createElement('input');
        allowLongInput.type = 'checkbox';
        allowLongInput.checked = localStorage.getItem('r34_puzzle_allow_long_images') === 'true';
        allowLongInput.onchange = () => {
            localStorage.setItem('r34_puzzle_allow_long_images', allowLongInput.checked ? 'true' : 'false');
            playSound('click');
        };
        const allowLongSlider = document.createElement('span');
        allowLongSlider.className = 'r34-slider';
        allowLongToggle.appendChild(allowLongInput);
        allowLongToggle.appendChild(allowLongSlider);

        const infoBtn = document.createElement('button');
        infoBtn.className = 'info-btn';
        infoBtn.style.cssText = `margin-left:8px;font-size:0.75rem;padding:2px 8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:4px;cursor:pointer;`;
        infoBtn.textContent = '!';
        infoBtn.title = 'Инструкция';
        
        const infoBox = document.createElement('div');
        infoBox.id = 'puzzle-long-image-info';
        infoBox.className = 'info-help-box info-help-box--warn';
        infoBox.style.cssText = `font-size:0.72rem;color:rgba(255,255,255,0.85);margin-top:4px;margin-bottom:6px;padding:8px 12px;line-height:1.4;background:rgba(255,59,107,0.1);border:1px solid rgba(255,59,107,0.3);border-radius:8px;display:none;`;
        infoBox.innerHTML = `<strong>Разрешить длинные изображения:</strong><br>• Отключает фильтр вертикальных картинок<br>• <svg class="warn-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin:0 2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <b>Внимание:</b> могут попадаться очень длинные изображения!`;
        
        infoBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentDisplay = infoBox.style.display;
            infoBox.style.display = currentDisplay === 'none' ? 'block' : 'none';
            console.log('Info button clicked, display:', infoBox.style.display);
        };

        allowLongLeft.appendChild(infoBtn);
        allowLongContainer.appendChild(allowLongLeft);
        allowLongContainer.appendChild(allowLongToggle);
        leftPanel.appendChild(allowLongContainer);
        leftPanel.appendChild(infoBox);


        // Board Container
        const boardContainer = document.createElement('div');
        this.boardContainer = boardContainer;
        boardContainer.className = 'puzzle-board-container';
        const boardRatio = (this.cols && this.rows) ? (this.cols / this.rows) : this.aspectRatio;
        boardContainer.style.aspectRatio = `${boardRatio}`;
        const board = document.createElement('div');
        this.board = board;
        board.className = 'puzzle-board';
        board.style.setProperty('--bw', '480px');
        board.style.setProperty('--bh', '480px');
        boardContainer.appendChild(board);

        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this._resizeRAF) cancelAnimationFrame(this._resizeRAF);
                this._resizeRAF = requestAnimationFrame(() => { this.updateBoardSize(); });
            });
            this.resizeObserver.observe(boardContainer);
        }
        this._resizeHandler = () => {
            if (this._resizeRAF) cancelAnimationFrame(this._resizeRAF);
            this._resizeRAF = requestAnimationFrame(() => { this._trayGridDirty = true; this.updateBoardSize(); });
        };
        window.addEventListener('resize', this._resizeHandler);

        const hintOverlay = document.createElement('div');
        this.hintOverlay = hintOverlay;
        hintOverlay.className = 'puzzle-hint-overlay';
        const hintImg = document.createElement('img');
        hintImg.src = this.displayUrl || this.imgUrl;
        hintImg.style.cssText = `width:100%;height:100%;object-fit:fill;display:block;`;
        hintImg.decoding = 'async';
        hintImg.setAttribute('draggable', 'false');
        hintOverlay.appendChild(hintImg);
        boardContainer.appendChild(hintOverlay);

        // ============================================================
        // // ИЗМЕНЕНО: Трей — убран dashed бордер, новый фон
        // ============================================================
        const trayDiv = document.createElement('div');
        trayDiv.className = 'puzzle-tray';
        trayDiv.style.cssText = `position:relative;width:100%;flex:1;min-height:200px;background:linear-gradient(180deg,rgba(15,15,25,0.9),rgba(10,10,18,0.95));border-radius:16px;border:1px solid rgba(255,255,255,0.08);z-index:0;box-sizing:border-box;overflow:auto;display:none;box-shadow:0 4px 20px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.05);`;

        // ============================================================
        // // ИЗМЕНЕНО: Статус-индикатор — градиентный бордер вместо
        // градиентного фона + blur
        // ============================================================
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'puzzle-status-indicator';
        statusIndicator.style.cssText = `
            position:absolute;top:0;left:0;right:0;bottom:0;
            font-size:1.2rem;font-weight:700;color:#fff;
            pointer-events:none;z-index:1000;
            display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;
            background:linear-gradient(rgba(12,12,22,0.95),rgba(12,12,22,0.95)) padding-box,
                        linear-gradient(135deg,#8b5cf6,#ec4899,#f59e0b) border-box;
            border:2px solid transparent;
            border-radius:16px;
        `;
        statusIndicator.innerHTML = `<span id="puzzle-status-icon" style="display:flex;align-items:center;justify-content:center;">${icon('target', { size: 42 })}</span> <span id="puzzle-status-text" style="font-size:1.1rem;font-weight:700;">Предпросмотр</span>`;
        trayDiv.appendChild(statusIndicator);

        // ============================================================
        // // ИЗМЕНЕНО: Прогресс-бар — градиент, свечение, scaleX
        // ============================================================
        const trayProgressBar = document.createElement('div');
        trayProgressBar.id = 'puzzle-progress-bar';
        trayProgressBar.style.cssText = `
            position:absolute;bottom:15px;left:20px;right:20px;
            height:8px;background:rgba(255,255,255,0.1);
            border-radius:6px;overflow:hidden;display:none;z-index:1001;
        `;
        const progressFill = document.createElement('div');
        progressFill.id = 'puzzle-progress-fill';
        progressFill.style.cssText = `
            height:100%;
            background:linear-gradient(90deg,#8b5cf6,#ec4899,#f59e0b);
            background-size:200% 100%;
            animation:progress-shine 2s linear infinite;
            width:0%;
            transition:width 0.3s ease;
            box-shadow:0 0 12px rgba(139,92,246,0.4);
            border-radius:6px;
        `;
        trayProgressBar.appendChild(progressFill);
        trayDiv.appendChild(trayProgressBar);
        leftPanel.appendChild(trayDiv);
        this.trayDiv = trayDiv;

        // Win Overlay
        const winOverlay = document.createElement('div');
        this.winOverlay = winOverlay;
        winOverlay.className = 'puzzle-win-overlay';
        const winTitle = document.createElement('div');
        winTitle.className = 'puzzle-win-title';
        winTitle.innerHTML = `${icon('partyPopper', { size: 20 })} Пазл Собран!`;
        const winText = document.createElement('div');
        winText.className = 'puzzle-win-text';
        const winBtn = document.createElement('button');
        winBtn.className = 'puzzle-btn puzzle-btn-primary';
        winBtn.style.cssText = `width:200px;padding:12px 18px;font-size:0.9rem;`;
        winBtn.innerHTML = `Следующее медиа ${icon('arrowRight', { size: 16 })}`;
        winBtn.onclick = () => { this.destroy(); if (this.onNext) this.onNext(); };
        winOverlay.appendChild(winTitle);
        winOverlay.appendChild(winText);
        winOverlay.appendChild(winBtn);
        trayDiv.appendChild(winOverlay);

        // Loader Overlay
        const loaderOverlay = document.createElement('div');
        this.loaderOverlay = loaderOverlay;
        loaderOverlay.className = 'puzzle-loader-overlay';
        const spinner = document.createElement('div');
        spinner.className = 'puzzle-loader-spinner';
        const loaderText = document.createElement('div');
        this.loaderText = loaderText;
        loaderText.className = 'puzzle-loader-text';
        loaderText.textContent = 'Подготовка...';
        const progressContainer = document.createElement('div');
        progressContainer.className = 'puzzle-loader-progress-container';
        const progressBar = document.createElement('div');
        this.loaderProgressBar = progressBar;
        progressBar.className = 'puzzle-loader-progress-bar';
        progressContainer.appendChild(progressBar);
        loaderOverlay.appendChild(spinner);
        loaderOverlay.appendChild(loaderText);
        loaderOverlay.appendChild(progressContainer);
        boardContainer.appendChild(loaderOverlay);
        rightPanel.appendChild(boardContainer);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'puzzle-controls';
        const resetBtn = document.createElement('button');
        this.resetBtn = resetBtn;
        resetBtn.className = 'puzzle-btn';
        resetBtn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;">${icon('refresh', { size: 16 })}</span><span>Заново</span>`;
        resetBtn.onclick = () => this.initPuzzle();
        const hintBtn = document.createElement('button');
        this.hintBtn = hintBtn;
        hintBtn.className = 'puzzle-btn';
        hintBtn.id = 'puzzle-hint-btn';
        hintBtn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;">${icon('eye', { size: 16 })}</span><span>Исходник</span>`;
        hintBtn.onclick = () => this.toggleHint();
        const solveBtn = document.createElement('button');
        this.solveBtn = solveBtn;
        solveBtn.className = 'puzzle-btn';
        solveBtn.id = 'puzzle-solve-btn';
        solveBtn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;">${icon('bot', { size: 16 })}</span><span>Собрать</span>`;
        solveBtn.onclick = () => this.autoSolve();
        const skipBtn = document.createElement('button');
        skipBtn.className = 'puzzle-btn';
        skipBtn.id = 'puzzle-skip-btn';
        skipBtn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;">${icon('skipForward', { size: 16 })}</span><span>Пропустить</span>`;
        skipBtn.onclick = () => { this.destroy(); if (this.onNext) this.onNext(); };
        controls.appendChild(resetBtn);
        controls.appendChild(hintBtn);
        controls.appendChild(solveBtn);
        controls.appendChild(skipBtn);
        leftPanel.appendChild(controls);
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.appendChild(overlay);

        this.board = board;
        this.hintOverlay = hintOverlay;
        this.winOverlay = winOverlay;
        this.winText = winText;
        this.timerLabel = timerBadge.querySelector('span');
        this.movesLabel = movesBadge.querySelector('span');
        this.recordLabel = recordBadge.querySelector('span');
        this.loadRecord();
    }

    // ============================================================
    // Остальные методы класса (loadRecord, generateJigsawSeams,
    // getJunction, getTileById, getGroupTiles, getTileJigsawShape,
    // buildTileJigsawPath) — БЕЗ ИЗМЕНЕНИЙ
    // ============================================================
    loadRecord() {
        const postId = (this.post && this.post.id) ? `_post_${this.post.id}` : '';
        const key = `r34_puzzle_best${postId}_${this.cols}x${this.rows}`;
        try {
            const best = localStorage.getItem(key);
            if (best) {
                const data = JSON.parse(best);
                if (data && typeof data.seconds === 'number' && typeof data.moves === 'number') {
                    const m = Math.floor(data.seconds / 60).toString().padStart(2, '0');
                    const s = (data.seconds % 60).toString().padStart(2, '0');
                    if (this.recordLabel) this.recordLabel.textContent = `${m}:${s} (${data.moves}х)`;
                    return;
                }
            }
        } catch (e) { console.error('Error loading puzzle record:', e); }
        if (this.recordLabel) this.recordLabel.textContent = '--';
    }

    generateJigsawSeams() {
        this.tileShapeCache.clear();
        this.correctTilePositionCache.clear();
        this.horizSeams = [];
        this.vertSeams = [];
        this.gridJunctions = [];
        for (let r = 0; r <= this.rows; r++) {
            this.gridJunctions[r] = [];
            for (let c = 0; c <= this.cols; c++) {
                this.gridJunctions[r][c] = { x: c / this.cols, y: r / this.rows };
            }
        }
        this.gridX = Array.from({ length: this.cols + 1 }, (_, i) => i / this.cols);
        this.gridY = Array.from({ length: this.rows + 1 }, (_, i) => i / this.rows);
        const maxDim = Math.max(this.cols, this.rows);
        const scale = maxDim >= 8 ? 0.82 : (maxDim >= 6 ? 0.90 : 1.0);
        for (let r = 0; r < this.rows - 1; r++) {
            this.horizSeams[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const isWavy = Math.random() < 0.5;
                this.horizSeams[r][c] = {
                    dir: Math.random() < 0.5 ? 1 : -1,
                    shape: Math.random() < 0.5 ? 'classic' : 'wavy',
                    tabPos: 0.36 + Math.random() * 0.28,
                    tabSize: (0.16 + Math.random() * 0.06) * scale,
                    tabWidth: (0.16 + Math.random() * 0.06) * scale,
                    neckWidth: (0.07 + Math.random() * 0.03) * scale,
                    skew: (Math.random() - 0.5) * 0.18,
                    baseCurve: isWavy ? (Math.random() < 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.08) : 0,
                    waveCurve: 0
                };
            }
        }
        for (let r = 0; r < this.rows; r++) {
            this.vertSeams[r] = [];
            for (let c = 0; c < this.cols - 1; c++) {
                const isWavy = Math.random() < 0.5;
                this.vertSeams[r][c] = {
                    dir: Math.random() < 0.5 ? 1 : -1,
                    shape: Math.random() < 0.5 ? 'classic' : 'wavy',
                    tabPos: 0.36 + Math.random() * 0.28,
                    tabSize: (0.16 + Math.random() * 0.06) * scale,
                    tabWidth: (0.16 + Math.random() * 0.06) * scale,
                    neckWidth: (0.07 + Math.random() * 0.03) * scale,
                    skew: (Math.random() - 0.5) * 0.18,
                    baseCurve: isWavy ? (Math.random() < 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.08) : 0,
                    waveCurve: 0
                };
            }
        }
    }

    getJunction(r, c) {
        if (!this.gridJunctions || !this.gridJunctions[r] || !this.gridJunctions[r][c]) {
            return { x: c / this.cols, y: r / this.rows };
        }
        return this.gridJunctions[r][c];
    }

    getTileById(tileId) { return this.tileById ? this.tileById.get(tileId) || null : null; }
    getGroupTiles(groupId) { return this.groupTiles ? (this.groupTiles.get(groupId) || []) : []; }

    getTileJigsawShape(r, c) {
        const cacheKey = `${this.cols}x${this.rows}:${this.shapeStyle}:${r}:${c}`;
        if (this.tileShapeCache.has(cacheKey)) return this.tileShapeCache.get(cacheKey);
        const P = 0.40;
        const F = 1.80;
        const cornerRadiusPx = 18;
        const typicalBoardPx = 400;
        const tileSizePx = typicalBoardPx / Math.max(this.cols, this.rows);
        const normalizedR = Math.min(0.3, cornerRadiusPx / tileSizePx);
        const baseR = normalizedR / F;
        const R_top_left = (r === 0 && c === 0) ? baseR : 0;
        const R_top_right = (r === 0 && c === this.cols - 1) ? baseR : 0;
        const R_bottom_right = (r === this.rows - 1 && c === this.cols - 1) ? baseR : 0;
        const R_bottom_left = (r === this.rows - 1 && c === 0) ? baseR : 0;
        const tl = this.getJunction(r, c);
        const tr = this.getJunction(r, c + 1);
        const br = this.getJunction(r + 1, c + 1);
        const bl = this.getJunction(r + 1, c);
        const xMin = Math.min(tl.x, bl.x);
        const xMax = Math.max(tr.x, br.x);
        const yMin = Math.min(tl.y, tr.y);
        const yMax = Math.max(bl.y, br.y);
        const tileW = Math.max(0.0001, xMax - xMin);
        const tileH = Math.max(0.0001, yMax - yMin);
        const boardRatio = (this.cols && this.rows) ? (this.cols / this.rows) : (this.aspectRatio || 1.0);
        const physW = boardRatio * tileW;
        const physH = tileH;
        const x_tl = (P + (tl.x - xMin) / tileW) / F;
        const y_tl = (P + (tl.y - yMin) / tileH) / F;
        const x_tr = (P + (tr.x - xMin) / tileW) / F;
        const y_tr = (P + (tr.y - yMin) / tileH) / F;
        const x_br = (P + (br.x - xMin) / tileW) / F;
        const y_br = (P + (br.y - yMin) / tileH) / F;
        const x_bl = (P + (bl.x - xMin) / tileW) / F;
        const y_bl = (P + (bl.y - yMin) / tileH) / F;
        let pathStr = `M ${(x_tl + R_top_left).toFixed(5)} ${y_tl.toFixed(5)}`;
        if (r === 0) { pathStr += ` L ${(x_tr - R_top_right).toFixed(5)} ${y_tr.toFixed(5)}`; }
        else { const seam = this.horizSeams[r - 1] ? this.horizSeams[r - 1][c] : null; pathStr += drawJigsawEdge(x_tl, y_tl, x_tr, y_tr, false, seam, physW, physH); }
        if (R_top_right > 0) { pathStr += ` Q ${x_tr.toFixed(5)} ${y_tr.toFixed(5)} ${x_tr.toFixed(5)} ${(y_tr + R_top_right).toFixed(5)}`; }
        if (c === this.cols - 1) { pathStr += ` L ${x_tr.toFixed(5)} ${(y_br - R_bottom_right).toFixed(5)}`; }
        else { const seam = this.vertSeams[r] ? this.vertSeams[r][c] : null; pathStr += drawJigsawEdge(x_tr, y_tr, x_br, y_br, false, seam, physW, physH); }
        if (R_bottom_right > 0) { pathStr += ` Q ${x_br.toFixed(5)} ${y_br.toFixed(5)} ${(x_br - R_bottom_right).toFixed(5)} ${y_br.toFixed(5)}`; }
        if (r === this.rows - 1) { pathStr += ` L ${(x_bl + R_bottom_left).toFixed(5)} ${y_bl.toFixed(5)}`; }
        else { const seam = this.horizSeams[r] ? this.horizSeams[r][c] : null; pathStr += drawJigsawEdge(x_br, y_br, x_bl, y_bl, true, seam, physW, physH); }
        if (R_bottom_left > 0) { pathStr += ` Q ${x_bl.toFixed(5)} ${y_bl.toFixed(5)} ${x_bl.toFixed(5)} ${(y_bl - R_bottom_left).toFixed(5)}`; }
        if (c === 0) { pathStr += ` L ${x_tl.toFixed(5)} ${(y_tl + R_top_left).toFixed(5)}`; }
        else { const seam = this.vertSeams[r] ? this.vertSeams[r][c - 1] : null; pathStr += drawJigsawEdge(x_bl, y_bl, x_tl, y_tl, true, seam, physW, physH); }
        if (R_top_left > 0) { pathStr += ` Q ${x_tl.toFixed(5)} ${y_tl.toFixed(5)} ${(x_tl + R_top_left).toFixed(5)} ${y_tl.toFixed(5)}`; }
        pathStr += ' Z';
        const result = { pathStr, xMin, yMin, tileW, tileH, tl, tr, br, bl, P, F };
        this.tileShapeCache.set(cacheKey, result);
        return result;
    }

    buildTileJigsawPath(r, c) { return this.getTileJigsawShape(r, c).pathStr; }

    // ============================================================
    // // ИЗМЕНЕНО: initPuzzle — ускоренная разбивка (3с вместо 4с),
    // диагональный разлёт вместо построчного, spring easing
    // ============================================================
    initPuzzle() {
        this.gameId = 'pg_' + Math.random().toString(36).substring(2, 8);
        const currentId = this.gameId;
        this.stopTimer();
        if (this.introHintTimer) { clearTimeout(this.introHintTimer); this.introHintTimer = null; }
        if (this.introAnimTimer) { clearTimeout(this.introAnimTimer); this.introAnimTimer = null; }
        if (this.introCutTimer) { clearTimeout(this.introCutTimer); this.introCutTimer = null; }

        this._suppressLayoutReads = false;

        this.seconds = 0;
        this.moves = 0;
        this.selectedIdx = null;
        this.isPlaying = true;
        this.hasWon = false;
        this.isSolving = false;
        this.wasAutoSolved = false;
        this.wasOverlappingLastCheck = false;
        this._trayGridDirty = true;

        if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
        if (this.hintCountInterval) { clearInterval(this.hintCountInterval); this.hintCountInterval = null; }
        if (this.hintCooldownTimer) { clearInterval(this.hintCooldownTimer); this.hintCooldownTimer = null; }

        this.isHintActive = false;
        this.hintCooldown = 0;
        this.showHintActive = false;
        this.loadRecord();
        this.updateStats();
        this.hintOverlay.classList.remove('visible');
        if (this.boardContainer) this.boardContainer.classList.remove('hint-active');
        this.winOverlay.classList.remove('visible');

        if (this.trayDiv) {
            this.trayDiv.style.borderColor = 'rgba(255,255,255,0.08)';
            if (window.innerWidth < 900) { this.trayDiv.style.overflowY = 'auto'; }
        }

        this.setControlsEnabled(false);
        if (this.hintBtn) {
            this.hintBtn.classList.remove('active-toggle');
            this.hintBtn.innerHTML = `<span>${icon('eye', { size: 16 })}</span><span>Исходник</span>`;
        }
        if (this.board) {
            this.board.classList.remove('won');
            if (Math.max(this.cols, this.rows) >= 6) { this.board.classList.add('size-large'); }
            else { this.board.classList.remove('size-large'); }
        }

        this.generateJigsawSeams();
        if (this.boardContainer) { this.boardContainer.style.overflow = 'visible'; this.boardContainer.style.maxHeight = 'none'; }
        if (this.trayDiv) this.trayDiv.style.display = 'block';
        this.updateBoardSize(true);

        this.tiles = [];
        this.tileById = new Map();
        this._trayTileCount = 0;
        const total = this.cols * this.rows;
        for (let i = 0; i < total; i++) {
            const row = Math.floor(i / this.cols);
            const col = i % this.cols;
            const tile = { id: i, correctRow: row, correctCol: col, currentPos: i, groupId: i, boardX: 0, boardY: 0 };
            this.tiles.push(tile);
            this.tileById.set(tile.id, tile);
        }
        this.tiles.forEach(tile => {
            const pos = this.getCorrectTilePosition(tile);
            tile.boardX = pos.x;
            tile.boardY = pos.y;
        });

        this.updateGroups();
        this._updatePosToTileMap();
        this.renderBoard();
        this.updateBoardSize();

        if (this.board) {
            this.board.classList.add('intro-mode');
            this.board.style.backgroundImage = `url('${this.displayUrl || this.imgUrl}')`;
            this.board.style.backgroundSize = '100% 100%';
            this.board.style.backgroundPosition = 'center';
            this.board.style.backgroundRepeat = 'no-repeat';
        }

        this.updatePuzzleStatus('preview');

        // // ИЗМЕНЕНО: Разбивка через 3 секунды вместо 4
        const cutTimerId = setTimeout(() => {
            if (this.gameId !== currentId) return;
            if (this.board && this.isPlaying) {
                this.board.classList.add('cutting');
                this.board.classList.remove('intro-mode');
                this.board.style.opacity = '1';
                setTimeout(() => {
                    if (this.gameId !== currentId) return;
                    if (this.board) this.board.style.backgroundImage = '';
                }, 500);
                this.updatePuzzleStatus('cutting');
            }
        }, 3000); // // Было 4000
        this.introCutTimer = cutTimerId;

        // // ИЗМЕНЕНО: Разлёт через 5 секунд вместо 6
        if (this.introAnimTimer) clearTimeout(this.introAnimTimer);
        this.introAnimTimer = setTimeout(() => {
            if (this.gameId !== currentId) return;
            if (!this.isPlaying) return;

            this.updatePuzzleStatus('scattering');
            if (this.board) {
                this.board.classList.remove('cutting');
                this.board.style.backgroundImage = '';
            }

            const total = this.cols * this.rows;

            this._suppressLayoutReads = true;

            this.tiles.forEach((tile, i) => { tile.currentPos = total + i; });
            this.shuffle();
            const trayPositions = this.tiles.map(tile => tile.currentPos);
            this.tiles.forEach((tile, i) => { tile.currentPos = i; });
            this.updateBoardSize();

            // // ИЗМЕНЕНО: Диагональный разлёт вместо построчного
            const maxDiag = (this.rows - 1) + (this.cols - 1);
            for (let d = 0; d <= maxDiag; d++) {
                setTimeout(() => {
                    if (this.gameId !== currentId) return;
                    if (!this.isPlaying) return;
                    playSound('fold');

                    this.tiles.forEach((tile, i) => {
                        const tileDiag = tile.correctRow + tile.correctCol;
                        if (tileDiag === d) {
                            tile.currentPos = trayPositions[i];
                            const el = this.tileElements.get(tile.id);
                            if (el) {
                                el.style.zIndex = '100';
                                el.classList.add('folding-to-tray');
                                this.updateTileElementPosition(el, tile);
                            }
                        }
                    });

                    this._trayTileCount = this.tiles.filter(t => t.currentPos >= total).length;
                    this.updateBoardSize(true);

                    setTimeout(() => {
                        if (this.gameId !== currentId) return;
                        this.tiles.forEach((tile) => {
                            const tileDiag = tile.correctRow + tile.correctCol;
                            if (tileDiag === d) {
                                const el = this.tileElements.get(tile.id);
                                if (el) {
                                    el.style.zIndex = '';
                                    el.classList.remove('folding-to-tray');
                                }
                            }
                        });
                    }, 600); // // Было 800
                }, d * 80); // // Было r * 350
            }

            // // ИЗМЕНЕНО: Общая длительность разлёта
            const totalScatterTime = (maxDiag + 1) * 80 + 700;
            setTimeout(() => {
                if (this.gameId !== currentId) return;
                if (!this.isPlaying) return;
                this._suppressLayoutReads = false;
                this.compactTray();
                this.updateBoardSize();
                this.startTimer();
                this.setControlsEnabled(true);
                this.updatePuzzleStatus('playing');
            }, totalScatterTime);

            if (this.gameId === currentId) {
                this.introAnimTimer = null;
                this.introCutTimer = null;
            }
        }, 5000); // // Было 6000
    }

    // ============================================================
    // // ИЗМЕНЕНО: updatePuzzleStatus — улучшенные иконки и прогресс
    // ============================================================
    updatePuzzleStatus(status) {
        const statusText = document.getElementById('puzzle-status-text');
        const statusIcon = document.getElementById('puzzle-status-icon');
        const statusBar = document.getElementById('puzzle-progress-bar');
        const progressFill = document.getElementById('puzzle-progress-fill');
        const statusIndicator = document.getElementById('puzzle-status-indicator');
        if (!statusText || !statusIcon || !statusIndicator) return;

        switch (status) {
            case 'preview':
                statusText.textContent = 'Предпросмотр';
                statusIcon.innerHTML = icon('target', { size: 32 });
                statusIndicator.style.display = 'flex';
                if (statusBar) {
                    statusBar.style.display = 'block';
                    progressFill.style.width = '0%';
                    progressFill.style.transition = 'width 3s linear';
                    setTimeout(() => { progressFill.style.width = '33%'; }, 50);
                }
                break;
            case 'cutting':
                statusText.textContent = 'Разбивание на пазлы';
                statusIcon.innerHTML = icon('scissors', { size: 32 });
                statusIndicator.style.display = 'flex';
                if (statusBar) {
                    progressFill.style.transition = 'width 0.5s ease';
                    progressFill.style.width = '33%';
                    setTimeout(() => progressFill.style.width = '66%', 500);
                }
                break;
            case 'scattering':
                statusText.textContent = 'Разброс деталей';
                statusIcon.innerHTML = icon('box', { size: 32 });
                statusIndicator.style.display = 'flex';
                if (statusBar) {
                    progressFill.style.transition = 'width 2s ease';
                    progressFill.style.width = '66%';
                    setTimeout(() => progressFill.style.width = '83%', 500);
                    setTimeout(() => progressFill.style.width = '100%', 1500);
                }
                break;
            case 'playing':
                statusIndicator.style.display = 'none';
                if (statusBar) statusBar.style.display = 'none';
                break;
        }
    }

    // ============================================================
    // shuffle, renderBoard, onTileClick, highlightTile, highlightGroup,
    // updateGroups, getCorrectTilePosition, flashGroupTiles,
    // isTileAtAbsoluteCorrectPosition, placeGroupComplex, getTrayGrid,
    // updateDragTargetHighlight, clearDragHighlight, _updatePosToTileMap,
    // getPosFromCoords, clampDragPointToBoard, clampBoardPercent,
    // clampTilePositionToBoard — БЕЗ ИЗМЕНЕНИЙ
    // ============================================================
    shuffle() {
        const total = this.tiles.length;
        for (let step = 0; step < 200; step++) {
            const idx1 = Math.floor(Math.random() * total);
            const idx2 = Math.floor(Math.random() * total);
            if (idx1 !== idx2) {
                const temp = this.tiles[idx1].currentPos;
                this.tiles[idx1].currentPos = this.tiles[idx2].currentPos;
                this.tiles[idx2].currentPos = temp;
            }
        }
        this.updateGroups();
    }

    // ============================================================
    // // ИЗМЕНЕНО: renderBoard — убран mix-blend-mode из shading
    // ============================================================
    renderBoard() {
        if (this.trayDiv) {
            this.trayDiv.querySelectorAll('.puzzle-tile').forEach(el => el.remove());
        }
        this.board.innerHTML = '';
        this.tileElements.clear();
        this.svgDefsContainer.innerHTML = '';

        const boardChildren = document.createDocumentFragment();
        const P = 0.40;
        const F = 1.80;
        const colW = 100 / this.cols;
        const rowH = 100 / this.rows;
        const widthExpanded = colW * F;
        const heightExpanded = rowH * F;

        const boardRatio = (this.cols && this.rows) ? (this.cols / this.rows) : (this.aspectRatio || 1.0);
        const bWidth = this.board.clientWidth || this.boardContainer.clientWidth || 480;
        const bHeight = this.board.clientHeight || Math.round(bWidth / boardRatio) || 480;
        this.board.style.setProperty('--bw', `${bWidth}px`);
        this.board.style.setProperty('--bh', `${bHeight}px`);
        if (bWidth > 0 && bHeight > 0) { this._boardHToW = bHeight / bWidth; }

        const gridSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        gridSvg.setAttribute('class', 'puzzle-grid-mesh');
        gridSvg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;`;
        gridSvg.setAttribute('viewBox', `0 0 ${this.cols} ${this.rows}`);
        gridSvg.setAttribute('preserveAspectRatio', 'none');
        for (let i = 1; i < this.rows; i++) {
            const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            hLine.setAttribute('x1', '0');
            hLine.setAttribute('y1', (this.gridY[i] * this.rows).toString());
            hLine.setAttribute('x2', this.cols.toString());
            hLine.setAttribute('y2', (this.gridY[i] * this.rows).toString());
            hLine.setAttribute('stroke', 'rgba(255,255,255,0.15)');
            hLine.setAttribute('stroke-width', '0.04');
            hLine.setAttribute('stroke-dasharray', '0.1 0.1');
            gridSvg.appendChild(hLine);
        }
        for (let i = 1; i < this.cols; i++) {
            const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            vLine.setAttribute('x1', (this.gridX[i] * this.cols).toString());
            vLine.setAttribute('y1', '0');
            vLine.setAttribute('x2', (this.gridX[i] * this.cols).toString());
            vLine.setAttribute('y2', this.rows.toString());
            vLine.setAttribute('stroke', 'rgba(255,255,255,0.15)');
            vLine.setAttribute('stroke-width', '0.04');
            vLine.setAttribute('stroke-dasharray', '0.1 0.1');
            gridSvg.appendChild(vLine);
        }
        boardChildren.appendChild(gridSvg);

        this.tiles.forEach((tile) => {
            const clipId = `clip-${this.gameId}-${tile.id}`;
            const tileData = this.getTileJigsawShape(tile.correctRow, tile.correctCol);
            const normalizedPath = tileData.pathStr;
            const widthExpanded = tileData.tileW * 100 * tileData.F;
            const heightExpanded = tileData.tileH * 100 * tileData.F;

            const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPath.setAttribute('id', clipId);
            clipPath.setAttribute('clipPathUnits', 'objectBoundingBox');
            const pathElem = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathElem.setAttribute('d', normalizedPath);
            clipPath.appendChild(pathElem);
            this.svgDefsContainer.appendChild(clipPath);

            const element = document.createElement('div');
            element.className = `puzzle-tile ${this.showNumbersActive ? 'show-num' : ''}`;
            element.dataset.tileId = tile.id;
            element.setAttribute('draggable', 'false');
            element.style.touchAction = 'none';
            this.tileElements.set(tile.id, element);

            const maxDelay = 1.3;
            const rowDelay = this.rows > 1 ? (tile.correctRow / (this.rows - 1)) * maxDelay : 0;
            element.style.setProperty('--row-delay', `${rowDelay}s`);
            element.style.clipPath = `url(#${clipId})`;
            element.style.webkitClipPath = `url(#${clipId})`;

            const clipper = document.createElement('div');
            clipper.style.cssText = `position:absolute;width:100%;height:100%;overflow:hidden;`;
            element.appendChild(clipper);
            element.style.width = `${widthExpanded.toFixed(5)}%`;
            element.style.height = `${heightExpanded.toFixed(5)}%`;
            this.updateTileElementPosition(element, tile);

            const imgWrap = document.createElement('div');
            imgWrap.className = 'puzzle-tile-img';
            imgWrap.style.position = 'absolute';
            const boardWRel = 1 / (tileData.tileW * tileData.F);
            const boardHRel = 1 / (tileData.tileH * tileData.F);
            const leftRel = (tileData.P - tileData.xMin / tileData.tileW) / tileData.F;
            const topRel = (tileData.P - tileData.yMin / tileData.tileH) / tileData.F;
            imgWrap.style.width = `calc(100% * ${boardWRel.toFixed(6)})`;
            imgWrap.style.height = `calc(100% * ${boardHRel.toFixed(6)})`;
            imgWrap.style.left = `calc(100% * ${leftRel.toFixed(6)})`;
            imgWrap.style.top = `calc(100% * ${topRel.toFixed(6)})`;
            imgWrap.style.pointerEvents = 'none';

            const tileImg = document.createElement('img');
            tileImg.src = this.tileDisplayUrl || this.displayUrl || this.imgUrl;
            tileImg.style.cssText = `width:100%;height:100%;object-fit:fill;display:block;pointer-events:none;`;
            tileImg.decoding = 'async';
            tileImg.onerror = () => { if (tileImg.src !== this.imgUrl) { tileImg.src = this.imgUrl; } };
            tileImg.setAttribute('draggable', 'false');
            imgWrap.appendChild(tileImg);
            clipper.appendChild(imgWrap);

            const isPerfMode = localStorage.getItem('r34_puzzle_perf_mode') === 'true' || localStorage.getItem('r34_low_power_mode') === 'true';
            const maxDim = Math.max(this.cols, this.rows);

            if (!isPerfMode) {
                const outlineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                outlineSvg.setAttribute('class', 'puzzle-tile-outline');
                outlineSvg.setAttribute('viewBox', '0 0 1 1');
                outlineSvg.setAttribute('preserveAspectRatio', 'none');

                const strokeLight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                strokeLight.setAttribute('class', 'stroke-light');
                strokeLight.setAttribute('d', normalizedPath);
                strokeLight.setAttribute('fill', 'none');
                strokeLight.setAttribute('transform', 'translate(-0.002, -0.002)');
                strokeLight.setAttribute('stroke', 'rgba(255,255,255,0.72)');
                strokeLight.setAttribute('stroke-width', maxDim > 8 ? '1.0' : '2.0');
                strokeLight.setAttribute('vector-effect', 'non-scaling-stroke');
                strokeLight.setAttribute('stroke-linejoin', 'round');
                strokeLight.setAttribute('stroke-linecap', 'round');
                outlineSvg.appendChild(strokeLight);

                const strokeDark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                strokeDark.setAttribute('class', 'stroke-dark');
                strokeDark.setAttribute('d', normalizedPath);
                strokeDark.setAttribute('fill', 'none');
                strokeDark.setAttribute('transform', 'translate(0.002, 0.002)');
                strokeDark.setAttribute('stroke', 'rgba(0,0,0,0.72)');
                strokeDark.setAttribute('stroke-width', maxDim > 8 ? '0.9' : '1.6');
                strokeDark.setAttribute('vector-effect', 'non-scaling-stroke');
                strokeDark.setAttribute('stroke-linejoin', 'round');
                strokeDark.setAttribute('stroke-linecap', 'round');
                outlineSvg.appendChild(strokeDark);
                element.appendChild(outlineSvg);

                const shading = document.createElement('div');
                shading.className = 'puzzle-tile-shading';
                shading.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:3;`;
                element.appendChild(shading);
            } else if (maxDim < 8) {
                // В режиме производительности рисуем только один простой контур для сетки < 8x8
                const outlineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                outlineSvg.setAttribute('class', 'puzzle-tile-outline');
                outlineSvg.setAttribute('viewBox', '0 0 1 1');
                outlineSvg.setAttribute('preserveAspectRatio', 'none');

                const strokeDark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                strokeDark.setAttribute('class', 'stroke-dark');
                strokeDark.setAttribute('d', normalizedPath);
                strokeDark.setAttribute('fill', 'none');
                strokeDark.setAttribute('stroke', 'rgba(0,0,0,0.5)');
                strokeDark.setAttribute('stroke-width', '1.0');
                strokeDark.setAttribute('vector-effect', 'non-scaling-stroke');
                strokeDark.setAttribute('stroke-linejoin', 'round');
                outlineSvg.appendChild(strokeDark);
                element.appendChild(outlineSvg);
            }

            const numSpan = document.createElement('span');
            numSpan.className = 'puzzle-tile-num';
            numSpan.textContent = tile.id + 1;
            element.appendChild(numSpan);

            // Hover, click, drag handlers — БЕЗ ИЗМЕНЕНИЙ
            element.onmouseenter = () => {
                if (!this.isPlaying || this.isSolving || this.isHintActive) return;
                const groupTiles = this.groupTiles.get(tile.groupId) || [];
                groupTiles.forEach(gt => {
                    const el = this.tileElements.get(gt.id);
                    if (el && el !== element) { el.classList.add('group-hover'); }
                });
            };
            element.onmouseleave = () => {
                const groupTiles = this.groupTiles.get(tile.groupId) || [];
                groupTiles.forEach(gt => {
                    const el = this.tileElements.get(gt.id);
                    if (el) { el.classList.remove('group-hover'); }
                });
            };

            let lastClickTime = 0;
            element.onclick = (e) => {
                e.stopPropagation();
                if (this._dragSuppressNextClick) { this._dragSuppressNextClick = false; return; }
                const now = Date.now();
                if (now - lastClickTime < 300) {
                    if (this.isPlaying && !this.isSolving && !this.isHintActive && tile.id !== tile.currentPos) {
                        const total = this.cols * this.rows;
                        if (tile.currentPos < total) {
                            const trayTiles = this.tiles.filter(t => t.currentPos >= total);
                            const targetPos = total + trayTiles.length;
                            tile.currentPos = targetPos;
                            playSound('fold');
                            element.classList.add('folding-to-tray');
                            this.updateTileElementPosition(element, tile);
                            this.compactTray();
                            this.updateBoardSize();
                            this.updateOverlaps();
                            this.updateGroups();
                            setTimeout(() => { element.classList.remove('folding-to-tray'); }, 600);
                        }
                    }
                    lastClickTime = 0;
                    return;
                }
                lastClickTime = now;
                this.onTileClick(tile.id, e);
            };

            // Mouse drag — БЕЗ ИЗМЕНЕНИЙ (слишком длинный, оставляем как есть)
            element.onmousedown = (e) => {
                if (!this.isPlaying || this.isSolving || this.isHintActive || tile.id === tile.currentPos || e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                this._cachedBoardRect = this.board ? this.board.getBoundingClientRect() : null;
                this.draggedTileId = tile.id;
                this._dragSuppressNextClick = false;
                this._desktopDragState = { tileId: tile.id, startX: e.clientX, startY: e.clientY, moved: false };
                const groupTiles = this.tiles.filter(t => t.groupId === tile.groupId);
                groupTiles.forEach(gt => { const el = this.tileElements.get(gt.id); if (el) el.style.opacity = '0.4'; });
                const groupContainer = document.createElement('div');
                groupContainer.id = 'puzzle-drag-clone';
                groupContainer.style.cssText = `position:fixed;pointer-events:none;z-index:999999;transition:none;margin:0;padding:0;will-change:transform;`;
                const boardRect = this._cachedBoardRect;
                groupContainer.style.width = boardRect ? (boardRect.width + 'px') : '0px';
                groupContainer.style.height = boardRect ? (boardRect.height + 'px') : '0px';
                const F = 1.80;
                const tileData = this.getTileJigsawShape(tile.correctRow, tile.correctCol);
                const mainTileW = boardRect ? (tileData.tileW * F * boardRect.width) : 0;
                const mainTileH = boardRect ? (tileData.tileH * F * boardRect.height) : 0;
                const offsetX = mainTileW / 2;
                const offsetY = mainTileH / 2;
                groupContainer.dataset.offsetX = offsetX;
                groupContainer.dataset.offsetY = offsetY;
                groupTiles.forEach(gt => {
                    const el = this.tileElements.get(gt.id);
                    if (el) {
                        const clone = el.cloneNode(true);
                        const savedClip = el.style.clipPath || '';
                        const savedWebkitClip = el.style.webkitClipPath || '';
                        clone.style.cssText = `position:absolute;pointer-events:none;opacity:0.9;transition:none;margin:0;transform:scale(1);transform-origin:0 0;`;
                        if (savedClip) clone.style.clipPath = savedClip;
                        if (savedWebkitClip) clone.style.webkitClipPath = savedWebkitClip;
                        const gtData = this.getTileJigsawShape(gt.correctRow, gt.correctCol);
                        clone.style.width = `${gtData.tileW * F * 100}%`;
                        clone.style.height = `${gtData.tileH * F * 100}%`;
                        clone.style.left = `${gt.boardX - tile.boardX}%`;
                        clone.style.top = `${gt.boardY - tile.boardY}%`;
                        groupContainer.appendChild(clone);
                    }
                });
                groupContainer.style.left = '0';
                groupContainer.style.top = '0';
                groupContainer.style.transform = `translate3d(${(e.clientX - offsetX).toFixed(1)}px, ${(e.clientY - offsetY).toFixed(1)}px, 0)`;
                document.body.appendChild(groupContainer);

                this._desktopDragMoveHandler = (moveEvent) => {
                    if (!this._desktopDragState || this._desktopDragState.tileId !== tile.id) return;
                    const dx = moveEvent.clientX - this._desktopDragState.startX;
                    const dy = moveEvent.clientY - this._desktopDragState.startY;
                    if (!this._desktopDragState.moved && Math.hypot(dx, dy) > 4) {
                        this._desktopDragState.moved = true;
                        this._dragSuppressNextClick = true;
                    }
                    if (!this._desktopDragState.moved) return;
                    moveEvent.preventDefault();
                    if (this._dragRAFId) cancelAnimationFrame(this._dragRAFId);
                    this._dragRAFId = requestAnimationFrame(() => {
                        const clone = document.getElementById('puzzle-drag-clone');
                        if (clone) {
                            const offsetX = parseFloat(clone.dataset.offsetX || '0');
                            const offsetY = parseFloat(clone.dataset.offsetY || '0');
                            const clampedPoint = this.clampDragPointToBoard(moveEvent.clientX, moveEvent.clientY);
                            clone.style.transform = `translate3d(${(clampedPoint.x - offsetX).toFixed(1)}px, ${(clampedPoint.y - offsetY).toFixed(1)}px, 0)`;
                        }
                        const targetPos = this.getPosFromCoords(moveEvent.clientX, moveEvent.clientY);
                        this.updateDragTargetHighlight(targetPos);
                        this._dragRAFId = null;
                    });
                };

                this._desktopDragUpHandler = (upEvent) => {
                    const state = this._desktopDragState;
                    const groupTiles = this.tiles.filter(t => t.groupId === tile.groupId);
                    groupTiles.forEach(gt => { const el = this.tileElements.get(gt.id); if (el) el.style.opacity = '1'; });
                    if (state && state.tileId === tile.id) {
                        if (state.moved) {
                            const targetPos = this.getPosFromCoords(upEvent.clientX, upEvent.clientY);
                            const rect = this.board ? this.board.getBoundingClientRect() : null;
                            const clone = document.getElementById('puzzle-drag-clone');
                            let isTrayTarget = false;
                            const total = this.cols * this.rows;
                            if (targetPos >= total) isTrayTarget = true;
                            let leftPct = 0, topPct = 0;
                            if (rect && clone) {
                                const offsetX = parseFloat(clone.dataset.offsetX || '0');
                                const offsetY = parseFloat(clone.dataset.offsetY || '0');
                                const clampedPoint = this.clampDragPointToBoard(upEvent.clientX, upEvent.clientY);
                                leftPct = ((clampedPoint.x - offsetX - rect.left) / rect.width) * 100;
                                topPct = ((clampedPoint.y - offsetY - rect.top) / rect.height) * 100;
                            } else if (rect) {
                                const clampedPoint = this.clampDragPointToBoard(upEvent.clientX, upEvent.clientY);
                                leftPct = ((clampedPoint.x - rect.left) / rect.width) * 100 - 10;
                                topPct = ((clampedPoint.y - rect.top) / rect.height) * 100 - 10;
                            }
                            this.placeGroupComplex(this.draggedTileId, leftPct, topPct, isTrayTarget, targetPos);
                        } else {
                            this._dragSuppressNextClick = false;
                        }
                    }
                    this.draggedTileId = null;
                    const clone = document.getElementById('puzzle-drag-clone');
                    if (clone) clone.remove();
                    this.clearDragHighlight();
                    this._cachedBoardRect = null;
                    this._desktopDragState = null;
                    if (this._desktopDragMoveHandler) window.removeEventListener('mousemove', this._desktopDragMoveHandler);
                    if (this._desktopDragUpHandler) window.removeEventListener('mouseup', this._desktopDragUpHandler);
                    this._desktopDragMoveHandler = null;
                    this._desktopDragUpHandler = null;
                    if (this._dragRAFId) { cancelAnimationFrame(this._dragRAFId); this._dragRAFId = null; }
                };

                window.addEventListener('mousemove', this._desktopDragMoveHandler, { passive: false });
                window.addEventListener('mouseup', this._desktopDragUpHandler, { passive: false });
            };

            // Touch handlers — БЕЗ ИЗМЕНЕНИЙ (слишком длинные)
            let touchStartX = 0, touchStartY = 0, touchMoveStarted = false;
            element.addEventListener('touchstart', (e) => {
                if (!this.isPlaying || this.isSolving || this.isHintActive || tile.id === tile.currentPos) return;
                if (!e.touches || e.touches.length > 1) return;
                const touch = e.touches && e.touches[0];
                if (!touch) return;
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                this._lastTouchY = touch.clientY;
                
                // Детектируем, началось ли перетаскивание из лотка
                const trayRect = this.trayDiv ? this.trayDiv.getBoundingClientRect() : null;
                this._dragStartedInTray = !!(trayRect && touch.clientY >= trayRect.top - 10);
                
                touchMoveStarted = false;
                e.stopPropagation();
            }, { passive: true });

            element.addEventListener('touchmove', (e) => {
                if (!e.touches || e.touches.length === 0) return;
                const touch = e.touches && e.touches[0];
                if (!touch) return;
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                if (!touchMoveStarted && Math.hypot(dx, dy) > 5) {
                    if (!this.isPlaying || this.isSolving || this.isHintActive || tile.id === tile.currentPos) return;
                    touchMoveStarted = true;
                    this._cachedBoardRect = this.board.getBoundingClientRect();
                    this.draggedTileId = tile.id;
                    const groupTiles = this.tiles.filter(t => t.groupId === tile.groupId);
                    groupTiles.forEach(gt => { const el = this.tileElements.get(gt.id); if (el) el.style.opacity = '0.4'; });
                    const groupContainer = document.createElement('div');
                    groupContainer.id = 'puzzle-drag-clone';
                    groupContainer.style.cssText = `position:fixed;pointer-events:none;z-index:999999;transition:none;margin:0;padding:0;will-change:transform;`;
                    const boardRect = this._cachedBoardRect;
                    groupContainer.style.width = boardRect.width + 'px';
                    groupContainer.style.height = boardRect.height + 'px';
                    const F = 1.80;
                    const tileData = this.getTileJigsawShape(tile.correctRow, tile.correctCol);
                    const mainTileW = tileData.tileW * F * boardRect.width;
                    const mainTileH = tileData.tileH * F * boardRect.height;
                    const offsetX = mainTileW / 2;
                    const offsetY = mainTileH / 2;
                    groupContainer.dataset.offsetX = offsetX;
                    groupContainer.dataset.offsetY = offsetY;
                    groupTiles.forEach(gt => {
                        const el = this.tileElements.get(gt.id);
                        if (el) {
                            const clone = el.cloneNode(true);
                            const savedClip = el.style.clipPath || '';
                            const savedWebkitClip = el.style.webkitClipPath || '';
                            clone.style.cssText = `position:absolute;pointer-events:none;opacity:0.9;transition:none;margin:0;transform:scale(1);transform-origin:0 0;`;
                            if (savedClip) clone.style.clipPath = savedClip;
                            if (savedWebkitClip) clone.style.webkitClipPath = savedWebkitClip;
                            const gtData = this.getTileJigsawShape(gt.correctRow, gt.correctCol);
                            clone.style.width = `${gtData.tileW * F * 100}%`;
                            clone.style.height = `${gtData.tileH * F * 100}%`;
                            clone.style.left = `${gt.boardX - tile.boardX}%`;
                            clone.style.top = `${gt.boardY - tile.boardY}%`;
                            groupContainer.appendChild(clone);
                        }
                    });
                    groupContainer.style.left = '0';
                    groupContainer.style.top = '0';
                    groupContainer.style.transform = `translate3d(${(touchStartX - offsetX).toFixed(1)}px, ${(touchStartY - offsetY).toFixed(1)}px, 0)`;
                    document.body.appendChild(groupContainer);
                }
                if (touchMoveStarted && this.draggedTileId === tile.id) {
                    if (e.cancelable) e.preventDefault();

                    const currentY = touch.clientY;
                    this._lastTouchY = currentY;

                    // Сбрасываем флаг старта из лотка, если палец поднялся выше зоны активации скролла вниз
                    if (this._dragStartedInTray) {
                        const boardRect = this.boardContainer ? this.boardContainer.getBoundingClientRect() : (this.board ? this.board.getBoundingClientRect() : null);
                        if (boardRect) {
                            const visibleBoardBottom = Math.min(boardRect.bottom, window.innerHeight);
                            const threshold = 60;
                            if (currentY < visibleBoardBottom - threshold) {
                                this._dragStartedInTray = false;
                            }
                        }
                    }

                    // Auto-scroll logic for mobile (теперь без постоянного дергания)
                    this.handleAutoScroll(currentY);

                    if (this._dragRAFId) cancelAnimationFrame(this._dragRAFId);
                    this._dragRAFId = requestAnimationFrame(() => {
                        const clone = document.getElementById('puzzle-drag-clone');
                        if (clone) {
                            const offsetX = parseFloat(clone.dataset.offsetX);
                            const offsetY = parseFloat(clone.dataset.offsetY);
                            const clampedPoint = this.clampDragPointToBoard(touch.clientX, touch.clientY);
                            clone.style.transform = `translate3d(${(clampedPoint.x - offsetX).toFixed(1)}px, ${(clampedPoint.y - offsetY).toFixed(1)}px, 0)`;
                            const targetPos = this.getPosFromCoords(touch.clientX, touch.clientY);
                            this.updateDragTargetHighlight(targetPos);
                        }
                        this._dragRAFId = null;
                    });
                }
            }, { passive: false });

            element.addEventListener('touchend', (e) => {
                this.stopAutoScroll();
                this._lastTouchY = null;
                this._dragStartedInTray = false;
                if (this.draggedTileId !== tile.id) { touchMoveStarted = false; return; }
                if (touchMoveStarted) {
                    e.preventDefault();
                    e.stopPropagation();
                    const touch = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
                    const clientX = touch ? touch.clientX : touchStartX;
                    const clientY = touch ? touch.clientY : touchStartY;
                    const groupTiles = this.tiles.filter(t => t.groupId === tile.groupId);
                    groupTiles.forEach(gt => { const el = this.tileElements.get(gt.id); if (el) el.style.opacity = '1'; });
                    this._cachedBoardRect = null;
                    const clone = document.getElementById('puzzle-drag-clone');
                    const targetPos = this.getPosFromCoords(clientX, clientY);
                    const rect = this.board.getBoundingClientRect();
                    let isTrayTarget = false;
                    const total = this.cols * this.rows;
                    if (targetPos >= total) isTrayTarget = true;
                    let leftPct, topPct;
                    if (clone) {
                        const offsetX = parseFloat(clone.dataset.offsetX) || 0;
                        const offsetY = parseFloat(clone.dataset.offsetY) || 0;
                        const clampedPoint = this.clampDragPointToBoard(clientX, clientY);
                        leftPct = ((clampedPoint.x - offsetX - rect.left) / rect.width) * 100;
                        topPct = ((clampedPoint.y - offsetY - rect.top) / rect.height) * 100;
                    } else {
                        const clampedPoint = this.clampDragPointToBoard(clientX, clientY);
                        leftPct = ((clampedPoint.x - rect.left) / rect.width) * 100 - 10;
                        topPct = ((clampedPoint.y - rect.top) / rect.height) * 100 - 10;
                    }
                    this.placeGroupComplex(this.draggedTileId, leftPct, topPct, isTrayTarget, targetPos);
                    this.draggedTileId = null;
                    if (clone) clone.remove();
                    this.clearDragHighlight();
                    this._cachedBoardRect = null;
                    if (this._dragRAFId) { cancelAnimationFrame(this._dragRAFId); this._dragRAFId = null; }
                }
                touchMoveStarted = false;
            }, { passive: false });

            element.addEventListener('touchcancel', () => {
                this.stopAutoScroll();
                this._dragStartedInTray = false;
                if (this.draggedTileId === tile.id) {
                    const groupTiles = this.tiles.filter(t => t.groupId === tile.groupId);
                    groupTiles.forEach(gt => { const el = this.tileElements.get(gt.id); if (el) el.style.opacity = '1'; });
                    const clone = document.getElementById('puzzle-drag-clone');
                    if (clone) clone.remove();
                    this.clearDragHighlight();
                    this._cachedBoardRect = null;
                    this.draggedTileId = null;
                }
                touchMoveStarted = false;
            }, { passive: true });

            boardChildren.appendChild(element);
        });

        this.board.appendChild(boardChildren);

        if (this._wheelHandler) { this.board.removeEventListener('wheel', this._wheelHandler); }
        this._wheelHandler = (e) => {
            const isDesktop = window.innerWidth >= 900;
            if (isDesktop && this.trayDiv) {
                const rect = this.board.getBoundingClientRect();
                const x = e.clientX - rect.left;
                if (x < 0) { this.trayDiv.scrollTop += e.deltaY; e.preventDefault(); }
            }
        };
        this.board.addEventListener('wheel', this._wheelHandler, { passive: false });

        this.board.onclick = (e) => {
            if (!this.isPlaying || this.isSolving || this.isHintActive || this.selectedIdx === null) return;
            if (!e.target.closest('.puzzle-tile')) {
                const targetPos = this.getPosFromCoords(e.clientX, e.clientY);
                if (targetPos !== -1) {
                    const rect = this.board.getBoundingClientRect();
                    const xPx = e.clientX - rect.left;
                    const yPx = e.clientY - rect.top;
                    const selTile = this.tiles.find(t => t.id === this.selectedIdx);
                    if (!selTile) return;
                    const tileData = this.getTileJigsawShape(selTile.correctRow, selTile.correctCol);
                    const F = 1.80;
                    const tileW_pct = tileData.tileW * 100 * F;
                    const tileH_pct = tileData.tileH * 100 * F;
                    const leftPct = (xPx / rect.width) * 100 - tileW_pct / 2;
                    const topPct = (yPx / rect.height) * 100 - tileH_pct / 2;
                    const isTrayTarget = targetPos >= (this.cols * this.rows);
                    this.placeGroupComplex(this.selectedIdx, leftPct, topPct, isTrayTarget, targetPos);
                    this.selectedIdx = null;
                }
            }
        };
        this.updateOverlaps();
    }

    // ============================================================
    // Все остальные методы (onTileClick, highlightTile, highlightGroup,
    // updateGroups, getCorrectTilePosition, flashGroupTiles,
    // isTileAtAbsoluteCorrectPosition, placeGroupComplex, getTrayGrid,
    // updateDragTargetHighlight, clearDragHighlight, _updatePosToTileMap,
    // getPosFromCoords, clampDragPointToBoard, clampBoardPercent,
    // clampTilePositionToBoard, swapTiles, compactTray, getTileEdgeInfo,
    // updateOverlaps, _updateOverlapsNow, toggleHint, stopHint,
    // startHintCooldown, changeDifficulty, updateStats, startTimer,
    // stopTimer, autoSolve, isPuzzleLayoutSolved, checkWin,
    // checkDragAutoScroll, destroy) — БЕЗ ИЗМЕНЕНИЙ
    // ============================================================
    onTileClick(tileId, e) {
        if (!this.isPlaying || this.isSolving || this.isHintActive) return;
        if (this._dragSuppressNextClick) { this._dragSuppressNextClick = false; return; }
        const tile = this.tileById.get(tileId) || null;
        const total = this.cols * this.rows;
        playSound('click');
        if (this.selectedIdx === null) {
            this.selectedIdx = tileId;
            this.highlightGroup(tileId, true);
        } else {
            const selTile = this.tileById.get(this.selectedIdx) || null;
            if (selTile && selTile.groupId === tile.groupId) {
                this.highlightGroup(this.selectedIdx, false);
                this.selectedIdx = null;
            } else {
                if (selTile.currentPos >= total && tile.currentPos >= total) {
                    const tempPos = selTile.currentPos;
                    selTile.currentPos = tile.currentPos;
                    tile.currentPos = tempPos;
                    this.tiles.forEach(t => { const el = this.tileElements.get(t.id); if (el) this.updateTileElementPosition(el, t); });
                    this.highlightGroup(this.selectedIdx, false);
                    this.selectedIdx = null;
                    return;
                }
                if (e && e.clientX && e.clientY && this.board) {
                    const rect = this.board.getBoundingClientRect();
                    const xPx = e.clientX - rect.left;
                    const yPx = e.clientY - rect.top;
                    const tileData = this.getTileJigsawShape(selTile.correctRow, selTile.correctCol);
                    const F = 1.80;
                    const tileW_pct = tileData.tileW * 100 * F;
                    const tileH_pct = tileData.tileH * 100 * F;
                    const leftPct = (xPx / rect.width) * 100 - tileW_pct / 2;
                    const topPct = (yPx / rect.height) * 100 - tileH_pct / 2;
                    this.placeGroupComplex(this.selectedIdx, leftPct, topPct, false, -1);
                } else {
                    this.placeGroupComplex(this.selectedIdx, tile.boardX, tile.boardY, false, -1);
                }
                this.selectedIdx = null;
            }
        }
    }

    highlightTile(tileId, select) {
        const el = this.tileElements.get(tileId);
        if (el) { if (select) el.classList.add('selected'); else el.classList.remove('selected'); }
    }

    highlightGroup(tileId, select) {
        const tile = this.getTileById(tileId);
        if (!tile) return;
        const groupTiles = this.getGroupTiles(tile.groupId);
        groupTiles.forEach(gt => { this.highlightTile(gt.id, select); });
    }

    updateGroups() {
        const total = this.cols * this.rows;
        
        // Сохраняем старые группы ДО сброса
        const oldGroups = new Map();
        this.tiles.forEach(t => { oldGroups.set(t.id, t.groupId); });
        
        this.groupTiles = new Map();
        const correctPositions = new Map();
        this.tiles.forEach(t => { correctPositions.set(t.id, this.getCorrectTilePosition(t)); });
        
        // Сбрасываем группы на индивидуальные id
        this.tiles.forEach(t => { t.groupId = t.id; });
        
        const parent = {};
        this.tiles.forEach(t => { parent[t.id] = t.id; });
        const find = (i) => { if (parent[i] === i) return i; parent[i] = find(parent[i]); return parent[i]; };
        const union = (i, j) => { const rootI = find(i); const rootJ = find(j); if (rootI !== rootJ) parent[rootI] = rootJ; };
        const checkAdjacent = (t1, t2) => {
            if (t1.currentPos >= total || t2.currentPos >= total) return false;
            const isCorrectAdjacent = (Math.abs(t1.correctRow - t2.correctRow) + Math.abs(t1.correctCol - t2.correctCol)) === 1;
            if (!isCorrectAdjacent) return false;
            const correctPos1 = correctPositions.get(t1.id);
            const correctPos2 = correctPositions.get(t2.id);
            const correctDiffX = correctPos2.x - correctPos1.x;
            const correctDiffY = correctPos2.y - correctPos1.y;
            const actualDiffX = t2.boardX - t1.boardX;
            const actualDiffY = t2.boardY - t1.boardY;
            const err = Math.hypot(actualDiffX - correctDiffX, actualDiffY - correctDiffY);
            return err < 10.0;
        };
        this.tiles.forEach((tile) => {
            const row = tile.correctRow;
            const col = tile.correctCol;
            const neighborCandidates = [];
            if (col + 1 < this.cols) neighborCandidates.push(this.tileById.get(row * this.cols + (col + 1)));
            if (col - 1 >= 0) neighborCandidates.push(this.tileById.get(row * this.cols + (col - 1)));
            if (row + 1 < this.rows) neighborCandidates.push(this.tileById.get((row + 1) * this.cols + col));
            if (row - 1 >= 0) neighborCandidates.push(this.tileById.get((row - 1) * this.cols + col));
            neighborCandidates.forEach((neighbor) => {
                if (!neighbor) return;
                if (checkAdjacent(tile, neighbor)) union(tile.id, neighbor.id);
            });
        });
        this.tiles.forEach(t => { t.groupId = find(t.id); });
        this.groupTiles = new Map();
        this.tiles.forEach(t => {
            const groupId = t.groupId;
            if (!this.groupTiles.has(groupId)) this.groupTiles.set(groupId, []);
            this.groupTiles.get(groupId).push(t);
        });
        
        // Определяем пазлы которые были склеены (группа изменилась)
        const newlyConnectedTiles = [];
        this.tiles.forEach(t => {
            const oldGroupId = oldGroups.get(t.id);
            const newGroupId = t.groupId;
            if (oldGroupId !== newGroupId) {
                newlyConnectedTiles.push(t);
            }
        });
        
        // Подсвечиваем все пазлы в новых группах с более чем 1 элементом
        if (newlyConnectedTiles.length > 0) {
            const groupsToFlash = new Set();
            newlyConnectedTiles.forEach(t => groupsToFlash.add(t.groupId));
            
            groupsToFlash.forEach(groupId => {
                const groupTiles = this.groupTiles.get(groupId) || [];
                if (groupTiles.length > 1) {
                    this.flashGroupTiles(groupTiles);
                }
            });
        }
    }

    getCorrectTilePosition(tile) {
        const cacheKey = `${tile.correctRow}:${tile.correctCol}`;
        if (this.correctTilePositionCache.has(cacheKey)) return this.correctTilePositionCache.get(cacheKey);
        const r = tile.correctRow;
        const c = tile.correctCol;
        const tileData = this.getTileJigsawShape(r, c);
        const P = tileData.P;
        const slotJunction = this.getJunction(r, c);
        const correctLeftPct = (slotJunction.x - P * tileData.tileW - (tileData.tl.x - tileData.xMin)) * 100;
        const correctTopPct = (slotJunction.y - P * tileData.tileH - (tileData.tl.y - tileData.yMin)) * 100;
        const result = { x: correctLeftPct, y: correctTopPct };
        this.correctTilePositionCache.set(cacheKey, result);
        return result;
    }

    flashGroupTiles(groupTiles, timeout = 800) {
        groupTiles.forEach(gt => {
            const el = this.tileElements.get(gt.id);
            if (el) { 
                el.classList.add('flash-green'); 
                setTimeout(() => el.classList.remove('flash-green'), timeout); 
            }
        });
    }

    isTileAtAbsoluteCorrectPosition(tile) {
        const correctPos = this.getCorrectTilePosition(tile);
        const dist = Math.hypot(correctPos.x - tile.boardX, correctPos.y - tile.boardY);
        return dist < 5.0;
    }

    placeGroupComplex(srcTileId, targetLeftPct, targetTopPct, isTrayTarget, targetTrayPos) {
        const srcTile = this.tileById.get(srcTileId) || null;
        if (!srcTile || !this.isPlaying || this.isSolving || this.hasWon) return;
        const boundedLeftPct = targetLeftPct;
        const boundedTopPct = targetTopPct;
        const total = this.cols * this.rows;
        const groupTiles = this.groupTiles.get(srcTile.groupId) || [];
        const dirtyTileIds = new Set();

        if (isTrayTarget) {
            groupTiles.forEach(gt => {
                if (gt.id === gt.currentPos) return;
                const posInTray = total + this._trayTileCount;
                gt.currentPos = posInTray;
                this._trayTileCount++;
                dirtyTileIds.add(gt.id);
                const el = this.tileElements.get(gt.id);
                if (el) {
                    el.classList.add('folding-to-tray');
                    this.updateTileElementPosition(el, gt);
                    el.classList.remove('selected');
                    setTimeout(() => el.classList.remove('folding-to-tray'), 600);
                }
            });
            playSound('fold');
            this.compactTray();
            if (this._trayGridDirty) this.updateBoardSize();
            this.checkWin();
            this.updateOverlaps();
            this.updateGroups();
            return;
        }

        let dx = 0, dy = 0;
        const wasInTray = srcTile.currentPos >= total;
        if (!wasInTray) { dx = boundedLeftPct - srcTile.boardX; dy = boundedTopPct - srcTile.boardY; }
        else { srcTile.boardX = boundedLeftPct; srcTile.boardY = boundedTopPct; }

        groupTiles.forEach(gt => {
            if (gt.id === gt.currentPos) return;
            if (!wasInTray) { gt.boardX += dx; gt.boardY += dy; }
            else {
                const correctSrc = this.getCorrectTilePosition(srcTile);
                const correctGt = this.getCorrectTilePosition(gt);
                gt.boardX = srcTile.boardX + (correctGt.x - correctSrc.x);
                gt.boardY = srcTile.boardY + (correctGt.y - correctSrc.y);
            }
            gt.currentPos = -2;
            dirtyTileIds.add(gt.id);
        });

        let snapped = false;
        const RELATIVE_MATCH_THRESHOLD = 30.0;
        let minRelDist = Infinity;
        let snapToTileDelta = { x: 0, y: 0 };
        for (const gt of groupTiles) {
            const correctGt = this.getCorrectTilePosition(gt);
            for (const oTile of this.tiles) {
                if (oTile.currentPos >= total || groupTiles.some(g => g.id === oTile.id)) continue;
                if (Math.abs(oTile.correctRow - gt.correctRow) + Math.abs(oTile.correctCol - gt.correctCol) !== 1) continue;
                const correctOTile = this.getCorrectTilePosition(oTile);
                const correctDiffX = correctOTile.x - correctGt.x;
                const correctDiffY = correctOTile.y - correctGt.y;
                const actualDiffX = oTile.boardX - gt.boardX;
                const actualDiffY = oTile.boardY - gt.boardY;
                const errX = actualDiffX - correctDiffX;
                const errY = actualDiffY - correctDiffY;
                const errDist = Math.hypot(errX, errY);
                if (errDist < minRelDist) { minRelDist = errDist; snapToTileDelta = { x: errX, y: errY }; }
            }
        }

        const shouldFlash = minRelDist < RELATIVE_MATCH_THRESHOLD;
        if (shouldFlash) {
            groupTiles.forEach(gt => { gt.boardX += snapToTileDelta.x; gt.boardY += snapToTileDelta.y; dirtyTileIds.add(gt.id); });
            const connectedGroups = new Map();
            const placedGroupId = groupTiles[0].groupId;
            connectedGroups.set(placedGroupId, { tiles: groupTiles });
            for (const gt of groupTiles) {
                for (const oTile of this.tiles) {
                    if (oTile.currentPos >= total || groupTiles.some(g => g.id === oTile.id)) continue;
                    const shouldAdjacent = Math.abs(oTile.correctRow - gt.correctRow) + Math.abs(oTile.correctCol - gt.correctCol) === 1;
                    if (!shouldAdjacent) continue;
                    const actualDist = Math.hypot(oTile.boardX - gt.boardX, oTile.boardY - gt.boardY);
                    if (actualDist > 30.0) continue;
                    const oGroupId = oTile.groupId;
                    if (!connectedGroups.has(oGroupId)) connectedGroups.set(oGroupId, { tiles: this.tiles.filter(t => t.groupId === oGroupId) });
                }
            }
            const anchorGroupId = placedGroupId;
            const anchorGroup = connectedGroups.get(anchorGroupId);
            for (const [groupId, groupData] of connectedGroups) {
                if (groupId === anchorGroupId) continue;
                let totalShiftX = 0, totalShiftY = 0, matchCount = 0;
                for (const ct of groupData.tiles) {
                    for (const at of anchorGroup.tiles) {
                        const shouldAdjacent = Math.abs(ct.correctRow - at.correctRow) + Math.abs(ct.correctCol - at.correctCol) === 1;
                        if (!shouldAdjacent) continue;
                        const correctCt = this.getCorrectTilePosition(ct);
                        const correctAt = this.getCorrectTilePosition(at);
                        const idealDiffX = correctCt.x - correctAt.x;
                        const idealDiffY = correctCt.y - correctAt.y;
                        const idealCtX = at.boardX + idealDiffX;
                        const idealCtY = at.boardY + idealDiffY;
                        totalShiftX += idealCtX - ct.boardX;
                        totalShiftY += idealCtY - ct.boardY;
                        matchCount++;
                    }
                }
                if (matchCount > 0) {
                    const avgShiftX = totalShiftX / matchCount;
                    const avgShiftY = totalShiftY / matchCount;
                    groupData.tiles.forEach(t => { t.boardX += avgShiftX; t.boardY += avgShiftY; dirtyTileIds.add(t.id); });
                }
            }
            this.flashGroupTiles(groupTiles);
            playSound('correct');
            snapped = true;
        }
        if (!snapped) playSound('swap');

        this.updateGroups();
        dirtyTileIds.forEach(tileId => {
            const tile = this.tileById.get(tileId);
            if (tile) {
                const el = this.tileElements.get(tileId);
                if (el) { this.updateTileElementPosition(el, tile); el.classList.remove('selected'); }
            }
        });
        this._updatePosToTileMap();
        if (!(wasInTray && isTrayTarget)) { this.moves++; this.updateStats(); }
        this.compactTray();
        if (this._trayGridDirty) this.updateBoardSize();
        this.checkWin();
        this.updateOverlaps();
    }

    getTrayGrid() {
        if (this._cachedTrayGrid && !this._trayGridDirty) return this._cachedTrayGrid;
        const colW = 100 / this.cols;
        const F = 1.80;
        const isDesktop = window.innerWidth >= 900;
        const totalTiles = this.cols * this.rows;
        const trayCount = this._trayTileCount || 0;
        let trayWidthPct = 100;
        let trayCols;
        const desiredTrayCellW = colW * 1.4;
        if (isDesktop) {
            const screenWidth = window.innerWidth;
            if (screenWidth >= 1400) trayWidthPct = 130;
            else if (screenWidth >= 1200) trayWidthPct = 120;
            else if (screenWidth >= 1000) trayWidthPct = 110;
            else trayWidthPct = 100;
            const minCellW = 8;
            const maxTrayCols = Math.max(2, Math.floor(trayWidthPct / minCellW));
            if (trayCount > 0) trayCols = Math.max(2, Math.min(maxTrayCols, Math.ceil(Math.sqrt(trayCount))));
            else trayCols = Math.min(maxTrayCols, 4);
        } else {
            trayWidthPct = 100;
            const maxTrayCols = Math.max(2, Math.floor(95 / desiredTrayCellW));
            if (trayCount > 0) trayCols = Math.max(2, Math.min(maxTrayCols, Math.ceil(Math.sqrt(trayCount))));
            else trayCols = maxTrayCols;
        }
        if (this.trayColsUser !== null && this.trayColsUser >= 2) {
            const minCellW = isDesktop ? 8 : 6;
            const maxAllowed = Math.max(2, Math.floor(trayWidthPct / minCellW));
            trayCols = Math.min(this.trayColsUser, maxAllowed);
        }
        const trayCellW = trayWidthPct / trayCols;
        const boardHToW = this._boardHToW || 1;
        const avgTileHToW = boardHToW * (this.cols / this.rows);
        const trayCellH = trayCellW * avgTileHToW;
        let scaleFactor = 1.1;
        if (trayCount > 0) {
            const baseCapacity = trayCols * 4;
            if (trayCount > baseCapacity) {
                const maxDim = Math.max(this.cols, this.rows);
                const reductionRate = maxDim >= 7 ? 0.01 : 0.015;
                const minScale = maxDim >= 7 ? 0.85 : 0.7;
                scaleFactor = Math.max(minScale, 1.1 - (trayCount - baseCapacity) * reductionRate);
            }
        }
        if (this.trayColsUser !== null) {
            const autoCols = isDesktop
                ? Math.max(2, Math.min(Math.floor(trayWidthPct / 8), Math.ceil(Math.sqrt(Math.max(1, trayCount)))))
                : Math.max(2, Math.min(Math.floor(95 / Math.max(6, desiredTrayCellW)), Math.ceil(Math.sqrt(Math.max(1, trayCount)))));
            const ratio = autoCols / trayCols;
            scaleFactor = Math.min(1.3, Math.max(0.6, scaleFactor * Math.sqrt(ratio)));
        }
        this._cachedTrayGrid = { trayCellW, trayCellH, trayCols, scaleFactor, F, isDesktop, trayWidthPct };
        this._trayGridDirty = false;
        return this._cachedTrayGrid;
    }

    updateDragTargetHighlight(pos) {
        if (pos === this.lastDragTarget) return;
        this.clearDragHighlight();
        this.lastDragTarget = pos;
        const targetTile = this._posToTileMap.get(pos);
        if (targetTile && targetTile.id !== this.draggedTileId) {
            const el = this.tileElements.get(targetTile.id);
            if (el) el.classList.add('drag-target');
        }
    }

    clearDragHighlight() {
        this._cachedBoardRect = null;
        this._cachedTrayRect = null;
        if (this.lastDragTarget !== null) {
            const targetTile = this._posToTileMap.get(this.lastDragTarget);
            if (targetTile) { const el = this.tileElements.get(targetTile.id); if (el) el.classList.remove('drag-target'); }
            this.lastDragTarget = null;
        }
    }

    _updatePosToTileMap() {
        this._posToTileMap.clear();
        this.tiles.forEach(tile => { this._posToTileMap.set(tile.currentPos, tile); });
    }

    getPosFromCoords(clientX, clientY) {
        let rect = this._cachedBoardRect;
        if (!rect && this.board) {
            rect = this.board.getBoundingClientRect();
            this._cachedBoardRect = rect;
        }
        if (!rect) return -1;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const xPct = (x / rect.width) * 100;
        const yPct = (y / rect.height) * 100;
        const clampedX = this.clampBoardPercent(xPct);
        const clampedY = this.clampBoardPercent(yPct);
        let targetPos = -1;
        const { trayCellW, trayCols, isDesktop, trayWidthPct } = this.getTrayGrid();
        
        let trayRect = this._cachedTrayRect;
        if (!trayRect && this.trayDiv) {
            trayRect = this.trayDiv.getBoundingClientRect();
            this._cachedTrayRect = trayRect;
        }

        if (isDesktop && clampedX < -4 && clampedX >= -(trayWidthPct + 8)) {
            if (trayRect) {
                const trayScrollY = this.trayDiv ? this.trayDiv.scrollTop : 0;
                const trayXPx = clientX - trayRect.left;
                const trayYPx = clientY - trayRect.top + trayScrollY;
                
                const cellWidthPx = trayRect.width / trayCols;
                const gapBetween = 4;
                const tileWidthPx = Math.max(20, cellWidthPx - gapBetween);
                const boardHToW = this._boardHToW || 1;
                const avgTileHToW = boardHToW * (this.cols / this.rows);
                const trayRowHeightPx = tileWidthPx * avgTileHToW;
                
                const c = Math.floor(trayXPx / cellWidthPx);
                const r = Math.floor(trayYPx / (trayRowHeightPx + gapBetween));
                
                if (c >= 0 && c < trayCols && r >= 0) {
                    const total = this.cols * this.rows;
                    const pos = r * trayCols + c;
                    if (pos >= 0 && pos < total) targetPos = total + pos;
                }
            }
        } else if (!isDesktop && this.trayDiv && trayRect && clientY >= trayRect.top - 20) {
            const trayScrollY = this.trayDiv ? this.trayDiv.scrollTop : 0;
            const trayXPx = clientX - trayRect.left;
            const trayYPx = clientY - trayRect.top + trayScrollY;
            
            const cellWidthPx = trayRect.width / trayCols;
            const gapBetween = 4;
            const tileWidthPx = Math.max(20, cellWidthPx - gapBetween);
            const boardHToW = this._boardHToW || 1;
            const avgTileHToW = boardHToW * (this.cols / this.rows);
            const trayRowHeightPx = tileWidthPx * avgTileHToW;
            
            const c = Math.floor(trayXPx / cellWidthPx);
            const r = Math.floor(trayYPx / (trayRowHeightPx + gapBetween));
            
            if (c >= 0 && c < trayCols && r >= 0) {
                const total = this.cols * this.rows;
                const pos = r * trayCols + c;
                if (pos >= 0 && pos < total) targetPos = total + pos;
            }
        } else if (clampedY >= -10 && clampedY <= 110 && clampedX >= -10 && clampedX <= 110) {
            const normX = clampedX / 100;
            const normY = clampedY / 100;
            const c = Math.min(this.cols - 1, Math.max(0, Math.floor(normX * this.cols)));
            const r = Math.min(this.rows - 1, Math.max(0, Math.floor(normY * this.rows)));
            targetPos = r * this.cols + c;
        }
        return targetPos;
    }

    handleAutoScroll(clientY) {
        const boardRect = this.boardContainer ? this.boardContainer.getBoundingClientRect() : (this.board ? this.board.getBoundingClientRect() : null);
        if (!boardRect) return;

        const isDesktop = window.innerWidth >= 900;
        let scrollContainer = this.card || this.overlay;
        if (isDesktop && this.card) {
             const rightPanel = this.card.querySelector('.puzzle-right-panel');
             if (rightPanel) scrollContainer = rightPanel;
        }
        if (!scrollContainer) return;

        const trayRect = this.trayDiv ? this.trayDiv.getBoundingClientRect() : null;

        const threshold = 60; // Увеличенная зона активации (60px) для легкого удержания
        const maxSpeed = 20; // Увеличенная скорость автопрокрутки (было 10)
        let speed = 0;

        // Находим видимые на экране границы игрового поля/лотка
        const visibleBoardTop = Math.max(boardRect.top, 0);

        // Проверяем, находится ли палец в лотке
        const inTray = trayRect && (clientY >= trayRect.top - 10);

        // Границы всего игрового интерфейса (включая лоток на мобильных)
        let bottomEdge = boardRect.bottom;
        if (trayRect && !isDesktop) {
            bottomEdge = trayRect.bottom;
        }

        if (!inTray) {
            // Активируем скролл вверх у самого верха экрана
            if (clientY >= 0 && clientY <= threshold) {
                if (boardRect.top < 5 && scrollContainer.scrollTop > 2) {
                    const ratio = (threshold - clientY) / threshold;
                    speed = -maxSpeed * Math.pow(Math.max(0, Math.min(1, ratio)), 1.5);
                }
            } 
            // Активируем скролл вниз у самого низа экрана
            else if (clientY >= window.innerHeight - threshold && clientY <= window.innerHeight) {
                if (!this._dragStartedInTray && bottomEdge > window.innerHeight + 5) {
                    const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
                    if (scrollContainer.scrollTop < maxScroll - 2) {
                        const ratio = (threshold - (window.innerHeight - clientY)) / threshold;
                        speed = maxSpeed * Math.pow(Math.max(0, Math.min(1, ratio)), 1.5);
                    }
                }
            }
        }

        this._currentScrollSpeed = speed;

        if (Math.abs(speed) > 0.1) {
            if (!this.autoScrollInterval) {
                this.autoScrollInterval = setInterval(() => {
                    const isDesktop = window.innerWidth >= 900;
                    let activeScrollContainer = this.card || this.overlay;
                    if (isDesktop && this.card) {
                         const rightPanel = this.card.querySelector('.puzzle-right-panel');
                         if (rightPanel) activeScrollContainer = rightPanel;
                    }
                    if (activeScrollContainer && this._currentScrollSpeed) {
                        const rect = this.boardContainer ? this.boardContainer.getBoundingClientRect() : (this.board ? this.board.getBoundingClientRect() : null);
                        // Прекращаем скроллить вверх сразу же, как только показалась верхняя часть игрового поля
                        if (this._currentScrollSpeed < 0) {
                            if (rect && rect.top >= 5) {
                                this.stopAutoScroll();
                                return;
                            }
                        }
                        // Прекращаем скроллить вниз сразу же, как только показалась нижняя часть игрового поля/лотка
                        if (this._currentScrollSpeed > 0) {
                            const isDesktop = window.innerWidth >= 900;
                            const trayRect = this.trayDiv ? this.trayDiv.getBoundingClientRect() : null;
                            let bottomEdge = rect ? rect.bottom : 0;
                            if (rect && trayRect && !isDesktop) {
                                bottomEdge = trayRect.bottom;
                            }
                            if (rect && bottomEdge <= window.innerHeight + 5) {
                                this.stopAutoScroll();
                                return;
                            }
                        }
                        activeScrollContainer.scrollBy(0, this._currentScrollSpeed);
                    }
                }, 16);
            }
        } else {
            this.stopAutoScroll();
        }
    }

    stopAutoScroll() {
        if (this.autoScrollInterval) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = null;
        }
        this._currentScrollSpeed = 0;
    }

    clampDragPointToBoard(clientX, clientY) {
        let rect = this._cachedBoardRect;
        if (!rect && this.board) {
            rect = this.board.getBoundingClientRect();
            this._cachedBoardRect = rect;
        }
        if (!rect) return { x: clientX, y: clientY };
        return { x: Math.min(Math.max(clientX, rect.left), rect.right), y: Math.min(Math.max(clientY, rect.top), rect.bottom) };
    }

    clampBoardPercent(value) { return Math.min(110, Math.max(-10, value)); }

    clampTilePositionToBoard(leftPct, topPct, tile) {
        const tileData = this.getTileJigsawShape(tile.correctRow, tile.correctCol);
        const widthPct = tileData.tileW * 100 * 1.8;
        const heightPct = tileData.tileH * 100 * 1.8;
        const padding = 8;
        const maxLeft = Math.max(0, 100 - widthPct + padding);
        const maxTop = Math.max(0, 100 - heightPct + padding);
        return { leftPct: Math.min(Math.max(leftPct, -padding), maxLeft), topPct: Math.min(Math.max(topPct, -padding), maxTop) };
    }

    // ============================================================
    // // ИЗМЕНЕНО: updateTileElementPosition — убраны transition
    // на left/top, FLIP-анимация работает только через transform
    // ============================================================
    updateTileElementPosition(element, tile, skipAnimation = false) {
        const P = 0.40;
        const F = 1.80;
        const total = this.cols * this.rows;
        const isTray = tile.currentPos >= total;
        const boardRect = this._layoutBoardRect || (this.board ? this.board.getBoundingClientRect() : { width: 0, height: 0 });
        if (this.board && !this._layoutBoardRect) this._layoutBoardRect = boardRect;

        const beforeConnected = element.isConnected;
        const canAnimate = !skipAnimation && !this._suppressLayoutReads && !this.lowPowerMode && !this.reducedMotion && !this.puzzlePerfMode;
        let beforeRect = null;
        if (beforeConnected && canAnimate) beforeRect = element.getBoundingClientRect();

        const oldTransition = element.style.transition;
        element.style.transition = 'none';

        if (isTray) {
            if (this.trayDiv && element.parentElement !== this.trayDiv) this.trayDiv.appendChild(element);
            const pos = tile.currentPos - total;
            const grid = this.getTrayGrid();
            const trayCols = grid.trayCols;
            const r = Math.floor(pos / trayCols);
            const c = pos % trayCols;
            let trayWidth, trayHeight;
            if (this._layoutTrayRect) { trayWidth = this._layoutTrayRect.width; trayHeight = this._layoutTrayRect.height; }
            else if (this.trayDiv) { const rect = this.trayDiv.getBoundingClientRect(); trayWidth = rect.width; trayHeight = rect.height; this._layoutTrayRect = rect; }
            else { trayWidth = boardRect.width; trayHeight = boardRect.height; }
            const gapBetween = 4;
            const cellWidthPx = trayWidth / trayCols;
            const tileWidthPx = Math.max(20, cellWidthPx - gapBetween);
            const boardHToW = (boardRect.width > 0 && boardRect.height > 0) ? boardRect.height / boardRect.width : (this._boardHToW || 1);
            const avgTileHToW = boardHToW * (this.cols / this.rows);
            const trayRowHeightPx = tileWidthPx * avgTileHToW;
            const tileData = this.getTileJigsawShape(tile.correctRow, tile.correctCol);
            const exactTileHToW = (boardRect.height > 0 && boardRect.width > 0) ? (boardRect.height * tileData.tileH) / (boardRect.width * tileData.tileW) : avgTileHToW;
            const exactTileHeightPx = tileWidthPx * exactTileHToW;
            
            const leftPx = c * cellWidthPx + (cellWidthPx - tileWidthPx) / 2;
            const topPx = r * (trayRowHeightPx + gapBetween) + gapBetween / 2 + Math.max(0, (trayRowHeightPx - exactTileHeightPx) / 2);
            
            element.style.left = `${leftPx.toFixed(1)}px`;
            element.style.top = `${topPx.toFixed(1)}px`;
            element.style.width = `${tileWidthPx.toFixed(1)}px`;
            element.style.height = `${exactTileHeightPx.toFixed(1)}px`;
            element.style.transform = 'scale(1)';
            element.style.transformOrigin = '0 0';
            element.style.zIndex = '1';
        } else {
            if (element.parentElement !== this.board) this.board.appendChild(element);
            const leftPx = (tile.boardX / 100) * (boardRect.width || 1);
            const topPx = (tile.boardY / 100) * (boardRect.height || 1);
            const tileData = this.getTileJigsawShape(tile.correctRow, tile.correctCol);
            const widthPx = (boardRect.width || 1) * tileData.tileW * F;
            const heightPx = (boardRect.height || 1) * tileData.tileH * F;
            element.style.width = `${widthPx.toFixed(1)}px`;
            element.style.height = `${heightPx.toFixed(1)}px`;
            element.style.left = `${leftPx.toFixed(1)}px`;
            element.style.top = `${topPx.toFixed(1)}px`;
            element.style.transform = 'scale(1)';
            element.style.transformOrigin = '0 0';
            element.style.zIndex = tile.currentPos === tile.id ? '2' : '3';
        }

        // // ИЗМЕНЕНО: FLIP-анимация через element.animate() с transform
        if (beforeConnected && canAnimate) {
            const afterRect = element.getBoundingClientRect();
            if (Math.abs(beforeRect.left - afterRect.left) > 1 || Math.abs(beforeRect.top - afterRect.top) > 1 || Math.abs(beforeRect.width - afterRect.width) > 1) {
                const deltaX = beforeRect.left - afterRect.left;
                const deltaY = beforeRect.top - afterRect.top;
                const scaleX = beforeRect.width / (afterRect.width || 1);
                const scaleY = beforeRect.height / (afterRect.height || 1);
                element.animate([
                    { transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})` },
                    { transform: 'translate(0px, 0px) scale(1, 1)' }
                ], {
                    duration: 600,
                    // // ИЗМЕНЕНО: Spring easing
                    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                });
            }
        }

        requestAnimationFrame(() => { element.style.transition = oldTransition || ''; });
    }

    swapTiles(id1, id2, skipStats = false) {
        this._trayGridDirty = true;
        const t1 = this.tileById.get(id1) || null;
        const t2 = this.tileById.get(id2) || null;
        if (!t1 || !t2) return;
        if (!skipStats && (t1.id === t1.currentPos || t2.id === t2.currentPos)) return;
        const temp = t1.currentPos;
        t1.currentPos = t2.currentPos;
        t2.currentPos = temp;
        const el1 = this.tileElements.get(id1);
        const el2 = this.tileElements.get(id2);
        if (el1) { this.updateTileElementPosition(el1, t1); el1.classList.remove('selected'); }
        if (el2) { this.updateTileElementPosition(el2, t2); el2.classList.remove('selected'); }
        playSound('swap');
        if (!skipStats) { this.moves++; this.updateStats(); this.compactTray(); this.updateBoardSize(); this.checkWin(); this.updateOverlaps(); }
        this.updateGroups();
    }

    compactTray() {
        this._trayGridDirty = true;
        const total = this.cols * this.rows;
        const trayTiles = this.tiles.filter(t => t.currentPos >= total);
        trayTiles.sort((a, b) => a.currentPos - b.currentPos);
        trayTiles.forEach((tile, index) => { tile.currentPos = total + index; });
        this._trayTileCount = trayTiles.length;
    }

    getTileEdgeInfo(tile) {
        const trueRow = Math.floor(tile.id / this.cols);
        const trueCol = tile.id % this.cols;
        let extendsRight = false, hasHoleRight = false;
        if (trueCol < this.cols - 1) { const seam = this.vertSeams[trueRow] && this.vertSeams[trueRow][trueCol]; if (seam) { extendsRight = (seam.dir === -1); hasHoleRight = (seam.dir === 1); } }
        let extendsLeft = false, hasHoleLeft = false;
        if (trueCol > 0) { const seam = this.vertSeams[trueRow] && this.vertSeams[trueRow][trueCol - 1]; if (seam) { extendsLeft = (seam.dir === 1); hasHoleLeft = (seam.dir === -1); } }
        let extendsDown = false, hasHoleBottom = false;
        if (trueRow < this.rows - 1) { const seam = this.horizSeams[trueRow] && this.horizSeams[trueRow][trueCol]; if (seam) { extendsDown = (seam.dir === 1); hasHoleBottom = (seam.dir === -1); } }
        let extendsUp = false, hasHoleTop = false;
        if (trueRow > 0) { const seam = this.horizSeams[trueRow - 1] && this.horizSeams[trueRow - 1][trueCol]; if (seam) { extendsUp = (seam.dir === -1); hasHoleTop = (seam.dir === 1); } }
        return { trueRow, trueCol, extendsRight, hasHoleRight, extendsLeft, hasHoleLeft, extendsDown, hasHoleBottom, extendsUp, hasHoleTop };
    }

    updateOverlaps() {
        if (!this.board) return;
        if (this._overlapFrame) return;
        this._overlapFrame = requestAnimationFrame(() => { this._overlapFrame = null; this._updateOverlapsNow(); });
    }

    _updateOverlapsNow() {
        const total = this.cols * this.rows;
        this.tiles.forEach(tile => { const el = this.tileElements.get(tile.id); if (el) el.classList.remove('flash-red'); });
        if (!this.isPlaying || this.isSolving) return;
        const overlappingTileIds = new Set();
        const posToTile = new Map();
        this.tiles.forEach(tile => { if (tile.currentPos < total) posToTile.set(tile.currentPos, tile); });
        posToTile.forEach((tileA, posA) => {
            const rA = Math.floor(posA / this.cols);
            const cA = posA % this.cols;
            const infoA = this.getTileEdgeInfo(tileA);
            if (cA < this.cols - 1) {
                const posRight = posA + 1;
                const tileB = posToTile.get(posRight);
                if (tileB) {
                    const infoB = this.getTileEdgeInfo(tileB);
                    const isCorrectPair = (infoA.trueRow === infoB.trueRow && infoB.trueCol === infoA.trueCol + 1);
                    let overlap = false;
                    if (infoA.extendsRight) {
                        if (!infoB.hasHoleLeft) overlap = true;
                        else if (!isCorrectPair) {
                            const seamA = this.vertSeams[infoA.trueRow]?.[infoA.trueCol];
                            const seamB = this.vertSeams[infoB.trueRow]?.[infoB.trueCol - 1];
                            if (!seamA || !seamB || Math.abs(seamA.tabPos - seamB.tabPos) > 0.02 || Math.abs(seamA.tabSize - seamB.tabSize) > 0.02 || Math.abs(seamA.tabWidth - seamB.tabWidth) > 0.02) overlap = true;
                        }
                    }
                    if (infoB.extendsLeft) {
                        if (!infoA.hasHoleRight) overlap = true;
                        else if (!isCorrectPair) {
                            const seamA = this.vertSeams[infoA.trueRow]?.[infoA.trueCol];
                            const seamB = this.vertSeams[infoB.trueRow]?.[infoB.trueCol - 1];
                            if (!seamA || !seamB || Math.abs(seamA.tabPos - seamB.tabPos) > 0.02 || Math.abs(seamA.tabSize - seamB.tabSize) > 0.02 || Math.abs(seamA.tabWidth - seamB.tabWidth) > 0.02) overlap = true;
                        }
                    }
                    if (overlap) { overlappingTileIds.add(tileA.id); overlappingTileIds.add(tileB.id); }
                }
            }
            if (rA < this.rows - 1) {
                const posBottom = posA + this.cols;
                const tileB = posToTile.get(posBottom);
                if (tileB) {
                    const infoB = this.getTileEdgeInfo(tileB);
                    const isCorrectPair = (infoA.trueCol === infoB.trueCol && infoB.trueRow === infoA.trueRow + 1);
                    let overlap = false;
                    if (infoA.extendsDown) {
                        if (!infoB.hasHoleTop) overlap = true;
                        else if (!isCorrectPair) {
                            const seamA = this.horizSeams[infoA.trueRow]?.[infoA.trueCol];
                            const seamB = this.horizSeams[infoB.trueRow - 1]?.[infoB.trueCol];
                            if (!seamA || !seamB || Math.abs(seamA.tabPos - seamB.tabPos) > 0.02 || Math.abs(seamA.tabSize - seamB.tabSize) > 0.02 || Math.abs(seamA.tabWidth - seamB.tabWidth) > 0.02) overlap = true;
                        }
                    }
                    if (infoB.extendsUp) {
                        if (!infoA.hasHoleBottom) overlap = true;
                        else if (!isCorrectPair) {
                            const seamA = this.horizSeams[infoA.trueRow]?.[infoA.trueCol];
                            const seamB = this.horizSeams[infoB.trueRow - 1]?.[infoB.trueCol];
                            if (!seamA || !seamB || Math.abs(seamA.tabPos - seamB.tabPos) > 0.02 || Math.abs(seamA.tabSize - seamB.tabSize) > 0.02 || Math.abs(seamA.tabWidth - seamB.tabWidth) > 0.02) overlap = true;
                        }
                    }
                    if (overlap) { overlappingTileIds.add(tileA.id); overlappingTileIds.add(tileB.id); }
                }
            }
        });
        const hasNewOverlaps = overlappingTileIds.size > 0;
        overlappingTileIds.forEach(tileId => { const el = this.tileElements.get(tileId); if (el) el.classList.add('flash-red'); });
        if (hasNewOverlaps && !this.wasOverlappingLastCheck) playSound('wrong');
        this.wasOverlappingLastCheck = hasNewOverlaps;
    }

    toggleHint() {
        if (!this.isPlaying || this.isSolving) return;
        if (this.isHintActive) { this.stopHint(); return; }
        this.isHintActive = true;
        if (this.selectedIdx !== null) { this.highlightTile(this.selectedIdx, false); this.selectedIdx = null; }
        if (this.hintOverlay) this.hintOverlay.classList.add('visible');
        if (this.boardContainer) this.boardContainer.classList.add('hint-active');
        const hintBtn = document.getElementById('puzzle-hint-btn');
        if (hintBtn) { 
            hintBtn.classList.add('active-toggle'); 
            hintBtn.disabled = false;
            hintBtn.innerHTML = `<span>${icon('eye', { size: 16 })}</span><span>Исходник</span>`; 
        }
    }

    stopHint() {
        if (this.hintCountInterval) { clearInterval(this.hintCountInterval); this.hintCountInterval = null; }
        if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
        this.isHintActive = false;
        if (this.hintOverlay) this.hintOverlay.classList.remove('visible');
        if (this.boardContainer) this.boardContainer.classList.remove('hint-active');
        const hintBtn = document.getElementById('puzzle-hint-btn');
        if (hintBtn) {
            hintBtn.classList.remove('active-toggle');
            hintBtn.disabled = false;
            hintBtn.innerHTML = `<span>${icon('eye', { size: 16 })}</span><span>Исходник</span>`;
        }
    }

    startHintCooldown() {
        this.hintCooldown = 0;
        const hintBtn = document.getElementById('puzzle-hint-btn');
        if (hintBtn && this.isPlaying && !this.isSolving) {
            hintBtn.disabled = false;
            hintBtn.classList.remove('active-toggle');
            hintBtn.innerHTML = `<span>${icon('eye', { size: 16 })}</span><span>Исходник</span>`;
        }
    }

    async changeDifficulty(newSize) {
        if (this.isSolving) return;
        this.targetPieces = newSize;
        this.updateGridDimensions();
        const card = this.overlay ? this.overlay.querySelector('.puzzle-card') : null;
        if (card) { if (Math.max(this.cols, this.rows) >= 6) card.classList.add('size-large'); else card.classList.remove('size-large'); }
        this.updateDifficultyUI();
        this.loadRecord();
        if (this.post) await this.loadPostAndStart(this.post, newSize, this.imgUrl || (this.post.sample_url || this.post.file_url || this.post.preview_url || ''));
        else this.initPuzzle();
    }

    updateStats() { if (this.movesLabel) this.movesLabel.textContent = this.moves; }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.seconds++;
            const m = Math.floor(this.seconds / 60).toString().padStart(2, '0');
            const s = (this.seconds % 60).toString().padStart(2, '0');
            if (this.timerLabel) this.timerLabel.textContent = `${m}:${s}`;
        }, 1000);
    }

    stopTimer() { if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; } }

    async autoSolve() {
        if (!this.isPlaying || this.isSolving) return;
        this.wasAutoSolved = true;
        this.isSolving = true;
        this.selectedIdx = null;
        this.updateOverlaps();
        this.tiles.forEach(t => this.highlightTile(t.id, false));
        if (this.hintBtn) this.hintBtn.disabled = true;
        if (this.solveBtn) this.solveBtn.disabled = true;
        const total = this.tiles.length;
        const stepDelay = Math.max(20, Math.min(90, Math.floor(1800 / total)));
        this._suppressLayoutReads = true;
        let movedCount = 0;
        for (let i = 0; i < total; i++) {
            const tile = this.tiles[i];
            if (tile && tile.currentPos !== i) {
                const correctPos = this.getCorrectTilePosition(tile);
                tile.boardX = correctPos.x;
                tile.boardY = correctPos.y;
                tile.currentPos = i;
                const el = this.tileElements.get(tile.id);
                if (el) { this.updateTileElementPosition(el, tile); el.classList.add('flash-green'); setTimeout(() => el.classList.remove('flash-green'), 600); }
                if (movedCount % 3 === 0) playSound('correct');
                movedCount++;
                if (movedCount % 3 === 0) { this.moves = movedCount; this.updateStats(); }
                await new Promise(resolve => setTimeout(resolve, stepDelay));
            }
        }
        this.moves = movedCount;
        this.updateStats();
        this._suppressLayoutReads = false;
        this._trayTileCount = 0;
        this.updateBoardSize();
        this.isSolving = false;
        this.updateOverlaps();
        this.updateGroups();
        this.checkWin();
    }

    isPuzzleLayoutSolved() {
        const total = this.cols * this.rows;
        if (!this.tiles.length) return false;
        const referenceTile = this.tiles[0];
        const referenceCorrectPos = this.getCorrectTilePosition(referenceTile);
        const maxDim = Math.max(this.cols, this.rows);
        const tolerance = maxDim >= 10 ? 3.4 : maxDim >= 6 ? 2.8 : 2.2;
        return this.tiles.every(tile => {
            if (tile.currentPos >= total) return false;
            const correctPos = this.getCorrectTilePosition(tile);
            const actualDeltaX = tile.boardX - referenceTile.boardX;
            const actualDeltaY = tile.boardY - referenceTile.boardY;
            const correctDeltaX = correctPos.x - referenceCorrectPos.x;
            const correctDeltaY = correctPos.y - referenceCorrectPos.y;
            const errX = actualDeltaX - correctDeltaX;
            const errY = actualDeltaY - correctDeltaY;
            return Math.hypot(errX, errY) < tolerance;
        });
    }

    checkWin() {
        if (!this.isPlaying || this.isSolving || this.hasWon) return;
        const won = this.isPuzzleLayoutSolved();
        if (won) { this.hasWon = true; this.onWin(); }
    }

    // ============================================================
    // // ИЗМЕНЕНО: onWin — убрана бесконечная пульсация заголовка
    // ============================================================
    onWin() {
        this.isPlaying = false;
        this.hasWon = true;
        if (this.board) {
            this.board.classList.add('won');
        }
        this.stopTimer();
        playSound('success');
        if (!this.wasAutoSolved) this.saveCompletedPuzzle();
        spawnConfetti(this.overlay);

        if (this.post && this.post.id) {
            try {
                let solved = JSON.parse(localStorage.getItem('r34_solved_puzzles') || '[]');
                if (!solved.includes(this.post.id)) {
                    solved.push(this.post.id);
                    localStorage.setItem('r34_solved_puzzles', JSON.stringify(solved));
                }
            } catch (e) { console.error('Error saving solved puzzle ID:', e); }
        }

        const m = Math.floor(this.seconds / 60);
        const s = this.seconds % 60;
        const timeText = m > 0 ? `${m} мин. ${s} сек.` : `${s} сек.`;

        let isNewRecord = false;
        if (!this.wasAutoSolved) {
            const postId = (this.post && this.post.id) ? `_post_${this.post.id}` : '';
            const key = `r34_puzzle_best${postId}_${this.cols}x${this.rows}`;
            try {
                const existing = localStorage.getItem(key);
                if (!existing) isNewRecord = true;
                else {
                    const data = JSON.parse(existing);
                    if (!data || this.seconds < data.seconds || (this.seconds === data.seconds && this.moves < data.moves)) isNewRecord = true;
                }
            } catch (e) { isNewRecord = true; }
            if (isNewRecord) {
                try {
                    localStorage.setItem(key, JSON.stringify({ seconds: this.seconds, moves: this.moves }));
                    this.loadRecord();
                } catch (e) { console.error('Error saving record to localStorage:', e); }
            }
        }

        const recordNote = isNewRecord ? `<br><span style="color:#fbbf24;font-weight:bold;font-size:0.85rem;">${icon('trophy', { size: 16 })} Новый Рекорд!</span>` : '';
        const autoSolvedNote = this.wasAutoSolved ? `<br><span style="color:#a78bfa;font-weight:bold;font-size:0.85rem;">${icon('bot', { size: 16 })} Использован автосбор</span>` : '';
        this.winText.innerHTML = `<div style="font-size:0.9rem;line-height:1.4;">Вы собрали пазл (${this.cols * this.rows} дет.) за <b>${timeText}</b>!${recordNote}${autoSolvedNote}</div>`;

        if (this.trayDiv) {
            this.trayDiv.style.display = 'block';
            this.trayDiv.style.borderColor = 'rgba(74,222,128,0.3)';
        }

        setTimeout(() => {
            this.winOverlay.classList.add('visible');
            this.updateBoardSize();
            if (this.trayDiv && window.innerWidth < 900) {
                this.trayDiv.scrollTop = 0;
                this.trayDiv.style.overflowY = 'hidden';
            }
        }, 300);
    }

    destroy() {
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) resultsDiv.style.display = 'grid';
        document.body.style.overflow = '';
        if (window.gallery && window.gallery.observer) {
            document.querySelectorAll('.media-container').forEach(container => { window.gallery.observer.observe(container); });
        }
        window.puzzleGameActive = false;
        if (this.trayDiv && window.innerWidth < 900) this.trayDiv.style.overflowY = 'auto';
        if (this._abortController) { this._abortController.abort(); this._abortController = null; }
        if (this._overlapFrame) { cancelAnimationFrame(this._overlapFrame); this._overlapFrame = null; }
        if (this._animationFrameId) { cancelAnimationFrame(this._animationFrameId); this._animationFrameId = null; }
        this.stopTimer();
        if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
        if (this.introHintTimer) { clearTimeout(this.introHintTimer); this.introHintTimer = null; }
        if (this.introAnimTimer) { clearTimeout(this.introAnimTimer); this.introAnimTimer = null; }
        if (this.introCutTimer) { clearTimeout(this.introCutTimer); this.introCutTimer = null; }
        if (this.hintCountInterval) { clearInterval(this.hintCountInterval); this.hintCountInterval = null; }
        if (this.hintCooldownTimer) { clearInterval(this.hintCooldownTimer); this.hintCooldownTimer = null; }
        if (this._wheelHandler && this.board) { this.board.removeEventListener('wheel', this._wheelHandler); this._wheelHandler = null; }
        if (this.displayUrl && this.displayUrl.startsWith('blob:')) { URL.revokeObjectURL(this.displayUrl); this.displayUrl = ''; }
        if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
        if (this._resizeHandler) { window.removeEventListener('resize', this._resizeHandler); this._resizeHandler = null; }
        if (this.overlay) { this.overlay.remove(); this.overlay = null; }
        if (!document.querySelector('#settings-modal.open, .puzzle-completed-modal, .puzzle-stats-modal')) {
            document.body.classList.remove('modal-open');
            document.documentElement.classList.remove('modal-open');
        }
        if (this.onClose) this.onClose();
    }
}