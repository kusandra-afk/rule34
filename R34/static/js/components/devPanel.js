/**
 * Служебная панель (DEV) — метрики ленты и сети прямо в странице.
 *
 * Зачем: DevTools есть не везде. На телефоне открыть их нельзя вообще, а
 * именно там «тормозит» и «видео не грузится» — то есть панель нужна ровно в
 * том окружении, где инструментов разработчика нет.
 *
 * Что показывает: FPS и просадки кадров, память/размер DOM, состояние ленты
 * (режим, карточки, отрисовано, видео, колонки, предзагрузка), сеть (сколько
 * запросов, сколько упало, среднее и последнее время), журнал ошибок и
 * самопроверку — 13 живых проверок страницы и API, каждая с пояснением.
 *
 * Где видно: только при включённом переключателе в настройках или по
 * Ctrl+Shift+D; прячется только в полноэкранном просмотре поста, в неактивной
 * вкладке ничего не считает. В мини-играх и лобби панель остаётся на экране —
 * она выше их оверлеев и мешает только до тех пор, пока её не оттащат.
 *
 * ПК: карточка в правом нижнем углу, перетаскивается за заголовок, место
 * запоминается. Телефон: нижний лист на всю ширину (по умолчанию свёрнут в
 * круглый значок DEV, чтобы не закрывать ленту), тащится пальцем за заголовок,
 * место тоже запоминается.
 */

import { t as i18n } from '../i18n/i18n.js';

const ENABLED_KEY = 'r34_dev_mode';
const POS_KEY = 'r34_dev_pos';
const COLLAPSED_KEY = 'r34_dev_collapsed';

const tr = (text) => {
    try {
        return typeof i18n === 'function' ? i18n(text) : text;
    } catch (e) {
        return text;
    }
};

const readFlag = (key, fallback = false) => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw === 'true';
    } catch (e) {
        return fallback;
    }
};

const writeFlag = (key, value) => {
    try {
        localStorage.setItem(key, value ? 'true' : 'false');
    } catch (e) {
        /* приватный режим — панель просто не запомнит состояние */
    }
};

const isTouchLayout = () => {
    try {
        return window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    } catch (e) {
        return window.innerWidth <= 640;
    }
};

const fmtMb = (bytes) => (bytes / 1024 / 1024).toFixed(0);

/** Видео ли пост: нужно и самопроверке, и глубокому тесту. */
const isVideoPost = (post) => {
    const ext = (String((post && post.file_url) || '').split('.').pop() || '').toLowerCase();
    return ext === 'mp4' || ext === 'webm' || ext === 'mov';
};

export class DevPanel {
    constructor() {
        this.el = null;
        this.nodes = {};
        this.enabled = readFlag(ENABLED_KEY, false);
        this.collapsed = readFlag(COLLAPSED_KEY, false);
        this.interval = 1000;

        this._timer = null;
        this._rafId = null;
        this._width = 0;
        this._dragMoved = false;
        this._lastFrame = 0;
        this._frames = 0;
        this._fps = 0;
        this._jank = 0;
        this._frameSampleStart = 0;

        // Одного счётчика «Ошибок» мало: при 404/401/429 нужно видеть, какой
        // именно путь и код. codes — сколько раз встретился каждый статус,
        // recent — последние запросы для журнала.
        this._net = {
            count: 0, probes: 0, errors: 0, totalMs: 0, lastPath: '', lastMs: 0,
            codes: {}, rateLimited: 0, recent: [],
        };
        this._errors = [];
        this._errorCount = 0;
        this._selfTest = null;
        this._drag = null;
        this._fetchWrapped = false;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onFullscreenChange = this._onFullscreenChange.bind(this);
        this._onVisibilityChange = this._onVisibilityChange.bind(this);
    }

    // ── Публичный интерфейс ────────────────────────────────────────────

    mount() {
        this.el = document.getElementById('r34-dev-panel');
        if (!this.el) {
            this.el = document.createElement('div');
            this.el.id = 'r34-dev-panel';
            document.body.appendChild(this.el);
        }
        this.el.classList.add('r34-dev-panel');
        this._buildSkeleton();
        this._bindEvents();
        this._wrapFetch();
        this._bindGlobalErrors();

        // На телефоне панель стартует свёрнутой: развёрнутый лист закрывает
        // половину ленты, и первое впечатление — «сайт сломался».
        if (isTouchLayout() && !localStorage.getItem(COLLAPSED_KEY)) {
            this.collapsed = true;
        }
        this.applyState();
    }

    isVisible() {
        return Boolean(this.el) && !this.el.hidden;
    }

    setEnabled(value) {
        const wasEnabled = this.enabled;
        this.enabled = Boolean(value);
        writeFlag(ENABLED_KEY, this.enabled);
        // На телефоне панель по умолчанию свёрнута в значок. Если человек
        // включает её сам в настройках, он ждёт панель, а не кружок «DEV»
        // в углу, — поэтому явное включение разворачивает её один раз.
        if (this.enabled && !wasEnabled && this.collapsed && isTouchLayout()) {
            this.collapsed = false;
            writeFlag(COLLAPSED_KEY, false);
        }
        this.applyState();
        if (this.enabled) this.refresh();
    }

    toggle() {
        this.setEnabled(!this.enabled);
    }

    collapse(value) {
        this.collapsed = value === undefined ? !this.collapsed : Boolean(value);
        writeFlag(COLLAPSED_KEY, this.collapsed);
        this.applyState();
        if (!this.collapsed) this.refresh();
    }

    applyState() {
        if (!this.el) return;
        const inFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        // Панель НЕ прячется в мини-играх и лобби: она выше их оверлеев
        // (z-index 900000 против 55000…100000) и остаётся доступной, а если
        // мешает — её оттаскивают за заголовок.
        const visible = this.enabled && !inFullscreen;
        this.el.hidden = !visible;
        this.el.classList.toggle('is-collapsed', this.collapsed);
        this.el.classList.toggle('is-idle', Boolean(document.hidden));

        // Свёрнутый вид — кружок, его размеры задаёт CSS. Inline-ширина, которую
        // ставит перетаскивание, перебила бы их, и вместо кружка остался бы
        // обрезанный лист. Поэтому в свёрнутом виде она снимается, а при
        // разворачивании возвращается.
        if (this.collapsed) {
            this.el.style.width = '';
        } else if (!this.el.style.width && this._width) {
            // Ширину задаёт CSS (268px на ПК, left/right на телефоне), а inline
            // нужен только после перетаскивания — иначе он перебивал бы
            // телефонную раскладку и узкое окно.
            this.el.style.width = `${Math.round(this._width)}px`;
        }

        if (visible && !this.collapsed) {
            this.refresh();
            this._startTimers();
        } else {
            this._stopTimers();
        }
    }

    /** Обновление метрик. Зовётся таймером и из gallery после отрисовки. */
    refresh() {
        if (!this.el || this.el.hidden || this.collapsed) return;
        this._updateHeader();
        this._updateMemory();
        this._updateGallery();
        this._updateNetwork();
        this._updateErrors();
    }

    // ── Разметка ───────────────────────────────────────────────────────

    _buildSkeleton() {
        const row = (label) => {
            const wrap = document.createElement('div');
            wrap.className = 'r34-dev-row';
            const name = document.createElement('span');
            name.className = 'r34-dev-row-label';
            name.textContent = tr(label);
            const value = document.createElement('span');
            value.className = 'r34-dev-row-value';
            value.textContent = '—';
            wrap.append(name, value);
            return { wrap, value };
        };

        const group = (title) => {
            const box = document.createElement('div');
            box.className = 'r34-dev-group';
            const head = document.createElement('div');
            head.className = 'r34-dev-group-title';
            head.textContent = tr(title);
            box.appendChild(head);
            return box;
        };

        this.el.textContent = '';

        const head = document.createElement('div');
        head.className = 'r34-dev-head';
        head.innerHTML = `
            <span class="r34-dev-title">DEV</span>
            <span class="r34-dev-subtitle"></span>
            <span class="r34-dev-dot"></span>
            <button type="button" class="r34-dev-btn r34-dev-btn--collapse" aria-label="Свернуть">–</button>
            <button type="button" class="r34-dev-btn r34-dev-btn--close" aria-label="Скрыть">×</button>
        `;

        const body = document.createElement('div');
        body.className = 'r34-dev-body';

        const frames = group('Кадры');
        const fps = row('FPS');
        const frame = row('Кадр');
        const jank = row('Просадки');
        frames.append(fps.wrap, frame.wrap, jank.wrap);

        const memory = group('Память и DOM');
        const ram = row('Память');
        const dom = row('DOM');
        memory.append(ram.wrap, dom.wrap);

        const gallery = group('Лента');
        const mode = row('Режим');
        const cards = row('Карточек');
        const rendered = row('Отрисовано');
        const videos = row('Видео');
        const cols = row('Колонки');
        const preload = row('Предзагрузка');
        gallery.append(mode.wrap, cards.wrap, rendered.wrap, videos.wrap, cols.wrap, preload.wrap);

        const network = group('Сеть');
        const reqs = row('Запросов');
        const failed = row('Ошибок');
        const codes = row('Коды');
        const rate = row('429');
        const avg = row('Среднее');
        const last = row('Последний');
        network.append(reqs.wrap, failed.wrap, codes.wrap, rate.wrap, avg.wrap, last.wrap);

        const requests = group('Запросы');
        const requestLog = document.createElement('ul');
        requestLog.className = 'r34-dev-log';
        requests.appendChild(requestLog);

        const errors = group('Журнал');
        const log = document.createElement('ul');
        log.className = 'r34-dev-log';
        errors.appendChild(log);

        body.append(frames, memory, gallery, network, requests, errors, this._buildSelfTestRow());

        const tools = document.createElement('div');
        tools.className = 'r34-dev-tools';
        tools.innerHTML = `
            <button type="button" class="r34-dev-action" data-action="copy">${tr('Копировать')}</button>
            <button type="button" class="r34-dev-action" data-action="json">JSON</button>
            <button type="button" class="r34-dev-action" data-action="test">${tr('Тест')}</button>
            <button type="button" class="r34-dev-action" data-action="deep">${tr('Глубокий тест')}</button>
            <button type="button" class="r34-dev-action r34-dev-action--primary" data-action="reload">${tr('Перезагрузить')}</button>
        `;

        this.el.append(head, body, tools);

        this.nodes = {
            head, body, log,
            subtitle: head.querySelector('.r34-dev-subtitle'),
            collapseBtn: head.querySelector('.r34-dev-btn--collapse'),
            closeBtn: head.querySelector('.r34-dev-btn--close'),
            fps: fps.value, frame: frame.value, jank: jank.value,
            ram: ram.value, dom: dom.value,
            mode: mode.value, cards: cards.value, rendered: rendered.value,
            videos: videos.value, cols: cols.value, preload: preload.value,
            reqs: reqs.value, failed: failed.value, avg: avg.value, last: last.value,
            codes: codes.value, rate: rate.value, requestLog,
        };
        this.nodes.selfTest = body.querySelector('.r34-dev-selftest');
    }

    _buildSelfTestRow() {
        const box = document.createElement('div');
        box.className = 'r34-dev-selftest';
        box.hidden = true;
        return box;
    }

    // ── События ────────────────────────────────────────────────────────

    _bindEvents() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('fullscreenchange', this._onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', this._onFullscreenChange);
        document.addEventListener('visibilitychange', this._onVisibilityChange);
        window.addEventListener('resize', () => {
            if (this._drag) return;
            this._clampPosition();
        }, { passive: true });

        this.nodes.collapseBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.collapse();
        });
        this.nodes.closeBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.setEnabled(false);
        });
        // Свёрнутый значок: клик по шапке разворачивает, но только если это
        // был клик, а не перетаскивание — иначе значок разворачивался бы в
        // момент, когда его просто отодвинули с дороги.
        this.nodes.head?.addEventListener('click', (event) => {
            if (!this.collapsed) return;
            if (event.target.closest('button')) return;
            if (this._dragMoved) {
                this._dragMoved = false;
                return;
            }
            this.collapse(false);
        });
        this.el.querySelector('.r34-dev-tools')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'copy') this._copyReport();
            else if (action === 'json') this._downloadReport();
            else if (action === 'test') this._runSelfTest();
            else if (action === 'deep') this._runDeepTest(btn);
            else if (action === 'reload') window.location.reload();
        });

        this._bindDrag();
        this._restorePosition();
    }

    _bindDrag() {
        const head = this.nodes.head;
        if (!head) return;

        head.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button')) return;

            const rect = this.el.getBoundingClientRect();
            // Свёрнутый значок тоже тащим — кружок 44px легко убрать с того
            // места, где он закрывает игровое поле. Ширину ему задаёт CSS,
            // поэтому подменять её inline-стилем нельзя.
            if (!this.collapsed) {
                // На телефоне лист растянут по left/right. Как только панель
                // начинает двигаться, правая граница снимается — без явной
                // ширины она схлопнулась бы по содержимому, фиксируем её.
                if (!this.el.style.width || this.el.style.width === 'auto') {
                    this.el.style.width = `${this._panelWidth()}px`;
                }
                this._width = this.el.offsetWidth || this._panelWidth();
            }
            this._dragMoved = false;
            this._drag = {
                id: event.pointerId,
                dx: event.clientX - rect.left,
                dy: event.clientY - rect.top,
                startX: event.clientX,
                startY: event.clientY,
            };
            head.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        head.addEventListener('pointermove', (event) => {
            if (!this._drag || this._drag.id !== event.pointerId) return;
            const left = Math.min(
                Math.max(0, event.clientX - this._drag.dx),
                window.innerWidth - this.el.offsetWidth
            );
            const top = Math.min(
                Math.max(0, event.clientY - this._drag.dy),
                window.innerHeight - this.el.offsetHeight
            );
            this.el.style.left = `${Math.round(left)}px`;
            this.el.style.top = `${Math.round(top)}px`;
            this.el.style.right = 'auto';
            this.el.style.bottom = 'auto';
            // 4px — порог, ниже которого движение считается дрожанием пальца.
            if (Math.abs(event.clientX - this._drag.startX) +
                Math.abs(event.clientY - this._drag.startY) > 4) {
                this._dragMoved = true;
            }
        });

        const endDrag = (event) => {
            if (!this._drag || (event && this._drag.id !== event.pointerId)) return;
            this._drag = null;
            if (this.el.style.left) {
                try {
                    localStorage.setItem(POS_KEY, JSON.stringify({
                        left: parseInt(this.el.style.left, 10),
                        top: parseInt(this.el.style.top, 10),
                        // У свёрнутого значка ширина 44px от кружка: если
                        // записать её, развёрнутая панель станет полоской.
                        width: this.collapsed
                            ? Math.round(this._width || this._panelWidth())
                            : this.el.offsetWidth,
                    }));
                } catch (e) {
                    /* не критично */
                }
            }
        };
        head.addEventListener('pointerup', endDrag);
        head.addEventListener('pointercancel', endDrag);
    }

    _restorePosition() {
        let pos = null;
        try {
            pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
        } catch (e) {
            pos = null;
        }
        if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;
        // Место запоминается на любой раскладке: на телефоне лист тоже можно
        // оттащить в сторону, чтобы он не закрывал игровое поле. Ширину берём
        // из сохранения или считаем формулой — замер DOM здесь ненадёжен:
        // панель в этот момент ещё не разложена и getBoundingClientRect даёт 0.
        const width = Math.round(
            typeof pos.width === 'number' && pos.width > 0 ? pos.width : this._panelWidth()
        );
        // Высоту на этом шаге измерить нельзя — панель ещё не разложена.
        // Поэтому по горизонтали зажимаем с уже известной шириной, а по
        // вертикали оставляем хотя бы шапку на экране и дожимаем после
        // раскладки в requestAnimationFrame.
        this._width = width;
        this.el.style.width = `${width}px`;
        this.el.style.left = `${Math.max(0, Math.min(pos.left, window.innerWidth - width))}px`;
        this.el.style.top = `${Math.max(0, Math.min(pos.top, window.innerHeight - 60))}px`;
        this.el.style.right = 'auto';
        this.el.style.bottom = 'auto';
        requestAnimationFrame(() => {
            if (this.el) this._clampPosition();
        });
    }

    /**
     * Ширина панели в «оторванном» состоянии: на телефоне лист занимает всю
     * ширину минус отступы, на ПК — карточка 268px.
     */
    _panelWidth() {
        const base = isTouchLayout() ? window.innerWidth - 16 : 268;
        return Math.max(200, Math.min(base, window.innerWidth - 16));
    }

    _clampPosition() {
        if (!this.el || !this.el.style.left) return;
        // Окно могло стать уже, чем панель (поворот телефона, ресайз).
        if (this.el.offsetWidth > window.innerWidth - 8) {
            this.el.style.width = `${Math.max(200, window.innerWidth - 16)}px`;
        }
        const maxLeft = Math.max(0, window.innerWidth - this.el.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - this.el.offsetHeight);
        const left = Math.min(parseInt(this.el.style.left, 10), maxLeft);
        const top = Math.min(parseInt(this.el.style.top, 10), maxTop);
        this.el.style.left = `${left}px`;
        this.el.style.top = `${top}px`;
    }

    _onKeyDown(event) {
        if (!event.ctrlKey || !event.shiftKey) return;
        if (event.code !== 'KeyD' && String(event.key).toLowerCase() !== 'd') return;
        const tag = (event.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
        event.preventDefault();
        this.toggle();
    }

    _onFullscreenChange() {
        this.applyState();
    }

    _onVisibilityChange() {
        this.el?.classList.toggle('is-idle', Boolean(document.hidden));
        if (document.hidden) {
            this._stopTimers();
        } else if (this.enabled) {
            this.applyState();
        }
    }

    // ── Таймеры ────────────────────────────────────────────────────────

    _startTimers() {
        if (this._timer) return;
        this._lastFrame = performance.now();
        this._frameSampleStart = this._lastFrame;
        this._timer = window.setInterval(() => this.refresh(), this.interval);
        this._rafId = requestAnimationFrame(this._loopFrames);
    }

    _stopTimers() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    _loopFrames = () => {
        const now = performance.now();
        const dt = now - this._lastFrame;
        this._lastFrame = now;

        if (dt > 1000) {
            // Пауза (вкладка была скрыта, панель свёрнута) — это не «кадр на
            // 4 секунды», а отсутствие измерений: открываем окно заново.
            this._frames = 0;
            this._jank = 0;
            this._frameSampleStart = now;
        } else if (dt > 0) {
            this._frames += 1;
            // Просадка — кадр дольше 50 мс: именно на таких глазу заметно.
            if (dt > 50) this._jank += 1;
        }

        if (now - this._frameSampleStart >= 1000) {
            const windowMs = now - this._frameSampleStart;
            this._fps = Math.round(this._frames * 1000 / windowMs);
            this._renderFrames(windowMs > 1200 ? 0 : dt);
            this._frames = 0;
            this._jank = 0;
            this._frameSampleStart = now;
        }

        if (document.hidden) {
            this._rafId = null;
            return;
        }
        this._rafId = requestAnimationFrame(this._loopFrames);
    };

    // ── Метрики ────────────────────────────────────────────────────────

    _renderFrames(lastDt) {
        if (!this.nodes.fps) return;
        this.nodes.fps.textContent = String(this._fps);
        this._setTone(this.nodes.fps, this._fps >= 50 ? 'good' : this._fps >= 30 ? 'warn' : 'bad');

        if (lastDt > 0) {
            this.nodes.frame.textContent = `${lastDt.toFixed(1)} ms`;
            this._setTone(this.nodes.frame, lastDt > 50 ? 'warn' : '');
        } else {
            this.nodes.frame.textContent = '—';
            this._setTone(this.nodes.frame, 'dim');
        }

        this.nodes.jank.textContent = String(this._jank);
        this._setTone(this.nodes.jank, this._jank > 0 ? 'warn' : 'good');
    }

    _updateHeader() {
        if (!this.nodes.subtitle) return;
        const lang = (window.r34i18n && window.r34i18n.getLanguage && window.r34i18n.getLanguage()) || '—';
        this.nodes.subtitle.textContent = `${window.innerWidth}×${window.innerHeight} · ${lang}`;
    }

    _updateMemory() {
        if (!this.nodes.ram) return;
        const mem = performance.memory;
        if (mem && mem.usedJSHeapSize) {
            this.nodes.ram.textContent = `${fmtMb(mem.usedJSHeapSize)} / ${fmtMb(mem.jsHeapSizeLimit)} МБ`;
        } else {
            this.nodes.ram.textContent = 'н/д';
            this._setTone(this.nodes.ram, 'dim');
        }
        this.nodes.dom.textContent = String(document.getElementsByTagName('*').length);
    }

    _updateGallery() {
        const g = window.gallery;
        if (!this.nodes.mode) return;
        if (!g) {
            this.nodes.mode.textContent = '—';
            return;
        }
        this.nodes.mode.textContent = g.isFavoritesActive ? tr('избранное') : tr('лента');
        this.nodes.cards.textContent = String(g.currentPosts ? g.currentPosts.length : 0);

        const rendered = g.resultsDiv ? g.resultsDiv.querySelectorAll('.media-container').length : 0;
        this.nodes.rendered.textContent = String(rendered);

        const videos = g.resultsDiv ? g.resultsDiv.querySelectorAll('video.media-content').length : 0;
        this.nodes.videos.textContent = String(videos);

        let columns = g.currentColumns;
        try {
            columns = typeof g.getDisplayedColumns === 'function' ? g.getDisplayedColumns() : columns;
        } catch (e) {
            /* остаётся this.currentColumns */
        }
        this.nodes.cols.textContent = String(columns ?? '—');

        const mode = g.preloadMode || 'near';
        let margin = '';
        try {
            margin = typeof g.getObserverRootMargin === 'function' ? g.getObserverRootMargin() : '';
        } catch (e) {
            margin = '';
        }
        this.nodes.preload.textContent = margin ? `${mode} · ${margin}` : mode;
    }

    _updateNetwork() {
        if (!this.nodes.reqs) return;
        const net = this._net;
        this.nodes.reqs.textContent = String(net.count);
        this.nodes.failed.textContent = String(net.errors);
        this._setTone(this.nodes.failed, net.errors > 0 ? 'bad' : 'good');
        this.nodes.avg.textContent = net.count ? `${Math.round(net.totalMs / net.count)} ms` : '—';
        this.nodes.last.textContent = net.lastPath ? `${net.lastPath} ${Math.round(net.lastMs)}ms` : '—';

        // Коды по группам: сразу видно, это «не найдено» (4xx) или сервер лежит
        // (5xx), а не просто «ошибок 3».
        const buckets = { ok: 0, client: 0, server: 0, broken: 0 };
        for (const [key, count] of Object.entries(net.codes)) {
            const code = Number(key);
            if (!Number.isFinite(code)) buckets.broken += count;
            else if (code >= 500) buckets.server += count;
            else if (code >= 400) buckets.client += count;
            else buckets.ok += count;
        }
        this.nodes.codes.textContent = `OK ${buckets.ok} · 4xx ${buckets.client}`
            + ` · 5xx ${buckets.server}${buckets.broken ? ` · err ${buckets.broken}` : ''}`;
        this._setTone(
            this.nodes.codes,
            buckets.server > 0 ? 'bad' : buckets.client > 0 ? 'warn' : 'good'
        );

        this.nodes.rate.textContent = String(net.rateLimited);
        this._setTone(this.nodes.rate, net.rateLimited > 0 ? 'bad' : 'good');

        const log = this.nodes.requestLog;
        if (log) {
            log.textContent = '';
            if (!net.recent.length) {
                const li = document.createElement('li');
                li.className = 'is-empty';
                li.textContent = tr('нет запросов');
                log.appendChild(li);
            } else {
                // Свежие сверху: список читают, когда что-то только что упало.
                for (const item of net.recent.slice(-4).reverse()) {
                    const li = document.createElement('li');
                    li.textContent = `${item.code} · ${item.path} · ${Math.round(item.ms)} ms`;
                    li.title = li.textContent;
                    log.appendChild(li);
                }
            }
        }
    }

    _updateErrors() {
        const log = this.nodes.log;
        if (!log) return;
        log.textContent = '';
        if (!this._errors.length) {
            const li = document.createElement('li');
            li.className = 'is-empty';
            li.textContent = tr('нет ошибок');
            log.appendChild(li);
            return;
        }
        for (const item of this._errors.slice(-4)) {
            const li = document.createElement('li');
            li.textContent = item;
            li.title = item;
            log.appendChild(li);
        }
    }

    _setTone(node, tone) {
        if (!node) return;
        node.classList.remove('is-good', 'is-warn', 'is-bad', 'is-dim');
        if (tone) node.classList.add(`is-${tone}`);
    }

    // ── Перехват сети и ошибок ─────────────────────────────────────────

    _wrapFetch() {
        if (this._fetchWrapped || typeof window.fetch !== 'function') return;
        this._fetchWrapped = true;
        const original = window.fetch.bind(window);
        const panel = this;

        window.fetch = async function patchedFetch(input, init) {
            const started = performance.now();
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            // Запросы самопроверки (намеренные 401/400) идут отдельным счётчиком:
            // это проверка защиты, а не ошибка приложения.
            const probe = Boolean(init && init.__r34Probe);
            let path = url;
            try {
                path = new URL(url, window.location.href).pathname;
            } catch (e) {
                path = String(url);
            }
            try {
                const response = await original(input, init);
                panel._recordRequest(path, response.status,
                    performance.now() - started, probe);
                return response;
            } catch (error) {
                panel._recordRequest(
                    path,
                    error && error.name === 'AbortError' ? 'abort' : 'err',
                    performance.now() - started,
                    probe
                );
                throw error;
            }
        };
    }

    _recordRequest(path, code, ms, probe) {
        const net = this._net;
        if (probe) {
            // Проверочный запрос: считаем отдельно, чтобы «Ошибок 3» не
            // появлялось после каждого прогона самопроверки.
            net.probes += 1;
            return;
        }
        net.count += 1;
        net.totalMs += ms;
        net.lastPath = path;
        net.lastMs = ms;
        if (code === 'abort' || code === 'err' || Number(code) >= 400) {
            net.errors += 1;
        }
        const key = String(code);
        net.codes[key] = (net.codes[key] || 0) + 1;
        if (key === '429') net.rateLimited += 1;
        net.recent.push({ path, code: key, ms });
        if (net.recent.length > 8) net.recent.shift();
        this._updateNetwork();
    }

    _bindGlobalErrors() {
        window.addEventListener('error', (event) => {
            const where = event.filename ? ` @ ${event.filename.split('/').pop()}:${event.lineno}` : '';
            const message = event.message || (event.error && event.error.message) || 'Ошибка';
            this._pushError(`${message}${where}`);
        });
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            const message = reason && reason.message ? reason.message : String(reason);
            this._pushError(`Promise: ${message}`);
        });
    }

    _pushError(text) {
        this._errorCount += 1;
        this._errors.push(String(text).slice(0, 160));
        if (this._errors.length > 20) this._errors.shift();
        this._updateErrors();
    }

    // ── Самопроверка и отчёт ───────────────────────────────────────────

    /**
     * Настоящие проверки, а не декоративные галочки: каждая смотрит живое
     * состояние страницы или реально дёргает сервер и возвращает ok вместе с
     * пояснением — код ответа, счётчик, текст исключения. Если что-то сломано,
     * в панели видно, что именно и почему.
     */
    _selfTestChecks(netBefore) {
        const cards = () => {
            const gallery = window.gallery;
            return gallery && gallery.resultsDiv
                ? Array.from(gallery.resultsDiv.querySelectorAll('.media-container'))
                : [];
        };

        return [
            ['Галерея инициализирована', () => {
                const gallery = window.gallery;
                if (!gallery) return { ok: false, detail: 'window.gallery = undefined' };
                const ok = typeof gallery.renderGallery === 'function'
                    && typeof gallery.createCard === 'function';
                return { ok, detail: ok ? gallery.constructor.name : 'renderGallery() = undefined' };
            }],

            ['Лента в DOM', () => {
                const gallery = window.gallery;
                const box = gallery && gallery.resultsDiv;
                if (!box) return { ok: false, detail: '#results = null' };
                const rect = box.getBoundingClientRect();
                return {
                    ok: rect.width > 0 && rect.height > 0,
                    detail: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
                };
            }],

            ['Карточки отрисованы', () => {
                const count = cards().length;
                return { ok: count > 0, detail: String(count) };
            }],

            ['Картинки загрузились', () => {
                // Считаем только те <img>, у которых есть источник: далёким
                // карточкам источник намеренно очищают при выгрузке, и это
                // не ошибка загрузки.
                const images = cards()
                    .flatMap((card) => Array.from(card.querySelectorAll('img')))
                    .filter((img) => Boolean(img.currentSrc || img.getAttribute('src')));
                // Карточки рождаются пустыми (.media-placeholder) и получают
                // медиа от наблюдателя при прокрутке. Пока ни одна не раскрыта,
                // проверять нечего: это пропуск, а не поломка загрузки.
                if (images.length === 0) return { skipped: true, detail: '0 hydrated' };
                const broken = images.filter((img) => img.complete && img.naturalWidth === 0).length;
                const loading = images.filter((img) => !img.complete).length;
                return {
                    ok: broken === 0,
                    detail: `${broken}/${images.length}${loading ? ` · ${loading}…` : ''}`,
                };
            }],

            ['Видео без ошибок', () => {
                // video.error выставляется браузером только на настоящий сбой
                // источника, поэтому ленивые карточки не дают ложных провалов.
                const videos = cards().flatMap((card) => Array.from(card.querySelectorAll('video')));
                if (videos.length === 0) {
                    // Видеопостов на странице нет — проверять действительно нечего.
                    const posts = (window.gallery && window.gallery.currentPosts) || [];
                    const videoPosts = posts.filter((post) => isVideoPost(post)).length;
                    if (videoPosts === 0) return { ok: true, detail: '0/0' };
                    // Посты есть, но карточки ещё не раскрыты наблюдателем.
                    return { skipped: true, detail: `${videoPosts} posts · 0 hydrated` };
                }
                const failed = videos.filter((video) => Boolean(video.error)).length;
                return { ok: failed === 0, detail: `${failed}/${videos.length}` };
            }],

            ['API /api/app-language', () => this._probe('/api/app-language', (response, data) => ({
                ok: response.ok && Boolean(data && typeof data.lang === 'string'),
                detail: data && data.lang ? data.lang : (data && data.error) || null,
            }))],

            ['API /api/settings', () => this._probe('/api/settings', (response, data) => ({
                ok: response.ok && Boolean(data && data.ok === true && data.settings),
                detail: data && data.ok === true ? null : ((data && data.error) || null),
            }))],

            ['Сессия', () => {
                // Cookie выдаётся на странице входа и восстанавливается сама,
                // если ключи на диске целы. Без неё /api/* отвечает 401.
                const has = document.cookie
                    .split(';')
                    .map((part) => part.trim())
                    .includes('r34_session=ok');
                return { ok: has, detail: has ? 'r34_session' : 'no r34_session cookie' };
            }],

            ['API закрыт без сессии', async () => {
                // Запрос намеренно без cookie: если защита на сервере сломалась,
                // вернётся 200, и это видно сразу.
                return this._probe('/api/settings', (response, data) => ({
                    ok: response.status === 401,
                    detail: response.status === 401
                        ? ((data && data.error) || null)
                        : 'защита не сработала',
                }), { credentials: 'omit' });
            }],

            ['Прокси и allowlist', async () => {
                // Оба запроса упираются в валидацию до похода в rule34: так
                // проверка не тратит лимит API и не зависит от сети.
                const missing = await this._probe('/proxy', (response) => ({
                    ok: response.status === 400,
                    detail: 'no url',
                }));
                const foreign = await this._probe(
                    '/proxy?url=https%3A%2F%2Fexample.com%2Fx.png',
                    (response) => ({ ok: response.status === 400, detail: 'foreign host' })
                );
                return {
                    ok: missing.ok && foreign.ok,
                    detail: `${missing.detail} · ${foreign.detail}`,
                };
            }],

            ['localStorage: запись', () => {
                const key = 'r34_dev_probe';
                localStorage.setItem(key, '1');
                const value = localStorage.getItem(key);
                localStorage.removeItem(key);
                return { ok: value === '1', detail: value === '1' ? '' : `getItem → ${value}` };
            }],

            ['Переводы i18n', () => {
                const api = window.r34i18n;
                if (!api || typeof api.t !== 'function') {
                    return { ok: false, detail: 'window.r34i18n.t = undefined' };
                }
                const lang = typeof api.getLanguage === 'function' ? api.getLanguage() : null;
                return { ok: true, detail: String(lang || '—') };
            }],

            ['Стили применены', () => {
                const style = getComputedStyle(this.el);
                const ok = style.position === 'fixed' && style.zIndex === '900000';
                return { ok, detail: `${style.position} · z${style.zIndex}` };
            }],

            ['Наблюдатель предзагрузки', () => {
                const gallery = window.gallery;
                if (!gallery) return { ok: false, detail: 'window.gallery = undefined' };
                const mode = gallery.preloadMode || '—';
                const margin = typeof gallery.getObserverRootMargin === 'function'
                    ? gallery.getObserverRootMargin() : '';
                const count = cards().length;
                // Пока карточек нет, наблюдатель ещё не создан — это норма.
                const ok = count === 0 || Boolean(gallery.observer);
                return { ok, detail: `${mode} · ${margin || '—'} · ${count}` };
            }],

            ['Счётчик сети', () => {
                const delta = (this._net.count + this._net.probes) - netBefore;
                return { ok: delta > 0, detail: `+${delta}` };
            }],

            ['Ошибки JS', () => {
                const last = this._errors[this._errors.length - 1] || '';
                return {
                    ok: this._errorCount === 0,
                    detail: this._errorCount ? `${this._errorCount} · ${last}` : '0',
                };
            }],
        ];
    }

    /** Запрос к серверу с таймаутом: возвращает ok и разбор ответа. */
    async _probe(url, validate, options = {}) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
        try {
            const response = await fetch(url, {
                credentials: options.credentials || 'same-origin',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined,
                // patchedFetch в панели видит этот флаг: трафик проверки
                // не должен попадать в «Ошибки» и «Коды».
                __r34Probe: true,
                // Сервер по этому заголовку не пишет проверку в лог: иначе
                // намеренные 401/400 выглядели бы как три ошибки после теста.
                headers: { 'X-R34-Self-Test': '1' },
            });
            // Читаем текст, а не response.json(): прокси отвечает простым
            // текстом, и без этого любая его проверка выглядела как «invalid JSON».
            const text = await response.text();
            let data = null;
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = null;
            }
            const verdict = validate(response, data, text);
            const extra = verdict.detail || (data === null ? 'invalid JSON' : '');
            return {
                ok: Boolean(verdict.ok),
                detail: `HTTP ${response.status}${extra ? ` · ${extra}` : ''}`,
            };
        } catch (error) {
            const message = error && error.name === 'AbortError'
                ? 'timeout 5s'
                : (error && error.message) || String(error);
            return { ok: false, detail: `${url}: ${message}` };
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async _runSelfTest() {
        const netBefore = this._net.count + this._net.probes;
        const started = performance.now();
        const results = [];
        // Каждая проверка в своём try/catch: упавшая не отменяет остальные и
        // показывает текст исключения вместо молчаливой галочки.
        for (const [label, run] of this._selfTestChecks(netBefore)) {
            const checkStart = performance.now();
            let ok = false;
            let skipped = false;
            let detail = '';
            try {
                const verdict = await run();
                ok = Boolean(verdict && verdict.ok);
                // «Пропуск» — проверять было нечего (например, карточки ещё не
                // раскрыты). Это не успех и не провал, поэтому считается отдельно.
                skipped = Boolean(verdict && verdict.skipped) && !ok;
                // У пропуска нет вердикта: ok=false читалось бы как провал.
                if (skipped) ok = null;
                detail = (verdict && verdict.detail) || '';
            } catch (error) {
                ok = false;
                detail = (error && error.message) || String(error);
            }
            results.push({ label, ok, skipped, detail, ms: Math.round(performance.now() - checkStart) });
        }
        const failed = results.filter((item) => !item.ok && !item.skipped).length;
        const skipped = results.filter((item) => item.skipped).length;
        this._selfTest = { results, failed, skipped, ms: Math.round(performance.now() - started) };
        this._renderSelfTest();
    }

    /**
     * Глубокий тест: раскрывает первые карточки тем же вызовом, что и
     * наблюдатель при прокрутке, ждёт загрузки медиа и только потом гоняет
     * самопроверку. Нужен, когда обычный «Тест» пишет «0 hydrated»: пока
     * карточки пустые, проверять картинки и видео нечем.
     */
    async _runDeepTest(button) {
        const gallery = window.gallery;
        const container = gallery && gallery.resultsDiv;
        const label = button ? button.textContent : '';
        if (button) {
            button.disabled = true;
            button.textContent = '…';
        }
        try {
            if (container && typeof gallery.loadMedia === 'function') {
                const posts = gallery.currentPosts || [];
                const cards = Array.from(container.querySelectorAll('.media-container'));
                const scrollTop = container.scrollTop;
                // Десяти карточек хватает для картинок, но видео в ленте
                // редки и лежат дальше — их дотягиваем отдельно, иначе
                // проверка видео снова уйдёт в «0 hydrated».
                const videoCards = cards
                    .filter((card) => isVideoPost(card._post || posts[parseInt(card.dataset.idx, 10)]))
                    .slice(0, 2);
                const targets = [...cards.slice(0, 10), ...videoCards];
                for (const card of targets) {
                    const idx = parseInt(card.dataset.idx, 10);
                    const post = card._post || posts[idx];
                    if (!post || card.dataset.loaded === '1') continue;
                    gallery.loadMedia(card, post, idx);
                    card.dataset.loaded = '1';
                }
                await this._waitForMedia(container, 6000);
                container.scrollTop = scrollTop;
            }
            await this._runSelfTest();
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = label;
            }
        }
    }

    /** Ждёт, пока раскрытые картинки догрузятся, а видео получат метаданные. */
    _waitForMedia(container, timeout) {
        const started = performance.now();
        const pending = () => Array.from(container.querySelectorAll('img, video'))
            .filter((media) => {
                if (media.tagName === 'VIDEO') {
                    // Ошибку не ждём: её покажет проверка «Видео без ошибок».
                    return !media.error && media.readyState < 1;
                }
                return Boolean(media.currentSrc || media.getAttribute('src'))
                    && !media.complete;
            });
        return new Promise((resolve) => {
            const tick = () => {
                if (!pending().length || performance.now() - started >= timeout) {
                    resolve();
                    return;
                }
                setTimeout(tick, 150);
            };
            tick();
        });
    }

    _renderSelfTest() {
        const box = this.nodes.selfTest;
        if (!box) return;
        if (!this._selfTest) {
            box.hidden = true;
            return;
        }
        const { results, failed, skipped, ms } = this._selfTest;
        box.hidden = false;
        box.textContent = '';

        const checked = results.length - skipped;
        const title = document.createElement('div');
        title.className = 'r34-dev-group-title';
        title.textContent = `${tr('Самопроверка')} · ${checked - failed}/${checked}`
            + `${skipped ? ` · ${skipped} ~` : ''} · ${ms} ms`;
        box.appendChild(title);

        for (const item of results) {
            const wrap = document.createElement('div');
            wrap.className = 'r34-dev-check';

            const row = document.createElement('div');
            row.className = 'r34-dev-row';
            const name = document.createElement('span');
            name.className = 'r34-dev-row-label';
            name.textContent = tr(item.label);
            const value = document.createElement('span');
            value.className = `r34-dev-row-value ${item.skipped ? 'is-muted' : item.ok ? 'is-good' : 'is-bad'}`;
            value.textContent = item.skipped ? '~' : item.ok ? '✓' : '✕';
            row.append(name, value);
            wrap.appendChild(row);

            if (item.detail) {
                const note = document.createElement('div');
                note.className = `r34-dev-note${item.ok || item.skipped ? '' : ' is-bad'}`;
                note.textContent = `${item.detail}${item.ms > 50 ? ` · ${item.ms} ms` : ''}`;
                note.title = item.detail;
                wrap.appendChild(note);
            }
            box.appendChild(wrap);
        }
    }

    /**
     * Версии ?v= у main.js, devPanel.js и devpanel.css. Статика кешируется как
     * immutable, поэтому «у меня старое поведение» почти всегда означает
     * закешированный файл — в отчёте это видно сразу.
     */
    _staticVersions() {
        const versionOf = (src) => {
            if (!src) return null;
            try {
                return new URL(src, window.location.href).searchParams.get('v') || null;
            } catch (e) {
                return null;
            }
        };
        const script = document.querySelector('script[src*="main.js"]');
        const link = document.querySelector('link[href*="devpanel.css"]');
        // Свой модуль в DOM не отмечен — берём его URL из Resource Timing.
        const panelEntry = performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => name.includes('devPanel.js'))
            .pop();
        return {
            main: script ? versionOf(script.getAttribute('src')) : null,
            devPanel: versionOf(panelEntry),
            css: link ? versionOf(link.getAttribute('href')) : null,
        };
    }

    _buildReport() {
        const g = window.gallery || {};
        return {
            time: new Date().toISOString(),
            page: window.location.pathname,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            language: (window.r34i18n && window.r34i18n.getLanguage && window.r34i18n.getLanguage()) || '—',
            fps: this._fps,
            memoryMb: performance.memory ? fmtMb(performance.memory.usedJSHeapSize) : null,
            domNodes: document.getElementsByTagName('*').length,
            gallery: {
                mode: g.isFavoritesActive ? 'favorites' : 'gallery',
                posts: g.currentPosts ? g.currentPosts.length : 0,
                rendered: g.resultsDiv ? g.resultsDiv.querySelectorAll('.media-container').length : 0,
                videos: g.resultsDiv ? g.resultsDiv.querySelectorAll('video.media-content').length : 0,
                columns: g.currentColumns ?? null,
                preloadMode: g.preloadMode || null,
            },
            network: { ...this._net, avgMs: this._net.count ? Math.round(this._net.totalMs / this._net.count) : 0 },
            errors: { count: this._errorCount, last: this._errors.slice(-10) },
            selfTest: this._selfTest
                ? {
                    durationMs: this._selfTest.ms,
                    failed: this._selfTest.failed,
                    skipped: this._selfTest.skipped,
                    checks: this._selfTest.results,
                }
                : null,
            versions: this._staticVersions(),
            userAgent: navigator.userAgent,
        };
    }

    async _copyReport() {
        const text = JSON.stringify(this._buildReport(), null, 2);
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // Буфер обмена без HTTPS недоступен — показываем отчёт в новом окне,
            // чтобы его можно было скопировать руками.
            const win = window.open('', '_blank');
            if (win) win.document.body.innerHTML = `<pre style="white-space:pre-wrap;font:12px monospace"></pre>`;
            if (win) win.document.querySelector('pre').textContent = text;
        }
    }

    _downloadReport() {
        const text = JSON.stringify(this._buildReport(), null, 2);
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `r34-dev-${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
