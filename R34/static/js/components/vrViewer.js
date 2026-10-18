/**
 * VR / панорамный просмотр (экспериментально).
 *
 * Ничего не «превращает» в VR: плоская картинка так и останется плоской.
 * Смысл режима в другом — контент, который УЖЕ снят как панорама
 * (равнопрямоугольная проекция 360° или 180°, часто со стерео-парой
 * бок-о-бок), в обычном просмотрщике выглядит растянутой кашей. Здесь он
 * натягивается изнутри на сферу, как и задумано, поэтому им можно
 * нормально пользоваться — мышью, пальцем или прямо в VR-шлеме через WebXR.
 *
 * three.js подгружается динамически с CDN и только в момент первого
 * открытия режима — тем, кто им не пользуется, он не стоит ничего.
 * Медиа берётся через собственный /proxy сервера: он отдаёт файл с того же
 * origin (и умеет Range, так что перемотка видео работает), а значит
 * WebGL-текстура не «пачкает» холст кросс-доменной загрузкой.
 */

import { proxyUrl } from '../api.js';

const THREE_CDN = 'https://unpkg.com/three@0.160.0/build/three.module.js';

let threeModulePromise = null;
function loadThree() {
    if (!threeModulePromise) {
        threeModulePromise = import(/* @vite-ignore */ THREE_CDN).catch(err => {
            threeModulePromise = null;
            throw err;
        });
    }
    return threeModulePromise;
}

export const VR_PROJECTIONS = ['360', '180'];
export const VR_STEREO_MODES = ['mono', 'sbs', 'tb'];

// Слово «Стерео» вынесено в отдельный span: на узком экране оно прячется
// через CSS, иначе панель управления разъезжается на четыре строки и
// занимает пол-экрана телефона — а именно с телефона этим режимом и
// пользуются (очки под телефон, гироскоп).
const STEREO_LABELS = {
    mono: 'Моно',
    sbs: '<span class="vr-seg-word">Стерео </span>⇢⇠',
    tb: '<span class="vr-seg-word">Стерео </span>⇡⇣'
};

export class VRViewer {
    static _instance = null;

    static isOpen() {
        return !!VRViewer._instance;
    }

    static async open(post, options = {}) {
        if (!post) return;
        VRViewer.close();
        const viewer = new VRViewer(post, options);
        VRViewer._instance = viewer;
        try {
            await viewer._init();
        } catch (err) {
            console.error('[VR] Не удалось запустить режим:', err);
            viewer._showFatal(err);
        }
        return viewer;
    }

    static close() {
        if (VRViewer._instance) {
            VRViewer._instance._destroy();
            VRViewer._instance = null;
        }
    }

    constructor(post, options) {
        this.post = post;
        this.projection = VR_PROJECTIONS.includes(options.projection) ? options.projection : '360';
        this.stereo = VR_STEREO_MODES.includes(options.stereo) ? options.stereo : 'mono';
        this.onChangeSettings = typeof options.onChangeSettings === 'function' ? options.onChangeSettings : null;
        // Вызывающая сторона ставит на паузу то, что играло под оверлеем,
        // и этим колбэком возвращает всё как было после закрытия.
        this.onClose = typeof options.onClose === 'function' ? options.onClose : null;

        this.three = null;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.meshes = [];
        this.texture = null;
        this.mediaEl = null;

        // Направление взгляда в мышином/тач-режиме. lon/lat в градусах —
        // так проще ограничивать наклон, чем кватернионами.
        this.lon = 0;
        this.lat = 0;
        this.fov = 75;
        this._dragging = false;
        this._lastPointer = { x: 0, y: 0 };
        this._rafId = null;

        // Гироскоп («magic window»): смотрим по сторонам поворотом телефона.
        this.gyroEnabled = false;
        this._deviceOrientation = null;
        this._screenOrientationAngle = 0;

        // Разделение экрана на два глаза для VR-очков под телефон.
        this.cardboard = false;
        this.cameraL = null;
        this.cameraR = null;
    }

    // ---------- DOM ----------

    _buildOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'vr-overlay';
        overlay.innerHTML = `
            <div class="vr-stage"></div>
            <div class="vr-topbar">
                <button class="vr-btn vr-close-btn" title="Выйти из VR-просмотра (Esc)">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div class="vr-topbar-group">
                    <div class="vr-seg" data-role="projection">
                        <button class="vr-seg-btn" data-projection="360">360°</button>
                        <button class="vr-seg-btn" data-projection="180">180°</button>
                    </div>
                    <div class="vr-seg" data-role="stereo">
                        ${VR_STEREO_MODES.map(m => `<button class="vr-seg-btn" data-stereo="${m}">${STEREO_LABELS[m]}</button>`).join('')}
                    </div>
                    <button class="vr-btn vr-gyro-btn" hidden>Гироскоп</button>
                    <button class="vr-btn vr-cardboard-btn" title="Разделить экран на два глаза — для VR-очков под телефон">Очки</button>
                    <button class="vr-btn vr-xr-btn" hidden>Войти в VR</button>
                </div>
            </div>
            <div class="vr-hint">Тяните мышью или пальцем, чтобы осмотреться · колесо — приблизить</div>
            <div class="vr-loading"><div class="vr-spinner"></div><span>Готовим панораму...</span></div>
        `;
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.stage = overlay.querySelector('.vr-stage');
        this.loadingEl = overlay.querySelector('.vr-loading');
        this.hintEl = overlay.querySelector('.vr-hint');
        this.xrBtn = overlay.querySelector('.vr-xr-btn');
        this.gyroBtn = overlay.querySelector('.vr-gyro-btn');
        this.cardboardBtn = overlay.querySelector('.vr-cardboard-btn');

        overlay.querySelector('.vr-close-btn').onclick = () => VRViewer.close();
        this.gyroBtn.onclick = () => this._toggleGyro();
        this.cardboardBtn.onclick = () => this._toggleCardboard();

        overlay.querySelectorAll('[data-projection]').forEach(btn => {
            btn.onclick = () => this._setProjection(btn.getAttribute('data-projection'));
        });
        overlay.querySelectorAll('[data-stereo]').forEach(btn => {
            btn.onclick = () => this._setStereo(btn.getAttribute('data-stereo'));
        });

        this._syncSegButtons();

        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                // Esc в VR закрывает именно VR, а не полноэкранный просмотр
                // под ним — поэтому событие дальше не пускаем.
                e.stopPropagation();
                VRViewer.close();
            }
        };
        document.addEventListener('keydown', this._escHandler, true);
    }

    _syncSegButtons() {
        if (!this.overlay) return;
        this.overlay.querySelectorAll('[data-projection]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-projection') === this.projection);
        });
        this.overlay.querySelectorAll('[data-stereo]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-stereo') === this.stereo);
        });
    }

    _showFatal(err) {
        if (!this.overlay) return;
        if (this.loadingEl) {
            this.loadingEl.innerHTML = `
                <div class="vr-fatal">
                    <div class="vr-fatal-title">Не удалось открыть VR-просмотр</div>
                    <div class="vr-fatal-text">${(err && err.message) ? String(err.message).slice(0, 200) : 'Неизвестная ошибка'}</div>
                </div>
            `;
            this.loadingEl.classList.add('vr-loading--error');
        }
    }

    // ---------- Инициализация сцены ----------

    async _init() {
        this._buildOverlay();

        const THREE = await loadThree();
        this.three = THREE;
        if (!this.overlay || !this.overlay.isConnected) return; // успели закрыть

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.stage.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(this.fov, window.innerWidth / window.innerHeight, 0.1, 1100);
        this.camera.position.set(0, 0, 0.01);
        // Слой 1 — «левый глаз»: то, что видно и в обычном окне, и левым
        // глазом в шлеме. Слой 2 — правый глаз, в оконном режиме он не нужен.
        this.camera.layers.enable(1);

        await this._loadMedia();
        this._buildMeshes();
        this._bindControls();
        // Кнопка гироскопа есть всегда. Прятать её по «доступности» датчика
        // оказалось плохой идеей: пользователь просто не находит кнопку и не
        // понимает, куда она делась. Пусть лучше будет на месте и сама
        // объяснит одной строкой, если датчик недоступен (см. _toggleGyro).
        if (this.gyroBtn) this.gyroBtn.hidden = false;
        await this._setupXR();

        if (this.loadingEl) this.loadingEl.remove();
        this._startLoop();
    }

    async _loadMedia() {
        const THREE = this.three;
        const post = this.post;
        const ext = (post.file_url || '').split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'webm', 'mov'].includes(ext);

        if (isVideo) {
            const video = document.createElement('video');
            video.src = proxyUrl(post.file_url);
            video.loop = true;
            video.playsInline = true;
            video.preload = 'auto';
            const savedVol = localStorage.getItem('r34_default_volume');
            video.volume = savedVol !== null ? (parseFloat(savedVol) || 50) / 100 : 0.5;
            this.mediaEl = video;

            await new Promise((resolve, reject) => {
                video.onloadeddata = resolve;
                video.onerror = () => reject(new Error('Видео не загрузилось'));
            });
            // Режим открывается по клику пользователя, так что автозапуск
            // со звуком здесь разрешён политикой браузера.
            video.play().catch(() => {});
            this.texture = new THREE.VideoTexture(video);
        } else {
            const url = post.file_url || post.sample_url || post.preview_url;
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Изображение не загрузилось'));
                img.src = proxyUrl(url);
            });
            this.mediaEl = image;
            this.texture = new THREE.Texture(image);
            this.texture.needsUpdate = true;
        }

        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.generateMipmaps = false;
        this.texture.minFilter = THREE.LinearFilter;
    }

    _geometry() {
        const THREE = this.three;
        // Сфера с вывернутыми нормалями — смотрим на неё изнутри.
        // Для 180° берём переднюю половину. phiStart=0, phiLength=PI — это
        // ровно та половина, что расположена по центру взгляда камеры по
        // умолчанию (она смотрит в +Z). Со сдвигом на PI/2 полусфера
        // оказывалась сбоку, и прямо перед глазами была чёрная пустота.
        const geo = this.projection === '180'
            ? new THREE.SphereGeometry(500, 60, 40, 0, Math.PI)
            : new THREE.SphereGeometry(500, 60, 40);
        geo.scale(-1, 1, 1);
        return geo;
    }

    _eyeTexture(eye) {
        // Стерео-панорамы хранят два ракурса в одном кадре: бок-о-бок (sbs)
        // или сверху-вниз (tb). Каждому глазу отдаём свою половину кадра;
        // в моно-режиме — весь кадр целиком.
        const tex = this.texture.clone();
        tex.needsUpdate = true;
        if (this.stereo === 'sbs') {
            tex.repeat.set(0.5, 1);
            tex.offset.set(eye === 'right' ? 0.5 : 0, 0);
        } else if (this.stereo === 'tb') {
            tex.repeat.set(1, 0.5);
            tex.offset.set(0, eye === 'right' ? 0 : 0.5);
        }
        return tex;
    }

    _buildMeshes() {
        const THREE = this.three;
        this._disposeMeshes();

        const eyes = this.stereo === 'mono' ? ['left'] : ['left', 'right'];
        eyes.forEach(eye => {
            const material = new THREE.MeshBasicMaterial({ map: this._eyeTexture(eye) });
            const mesh = new THREE.Mesh(this._geometry(), material);
            // В шлеме three.js рисует левый глаз камерой со слоем 1,
            // правый — со слоем 2. В обычном окне включён только слой 1.
            mesh.layers.set(eye === 'right' ? 2 : 1);
            this.scene.add(mesh);
            this.meshes.push(mesh);
        });
    }

    _disposeMeshes() {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
        });
        this.meshes = [];
    }

    _setProjection(projection) {
        if (!VR_PROJECTIONS.includes(projection) || projection === this.projection) return;
        this.projection = projection;
        this._syncSegButtons();
        // У 180° картинка есть только в передней половине. Если пользователь
        // перед переключением отвернулся, он упрётся взглядом в пустоту и
        // решит, что режим сломан — поэтому возвращаем взгляд в центр.
        this.lon = 0;
        this.lat = 0;
        if (this.scene) this._buildMeshes();
        if (this.onChangeSettings) this.onChangeSettings({ projection: this.projection, stereo: this.stereo });
    }

    _setStereo(stereo) {
        if (!VR_STEREO_MODES.includes(stereo) || stereo === this.stereo) return;
        this.stereo = stereo;
        this._syncSegButtons();
        if (this.scene) this._buildMeshes();
        // В режиме очков правый глаз показывает слой 2 только если исходник
        // действительно стерео; для моно оба глаза берут один и тот же слой.
        if (this.cameraR) {
            this.cameraR.layers.disableAll();
            this.cameraR.layers.enable(0);
            this.cameraR.layers.enable(this.stereo === 'mono' ? 1 : 2);
        }
        if (this.onChangeSettings) this.onChangeSettings({ projection: this.projection, stereo: this.stereo });
    }

    // ---------- Управление ----------

    _bindControls() {
        const el = this.renderer.domElement;

        this._onPointerDown = (e) => {
            this._dragging = true;
            this._lastPointer = { x: e.clientX, y: e.clientY };
            el.setPointerCapture?.(e.pointerId);
        };
        this._onPointerMove = (e) => {
            if (!this._dragging) return;
            const dx = e.clientX - this._lastPointer.x;
            const dy = e.clientY - this._lastPointer.y;
            this._lastPointer = { x: e.clientX, y: e.clientY };
            // Тянем «за сцену»: курсор влево — панорама уезжает влево.
            this.lon -= dx * 0.12;
            this.lat += dy * 0.12;
            this.lat = Math.max(-85, Math.min(85, this.lat));
        };
        this._onPointerUp = (e) => {
            this._dragging = false;
            el.releasePointerCapture?.(e.pointerId);
        };
        this._onWheel = (e) => {
            e.preventDefault();
            // Верхняя граница широкая (120°): на непанорамном материале узкий
            // угол выглядит так, будто картинку обрезали, и надо иметь
            // возможность «отъехать» и увидеть кадр целиком.
            this.fov = Math.max(30, Math.min(120, this.fov + Math.sign(e.deltaY) * 3));
            [this.camera, this.cameraL, this.cameraR].forEach(cam => {
                if (!cam) return;
                cam.fov = this.fov;
                cam.updateProjectionMatrix();
            });
        };
        this._onResize = () => {
            if (!this.renderer) return;
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            // В режиме очков каждому глазу достаётся половина ширины, поэтому
            // у их камер своё соотношение сторон.
            [this.cameraL, this.cameraR].forEach(cam => {
                if (!cam) return;
                cam.aspect = (window.innerWidth / 2) / window.innerHeight;
                cam.updateProjectionMatrix();
            });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        };
        // Поворот телефона — отдельная история: мобильные браузеры успевают
        // прислать resize/orientationchange ДО того, как пересчитают размеры
        // вьюпорта, и канвас остаётся растянутым по старой стороне экрана.
        // Поэтому после поворота пересчитываем размер ещё раз, уже с
        // задержкой, когда браузер точно сообщает актуальные значения.
        this._onOrientationChange = () => {
            this._onResize();
            setTimeout(this._onResize, 250);
            setTimeout(this._onResize, 600);
        };

        el.addEventListener('pointerdown', this._onPointerDown);
        el.addEventListener('pointermove', this._onPointerMove);
        el.addEventListener('pointerup', this._onPointerUp);
        el.addEventListener('pointercancel', this._onPointerUp);
        el.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('resize', this._onResize);
        window.addEventListener('orientationchange', this._onOrientationChange);
        if (window.screen && window.screen.orientation) {
            window.screen.orientation.addEventListener('change', this._onOrientationChange);
        }
    }

    // ---------- Гироскоп ----------

    // Кнопка гироскопа показывается везде, где браузер вообще знает про
    // DeviceOrientationEvent. Раньше здесь была догадка по типу указателя
    // ((pointer: coarse) и т.п.), но она врёт в обе стороны: ноутбук с
    // сенсорным экраном датчика не имеет, а телефон с подключённой мышью
    // рапортует «точный» указатель — и кнопка исчезала там, где нужна.
    // Вместо угадывания устройства проверяем факт: включили и смотрим,
    // приходят ли данные (см. _enableGyro).
    _gyroAvailable() {
        return typeof window.DeviceOrientationEvent !== 'undefined';
    }

    async _toggleGyro() {
        if (this.gyroEnabled) {
            this._disableGyro();
            return;
        }
        // Браузер вырезает датчики движения на «недоверенных» адресах
        // (обычный http:// на 192.168.x.x) — самого DeviceOrientationEvent
        // там нет. Говорим об этом одной строкой в момент нажатия, а не
        // прячем кнопку и не пугаем баннером на пол-экрана.
        if (!this._gyroAvailable()) {
            this._setHint('Гироскоп недоступен: браузер даёт датчики только по https:// или на localhost');
            return;
        }
        // iOS с 13-й версии отдаёт данные датчиков только после явного
        // разрешения, причём запрашивать его можно исключительно из
        // обработчика реального жеста пользователя — отсюда и кнопка.
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const res = await DeviceOrientationEvent.requestPermission();
                if (res !== 'granted') {
                    this._setHint('Доступ к датчикам не разрешён');
                    return;
                }
            } catch (err) {
                this._setHint('Не удалось включить гироскоп');
                return;
            }
        }
        this._enableGyro();
    }

    _enableGyro() {
        this._onDeviceOrientation = (e) => {
            // Пока событий нет (или прилетают пустые), остаёмся на ручном
            // управлении — иначе камера рывком уедет в нули.
            if (e.alpha === null && e.beta === null && e.gamma === null) return;
            this._deviceOrientation = e;
            if (this._gyroProbeTimer) {
                clearTimeout(this._gyroProbeTimer);
                this._gyroProbeTimer = null;
            }
        };
        this._onScreenOrientation = () => {
            const angle = (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number')
                ? window.screen.orientation.angle
                : (window.orientation || 0);
            this._screenOrientationAngle = angle;
        };
        this._onScreenOrientation();
        window.addEventListener('deviceorientation', this._onDeviceOrientation);
        window.addEventListener('orientationchange', this._onScreenOrientation);

        this.gyroEnabled = true;
        this.gyroBtn.classList.add('active');
        this._setHint('Гироскоп включён — поворачивайте телефон');

        // Десктопные браузеры объявляют DeviceOrientationEvent, но никогда не
        // присылают данные. Вместо гадания по типу устройства просто ждём
        // первое событие: не пришло за полторы секунды — честно сообщаем, что
        // датчика нет, и возвращаем ручное управление.
        if (this._gyroProbeTimer) clearTimeout(this._gyroProbeTimer);
        this._gyroProbeTimer = setTimeout(() => {
            this._gyroProbeTimer = null;
            if (this.gyroEnabled && !this._deviceOrientation) {
                this._disableGyro();
                this._setHint('Гироскоп недоступен на этом устройстве');
            }
        }, 1500);
    }

    _disableGyro() {
        if (this._gyroProbeTimer) {
            clearTimeout(this._gyroProbeTimer);
            this._gyroProbeTimer = null;
        }
        if (this._onDeviceOrientation) {
            window.removeEventListener('deviceorientation', this._onDeviceOrientation);
            this._onDeviceOrientation = null;
        }
        if (this._onScreenOrientation) {
            window.removeEventListener('orientationchange', this._onScreenOrientation);
            this._onScreenOrientation = null;
        }
        this._deviceOrientation = null;
        this.gyroEnabled = false;
        if (this.gyroBtn) this.gyroBtn.classList.remove('active');
        this._setHint('Тяните мышью или пальцем, чтобы осмотреться · колесо — приблизить');
    }

    _setHint(text) {
        if (this.hintEl) this.hintEl.textContent = text;
    }

    // Стандартная раскладка из three.js DeviceOrientationControls: данные
    // датчика (alpha/beta/gamma) — это углы Эйлера в порядке YXZ, которые
    // нужно довернуть на -90° по X (телефон смотрит «вперёд», а не «в пол»)
    // и на текущий угол поворота экрана.
    _applyGyroToCamera(camera) {
        const THREE = this.three;
        const d = this._deviceOrientation;
        if (!d) return false;
        const alpha = THREE.MathUtils.degToRad(d.alpha || 0);
        const beta = THREE.MathUtils.degToRad(d.beta || 0);
        const gamma = THREE.MathUtils.degToRad(d.gamma || 0);
        const orient = THREE.MathUtils.degToRad(this._screenOrientationAngle || 0);

        if (!this._gyroEuler) {
            this._gyroEuler = new THREE.Euler();
            this._gyroQ0 = new THREE.Quaternion();
            this._gyroQ1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
            this._gyroZee = new THREE.Vector3(0, 0, 1);
        }
        this._gyroEuler.set(beta, alpha, -gamma, 'YXZ');
        camera.quaternion.setFromEuler(this._gyroEuler);
        camera.quaternion.multiply(this._gyroQ1);
        camera.quaternion.multiply(this._gyroQ0.setFromAxisAngle(this._gyroZee, -orient));
        return true;
    }

    // ---------- Режим «очков» (split-screen) ----------

    _toggleCardboard() {
        this.cardboard = !this.cardboard;
        this.cardboardBtn.classList.toggle('active', this.cardboard);
        if (this.cardboard) {
            const THREE = this.three;
            // Каждому глазу — своя камера: половина ширины экрана и свой слой,
            // поэтому при стерео-исходнике левый глаз видит левый ракурс, а
            // правый — правый. Именно так и делают «картонные» VR-режимы.
            this.cameraL = new THREE.PerspectiveCamera(this.fov, (window.innerWidth / 2) / window.innerHeight, 0.1, 1100);
            this.cameraR = new THREE.PerspectiveCamera(this.fov, (window.innerWidth / 2) / window.innerHeight, 0.1, 1100);
            this.cameraL.layers.enable(1);
            // Если исходник моно, правого ракурса нет — показываем оба глаза
            // одной и той же картинкой, иначе правая половина будет чёрной.
            this.cameraR.layers.enable(this.stereo === 'mono' ? 1 : 2);
            this._setHint('Режим очков: вставьте телефон в VR-очки. Гироскоп — кнопкой сверху');
        } else {
            this.cameraL = null;
            this.cameraR = null;
            this.renderer.setScissorTest(false);
            this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
            this._setHint('Тяните мышью или пальцем, чтобы осмотреться · колесо — приблизить');
        }
    }

    async _setupXR() {
        if (!navigator.xr || !this.xrBtn) return;
        let supported = false;
        try {
            supported = await navigator.xr.isSessionSupported('immersive-vr');
        } catch (e) {
            supported = false;
        }
        if (!supported) return;

        this.xrBtn.hidden = false;
        this.xrBtn.onclick = async () => {
            try {
                const session = await navigator.xr.requestSession('immersive-vr', {
                    optionalFeatures: ['local-floor', 'bounded-floor']
                });
                this._xrSession = session;
                session.addEventListener('end', () => {
                    this._xrSession = null;
                    this.xrBtn.textContent = 'Войти в VR';
                });
                await this.renderer.xr.setSession(session);
                this.xrBtn.textContent = 'Выйти из VR';
            } catch (err) {
                console.error('[VR] WebXR-сессия не открылась:', err);
            }
        };
    }

    _aimCamera(camera) {
        const THREE = this.three;
        // Гироскоп, если включён и уже прислал данные, иначе — ручной поворот.
        if (this.gyroEnabled && this._applyGyroToCamera(camera)) return;
        if (!this._aimTarget) this._aimTarget = new THREE.Vector3();
        const phi = THREE.MathUtils.degToRad(90 - this.lat);
        const theta = THREE.MathUtils.degToRad(this.lon);
        this._aimTarget.setFromSphericalCoords(1, phi, theta);
        camera.lookAt(this._aimTarget);
    }

    _startLoop() {
        this.renderer.setAnimationLoop(() => {
            if (!this.renderer) return;

            // В шлеме ориентацию задаёт сам WebXR — крутить камеру руками
            // тогда нельзя, иначе картинка будет драться с трекингом головы.
            if (this.renderer.xr.isPresenting) {
                this.renderer.render(this.scene, this.camera);
                return;
            }

            if (this.cardboard && this.cameraL && this.cameraR) {
                const w = window.innerWidth;
                const h = window.innerHeight;
                const halfW = Math.floor(w / 2);
                this._aimCamera(this.cameraL);
                this.cameraR.quaternion.copy(this.cameraL.quaternion);

                this.renderer.setScissorTest(true);

                this.renderer.setViewport(0, 0, halfW, h);
                this.renderer.setScissor(0, 0, halfW, h);
                this.renderer.render(this.scene, this.cameraL);

                this.renderer.setViewport(halfW, 0, w - halfW, h);
                this.renderer.setScissor(halfW, 0, w - halfW, h);
                this.renderer.render(this.scene, this.cameraR);
                return;
            }

            this._aimCamera(this.camera);
            this.renderer.render(this.scene, this.camera);
        });
    }

    _destroy() {
        this._disableGyro();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler, true);
            this._escHandler = null;
        }
        if (this._xrSession) {
            try { this._xrSession.end(); } catch (e) {}
            this._xrSession = null;
        }
        if (this.renderer) {
            this.renderer.setAnimationLoop(null);
            const el = this.renderer.domElement;
            el.removeEventListener('pointerdown', this._onPointerDown);
            el.removeEventListener('pointermove', this._onPointerMove);
            el.removeEventListener('pointerup', this._onPointerUp);
            el.removeEventListener('pointercancel', this._onPointerUp);
            el.removeEventListener('wheel', this._onWheel);
            window.removeEventListener('resize', this._onResize);
            window.removeEventListener('orientationchange', this._onOrientationChange);
            if (window.screen && window.screen.orientation) {
                window.screen.orientation.removeEventListener('change', this._onOrientationChange);
            }
        }
        if (this.scene) this._disposeMeshes();
        if (this.texture) {
            this.texture.dispose();
            this.texture = null;
        }
        if (this.mediaEl && this.mediaEl.tagName === 'VIDEO') {
            this.mediaEl.pause();
            this.mediaEl.removeAttribute('src');
            this.mediaEl.load();
        }
        this.mediaEl = null;
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        this.scene = null;
        this.camera = null;
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.onClose) {
            const cb = this.onClose;
            this.onClose = null;
            try { cb(); } catch (e) { console.error('[VR] Ошибка в onClose:', e); }
        }
    }
}
