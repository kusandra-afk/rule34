/**
 * Локализация интерфейса (RU / EN).
 *
 * Как это устроено: словарь в locales/en.js хранит пары «русский текст →
 * английский». Перевод применяется к уже отрисованному DOM — к текстовым узлам
 * и к атрибутам placeholder/title/aria-label/alt. Так не нужно переписывать
 * разметку и модули: новый экран на русском автоматически получает английскую
 * версию, если его фразы есть в словаре.
 *
 * Динамика (тосты, карточки, пазл) подхватывается MutationObserver'ом, поэтому
 * переведённые фразы появляются и в только что добавленных элементах.
 *
 * Выбранный язык хранится в localStorage (r34_language) и синхронизируется с
 * сервером через /api/settings и /api/app-language: при следующем запуске
 * сервер уже знает выбор и не спрашивает язык.
 */

import { EN } from './locales/en.js';

const STORAGE_KEY = 'r34_language';
const SUPPORTED = ['ru', 'en'];

let currentLanguage = 'en';
let observer = null;
let observerStarted = false;

const textOriginals = new Map(); // Text node -> исходный (русский) текст
const attrOriginals = new Map(); // Element -> { attr: исходное значение }

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);
const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function normalize(value) {
    return String(value).replace(/\s+/g, ' ').trim();
}

function hasCyrillic(value) {
    return /[А-Яа-яЁё]/.test(value);
}

/** Небольшой набор правил для строк с числами: словарём их не перевести. */
const PATTERNS = [
    [/^Найдено ([\d\s.,]+) публикаци[йия] • Страница (\d+) из (\d+)$/, (m) => `Found ${m[1]} posts • Page ${m[2]} of ${m[3]}`],
    [/^(\d+) результат(?:ов|а)?$/, (m) => `${m[1]} ${Number(m[1]) === 1 ? 'result' : 'results'}`],
    [/^Всего постов в избранном: (\d+)$/, (m) => `Total favorites: ${m[1]}`],
    [/^Всего постов в избранном: (\d+)$/, (m) => `Total favorites: ${m[1]}`],
    [/^Собрано всей командой: (\d+)$/, (m) => `Collected by the team: ${m[1]}`],
    [/^Теги: (\d+)$/, (m) => `Tags: ${m[1]}`],
    [/^Раунд (\d+) · До победы: (\d+)$/, (m) => `Round ${m[1]} · To win: ${m[2]}`],
    [/^Победитель: (.+)$/, (m) => `Winner: ${m[1]}`],
    [/^Участники \((\d+)\)$/, (m) => `Players (${m[1]})`],
    [/^Решено пазлов: (\d+)$/, (m) => `Puzzles solved: ${m[1]}`],
    [/^Загрузка (\d+)%$/, (m) => `Loading ${m[1]}%`],
    // «16 деталей (4x4)» — подписи сложности в выпадающих списках лобби
    [/^(\d+) деталей \((\d+)x(\d+)\)$/, (m) => `${m[1]} pieces (${m[2]}x${m[3]})`],
    [/^(\d+) деталь \((\d+)x(\d+)\)$/, (m) => `${m[1]} piece (${m[2]}x${m[3]})`],
    [/^(\d+) деталей$/, (m) => `${m[1]} pieces`],
    [/^(\d+) деталь$/, (m) => `${m[1]} piece`],

    // Подстановки: числа, имена игроков, названия действий
    [/^(\d+) столб\.$/, (m) => `${m[1]} cols`],
    [/^(\d+) подряд$/, (m) => `${m[1]} in a row`],
    [/^(\d+):(\d+) \((\d+)х\)$/, (m) => `${m[1]}:${m[2]} (${m[3]} moves)`],
    [/^(\d+)x(\d+) \((\d+) дет\.\)$/, (m) => `${m[1]}x${m[2]} (${m[3]} pcs)`],
    [/^(\d+) вариант\(ов\)$/, (m) => `${m[1]} ${Number(m[1]) === 1 ? 'variant' : 'variants'}`],
    [/^(Рекорд|Опубликовано|Теги|Карточек|Отрисовано|Видео|Предзагрузка|Загрузка): (.+)$/, (m) => {
        const labels = { 'Рекорд': 'Record', 'Опубликовано': 'Published', 'Теги': 'Tags', 'Карточек': 'Cards',
            'Отрисовано': 'Rendered', 'Видео': 'Videos', 'Предзагрузка': 'Preload', 'Загрузка': 'Loading' };
        return `${labels[m[1]]}: ${m[2]}`;
    }],
    [/^Рекорд: (.*)$/, (m) => `Record: ${m[1]}`],
    [/^Загрузка: (.+)$/, (m) => `Loading: ${m[1]}`],
    [/^Загрузка #(.+)\.\.\.$/, (m) => `Loading #${m[1]}...`],
    [/^Очищено \((.+)\)$/, (m) => `Cleared (${m[1]})`],
    [/^Всего постов в избранном: (.+)$/, (m) => `Total favorites: ${m[1]}`],
    [/^Собрано всей командой: (.+)$/, (m) => `Collected by the team: ${m[1]}`],
    [/^Раунд (\d+) · До победы:$/, (m) => `Round ${m[1]} · To win:`],
    [/^Раунд (\d+) &middot; До победы:$/, (m) => `Round ${m[1]} · To win:`],
    [/^Комната ([\w-]+)$/, (m) => `Room ${m[1]}`],
    [/^При такой ширине экрана отображается не больше (\d+) колонок$/, (m) => `At this window width no more than ${m[1]} columns fit`],
    [/^Ваш экран слишком мал для (\d+) колонок — сейчас доступно максимум (\d+)$/, (m) => `Your screen is too small for ${m[1]} columns — the maximum is ${m[2]}`],
    [/^Нажмите на поиск (.+) для загрузки медиа$/, (m) => `Tap search ${m[1]} to load media`],
    [/^Safe Screen • Нажмите (.+) или Esc, чтобы выйти$/, (m) => `Safe Screen • Press ${m[1]} or Esc to exit`],
    [/^\[VR\] Не удалось загрузить модуль панорамного просмотра: (.+)$/, (m) => `[VR] Failed to load the panorama viewer module: ${m[1]}`],
    [/^Верно! У (.+) (больше|меньше)$/, (m) => `Correct! ${m[1]} has ${m[2] === 'больше' ? 'more' : 'less'}`],
    [/^Мимо! У (.+) (больше|меньше)$/, (m) => `Missed! ${m[1]} has ${m[2] === 'больше' ? 'more' : 'less'}`],
    [/^Серия оборвалась на (.+)$/, (m) => `Streak ended at ${m[1]}`],

    // Онлайн-лобби: имена игроков и названия действий приходят из шаблона.
    [/^Игрок "(.+)" (вошёл|вошел) в лобби$/, (m) => `Player "${m[1]}" joined the lobby`],
    [/^Игрок (.+) (вошёл|вошел) в лобби$/, (m) => `Player ${m[1]} joined the lobby`],
    [/^Игрок "(.+)" покинул лобби$/, (m) => `Player "${m[1]}" left the lobby`],
    [/^Игрок (.+) покинул лобби$/, (m) => `Player ${m[1]} left the lobby`],
    [/^Игрок "(.+)" (подключился к игре|вышел из игры)$/, (m) => `Player "${m[1]}" ${m[2] === 'подключился к игре' ? 'joined the game' : 'left the game'}`],
    [/^Игрок "(.+)" сдался \(автосбор\)$/, (m) => `Player "${m[1]}" gave up (auto-solve)`],
    [/^Игрок "(.+)" первым собрал пазл!$/, (m) => `Player "${m[1]}" finished the puzzle first!`],
    [/^Игрок (.+) хочет (.+) пазл\. Вы согласны\?$/, (m) => {
        const action = /ПЕРЕЗАПУСТИТЬ|перезапуск/.test(m[2]) ? 'restart' : 'auto-solve';
        return `Player ${m[1]} wants to ${action} the puzzle. Do you agree?`;
    }],
    [/^ПОБЕДА! Вы первым собрали пазл за (.+)!$/, (m) => `VICTORY! You finished the puzzle first in ${m[1]}!`],
    [/^Игра началась! Режим: (.+)$/, (m) => `Game started! Mode: ${m[1] === 'Совместный сбор' ? 'team build' : 'speed race'}`],
    [/^Запрос на (.+)\.\.\.$/, (m) => `Request: ${m[1] === 'перезапуск' ? 'restart' : 'auto-solve'}...`],
    [/^⌛ Запрос на (.+) отправлен команде\.\.\.$/, (m) => `⌛ Sent to the team: ${m[1] === 'перезапуск' ? 'restart' : 'auto-solve'}...`],
    [/^Действие (.+) одобрено (всеми|командой)!$/, (m) => `Approved: ${m[1] === 'перезапуск' ? 'restart' : 'auto-solve'}!`],
    [/^Уже идет голосование за (.+)$/, (m) => `A vote is already running for ${m[1] === 'перезапуск' ? 'restart' : 'auto-solve'}`],
    [/^Комната (.+) закрыта\. Соединение отключено\.$/, (m) => `Room ${m[1]} closed. Connection closed.`],
    [/^Вы покинули комнату (.+)\. Соединение отключено\.$/, (m) => `You left room ${m[1]}. Connection closed.`],
    [/^Подключаемся к комнате (.+)\.\.\.$/, (m) => `Connecting to room ${m[1]}...`],
    [/^ID пазла (\d+) скопирован!$/, (m) => `Puzzle ID ${m[1]} copied!`],
    [/^🏁 Гонка на скорость \((.+)\)$/, (m) => `🏁 Speed race (${m[1]})`],
    [/^🤝 Совместная сборка \((.+)\)$/, (m) => `🤝 Team build (${m[1]})`],
    [/^Собрано всей командой: (\d+) \/ (\d+) \((\d+)%\)$/, (m) => `Collected by the team: ${m[1]} / ${m[2]} (${m[3]}%)`],
    [/^Вы собрали пазл \((\d+) дет\.\) за (.+)$/, (m) => `You solved the puzzle (${m[1]} pcs) in ${m[2]}`],

    // Догоняющие правила: ошибка Turso, вкладка варианта пазла и процент
    // игрока в итоговой таблице гонки.
    [/^Код ответа (\d+) (.+)$/, (m) => `Response code ${m[1]} ${m[2]}`],
    [/^(.+) • (\d+) ходов$/, (m) => `${m[1]} • ${m[2]} moves`],
    [/^(\d+)% \((\d+) ходов\)$/, (m) => `${m[1]}% (${m[2]} moves)`]
];

function translateString(text) {
    if (!text || !hasCyrillic(text)) return null;
    const key = normalize(text);
    if (!key) return null;

    const direct = EN[key];
    if (direct) return direct;

    for (const [re, make] of PATTERNS) {
        const match = key.match(re);
        if (match) return make(match);
    }
    return null;
}

/** Сохраняет окружающие пробелы/переносы: иначе слова слипаются с соседними тегами. */
function withOriginalSpacing(original, translated) {
    const lead = (original.match(/^\s*/) || [''])[0];
    const trail = (original.match(/\s*$/) || [''])[0];
    return lead + translated + trail;
}

function translateTextNode(node) {
    const parent = node.parentNode;
    if (parent && parent.tagName && SKIP_TAGS.has(parent.tagName)) return;

    if (!textOriginals.has(node)) {
        const original = node.nodeValue;
        if (!original || !hasCyrillic(original)) return;
        const translated = translateString(original);
        if (translated === null) return;
        textOriginals.set(node, original);
        node.nodeValue = withOriginalSpacing(original, translated);
        return;
    }

    // Значение уже переведено раньше: держим его в актуальном языке.
    const original = textOriginals.get(node);
    if (currentLanguage === 'en') {
        const translated = translateString(original);
        if (translated === null) return;
        const value = withOriginalSpacing(original, translated);
        if (node.nodeValue !== value) node.nodeValue = value;
    } else if (node.nodeValue !== original) {
        node.nodeValue = original;
    }
}

function translateAttributes(el) {
    if (!el.getAttributeNames) return;
    let stored = attrOriginals.get(el);
    for (const attr of TRANSLATED_ATTRS) {
        const value = el.getAttribute(attr);
        if (value === null || !hasCyrillic(value) && !(stored && stored[attr])) continue;
        if (!stored) {
            stored = {};
            attrOriginals.set(el, stored);
        }
        if (!(attr in stored)) {
            if (!hasCyrillic(value)) continue;
            const translated = translateString(value);
            if (translated === null) continue;
            stored[attr] = value;
            if (currentLanguage === 'en') el.setAttribute(attr, translated);
        } else if (currentLanguage === 'en') {
            const translated = translateString(stored[attr]);
            if (translated !== null) el.setAttribute(attr, translated);
        } else {
            el.setAttribute(attr, stored[attr]);
        }
    }
}

/** Переводит поддерево (или весь документ) на текущий язык. */
export function applyLanguage(root = document.body) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root);
        return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    if (root.nodeType === Node.ELEMENT_NODE) {
        if (SKIP_TAGS.has(root.tagName)) return;
        translateAttributes(root);
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (SKIP_TAGS.has(node.tagName)) {
                // Пропускаем всё содержимое script/style
                node = walker.nextSibling();
                continue;
            }
            translateAttributes(node);
        } else {
            translateTextNode(node);
        }
        node = walker.nextNode();
    }
}

// Новые узлы копятся и переводятся пачкой в одной задаче: на телефоне
// перерисовка карточек пачками заметно дешевле, чем по одной мутации.
// Таймер, а не requestAnimationFrame: в фоновой вкладке rAF не вызывается
// вообще, и добавленные там карточки оставались бы на русском до возврата
// в вкладку.
let pendingNodes = null;
let pendingFrame = 0;

function flushPending() {
    pendingFrame = 0;
    const nodes = pendingNodes;
    pendingNodes = null;
    if (!nodes || currentLanguage !== 'en') return;
    for (const node of nodes) {
        if (!node.isConnected) continue;
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (!SKIP_TAGS.has(node.tagName)) applyLanguage(node);
        } else if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node);
        }
    }
}

function queueNode(node) {
    if (!pendingNodes) pendingNodes = new Set();
    pendingNodes.add(node);
    if (!pendingFrame) pendingFrame = setTimeout(flushPending, 0);
}

function startObserver() {
    if (observerStarted || !document.body) return;
    observerStarted = true;
    observer = new MutationObserver((mutations) => {
        if (currentLanguage !== 'en') return;
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                queueNode(mutation.target);
                continue;
            }
            for (const added of mutation.addedNodes) {
                if (added.nodeType === Node.ELEMENT_NODE || added.nodeType === Node.TEXT_NODE) {
                    queueNode(added);
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function getLanguage() {
    return currentLanguage;
}

/** Тег локали для toLocaleString/toLocaleDateString под текущий язык. */
export function localeTag() {
    return currentLanguage === 'ru' ? 'ru-RU' : 'en-US';
}

/**
 * Перевод строки из JS. Принимает русский оригинал: если языка нет в словаре,
 * возвращается исходный текст — так ничего не ломается.
 */
export function t(text, vars) {
    let out = text;
    if (currentLanguage === 'en') {
        const translated = translateString(text);
        if (translated !== null) out = translated;
    }
    if (vars) {
        for (const [key, value] of Object.entries(vars)) {
            out = out.replaceAll(`{${key}}`, String(value));
        }
    }
    return out;
}

async function persistLanguage(lang, notifyServer = true) {
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
        /* приватный режим — не критично */
    }
    if (notifyServer) {
        try {
            await fetch('/api/app-language', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lang })
            });
        } catch (e) {
            /* сервер может быть недоступен — выбор всё равно сохранён локально */
        }
    }
}

/** Мгновенно переключает язык без перезагрузки страницы. */
export async function setLanguage(lang, options = {}) {
    if (!SUPPORTED.includes(lang)) return currentLanguage;
    if (lang === currentLanguage) {
        await persistLanguage(lang, options.notifyServer !== false);
        return currentLanguage;
    }

    currentLanguage = lang;
    document.documentElement.lang = lang;

    applyLanguage(document.body);
    if (lang === 'en') startObserver();

    await persistLanguage(lang, options.notifyServer !== false);
    document.dispatchEvent(new CustomEvent('r34:language-changed', { detail: { lang } }));
    return currentLanguage;
}

/**
 * Определяет язык при загрузке: сначала сохранённый в браузере, затем
 * сохранённый на сервере (он запоминается при выборе языка на старте сервера).
 */
export async function initI18n() {
    let lang = null;
    try {
        lang = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        lang = null;
    }

    if (!SUPPORTED.includes(lang)) {
        try {
            const response = await fetch('/api/app-language');
            if (response.ok) {
                const data = await response.json();
                if (SUPPORTED.includes(data.lang)) lang = data.lang;
            }
        } catch (e) {
            /* офлайн — остаёмся на английском (язык по умолчанию) */
        }
    }

    currentLanguage = SUPPORTED.includes(lang) ? lang : 'en';
    document.documentElement.lang = currentLanguage;

    if (currentLanguage === 'en') {
        applyLanguage(document.body);
        startObserver();
    }
    return currentLanguage;
}

// Удобно для отладки и для страниц без модулей
window.r34i18n = { t, setLanguage, getLanguage, applyLanguage, initI18n };
