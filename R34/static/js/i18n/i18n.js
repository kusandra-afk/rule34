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

let currentLanguage = 'ru';
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
    [/^Загрузка (\d+)%$/, (m) => `Loading ${m[1]}%`]
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

// Новые узлы копятся и переводятся пачкой в одном кадре: на телефоне
// перерисовка карточек пачками заметно дешевле, чем по одной мутации.
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
    if (!pendingFrame) pendingFrame = requestAnimationFrame(flushPending);
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
            /* офлайн — остаёмся на русском */
        }
    }

    currentLanguage = SUPPORTED.includes(lang) ? lang : 'ru';
    document.documentElement.lang = currentLanguage;

    if (currentLanguage === 'en') {
        applyLanguage(document.body);
        startObserver();
    }
    return currentLanguage;
}

// Удобно для отладки и для страниц без модулей
window.r34i18n = { t, setLanguage, getLanguage, applyLanguage, initI18n };
