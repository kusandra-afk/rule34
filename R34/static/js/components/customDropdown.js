// ============================================================
// R34 GALLERY — CUSTOM DROPDOWN COMPONENT
// Создание кастомного, плавающего, полностью стилизованного
// выпадающего списка с анимацией вместо стандартного select
// ============================================================

import { icon } from '../icons.js';

// Один общий scroll/resize-слушатель на все дропдауны с портал-позиционированием,
// вместо отдельной пары слушателей на каждый select (их может быть десяток
// на странице настроек) — та же идея, что уже используется для видео-плееров.
const portalRepositionCallbacks = new Set();
let portalListenersBound = false;
// Сквозной счётчик для уникальных id панелей: они нужны для связки
// aria-controls / aria-activedescendant между кнопкой и списком.
let dropdownSeq = 0;
function ensurePortalListeners() {
    if (portalListenersBound) return;
    portalListenersBound = true;
    const reposition = () => portalRepositionCallbacks.forEach(fn => fn());
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
}

export function makeCustomDropdown(selectEl, { classPrefix = 'game-custom-dropdown', portal = false } = {}) {
    if (!selectEl || selectEl.dataset.customized === 'true') return null;
    selectEl.dataset.customized = 'true';
    selectEl.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = classPrefix;
    // Служебные классы отступов/ширины (например .select-min-150) переносим
    // на обёртку — сам select скрыт и больше не участвует в вёрстке
    selectEl.classList.forEach(cls => {
        if (cls !== 'r34-select' && cls !== 'game-select' && cls !== 'game-input' && cls !== 'puzzle-lib-sort') {
            wrapper.classList.add(cls);
        }
    });

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = `${classPrefix}-trigger`;

    const labelSpan = document.createElement('span');
    const updateTriggerLabel = () => {
        const curOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        labelSpan.textContent = curOpt ? curOpt.textContent : '';
    };
    updateTriggerLabel();

    const arrowSpan = document.createElement('span');
    arrowSpan.className = `${classPrefix}-arrow`;
    arrowSpan.innerHTML = icon('chevronDown', { size: 16 });

    trigger.appendChild(labelSpan);
    trigger.appendChild(arrowSpan);

    const panel = document.createElement('div');
    panel.className = `${classPrefix}-panel`;
    // Панель может уезжать порталом в body — связывать её с кнопкой
    // для читалок нужно через id.
    panel.id = `${classPrefix}-panel-${++dropdownSeq}`;
    panel.setAttribute('role', 'listbox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panel.id);

    // Индекс пункта, на который смотрит клавиатура (не путать с выбранным)
    let activeIndex = -1;

    const renderItems = () => {
        panel.innerHTML = '';
        Array.from(selectEl.options).forEach((opt, idx) => {
            const item = document.createElement('div');
            item.className = `${classPrefix}-item`
                + (idx === selectEl.selectedIndex ? ' selected' : '')
                + (idx === activeIndex ? ' kb-active' : '');
            item.id = `${panel.id}-opt-${idx}`;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', idx === selectEl.selectedIndex ? 'true' : 'false');
            // Задержка каскада появления: не больше 8 шагов, иначе длинный
            // список визуально «догоняет» дольше, чем открывается.
            item.style.setProperty('--i', Math.min(idx, 8));

            const itemText = document.createElement('span');
            itemText.textContent = opt.textContent;
            item.appendChild(itemText);

            if (idx === selectEl.selectedIndex) {
                const checkSpan = document.createElement('span');
                checkSpan.className = `${classPrefix}-item-check`;
                checkSpan.innerHTML = icon('check', { size: 14 });
                item.appendChild(checkSpan);
            }

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectIndex(idx);
            });

            panel.appendChild(item);
        });
    };

    const selectIndex = (idx) => {
        if (idx < 0 || idx >= selectEl.options.length) return;
        const changed = selectEl.selectedIndex !== idx;
        selectEl.selectedIndex = idx;
        selectEl.value = selectEl.options[idx].value;
        updateTriggerLabel();
        if (changed) selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        closePanel();
        renderItems();
    };

    renderItems();

    // В модалках строки настроек используют backdrop-filter, который создаёт
    // собственный контекст наложения — z-index панели тогда работает только
    // внутри своей строки и более поздние строки перекрывают её сверху.
    // Чтобы панель всегда была поверх всего, при открытии переносим её
    // в document.body (портал) и позиционируем fixed-координатами.
    const positionPanel = () => {
        if (!portal) return;
        const rect = trigger.getBoundingClientRect();
        const panelH = Math.min(panel.offsetHeight || 280, 280);
        // Панель не должна уезжать за границу экрана: если внизу места меньше,
        // чем вверху, раскрываем список вверх (иначе у нижних строк настроек
        // последние пункты просто оказывались за краем).
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const openUp = spaceBelow < panelH + 6 && spaceAbove > spaceBelow;
        panel.style.top = openUp
            ? Math.max(8, rect.top - panelH - 6) + 'px'
            : (rect.bottom + 6) + 'px';
        panel.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) + 'px';
        panel.style.width = rect.width + 'px';
        panel.style.minWidth = rect.width + 'px';
        panel.classList.toggle('up', openUp);
    };

    const setExpanded = (open) => {
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) trigger.removeAttribute('aria-activedescendant');
    };

    const closePanel = (refocus = false) => {
        const wasOpen = wrapper.classList.contains('open');
        wrapper.classList.remove('open');
        panel.classList.remove('open');
        activeIndex = -1;
        setExpanded(false);
        if (refocus && wasOpen) trigger.focus();
    };

    const setActive = (idx) => {
        const count = selectEl.options.length;
        if (!count) return;
        activeIndex = ((idx % count) + count) % count;
        Array.from(panel.children).forEach((el, i) => {
            el.classList.toggle('kb-active', i === activeIndex);
        });
        const activeEl = panel.children[activeIndex];
        if (activeEl) {
            trigger.setAttribute('aria-activedescendant', activeEl.id);
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    };

    const openPanel = () => {
        document.querySelectorAll(`.${classPrefix}.open`).forEach(d => {
            if (d !== wrapper) d.classList.remove('open');
        });
        document.querySelectorAll(`.${classPrefix}-panel.open`).forEach(p => {
            if (p !== panel) p.classList.remove('open');
        });
        wrapper.classList.add('open');
        if (portal) document.body.appendChild(panel);
        positionPanel();
        panel.classList.add('open');
        setExpanded(true);
        setActive(selectEl.selectedIndex >= 0 ? selectEl.selectedIndex : 0);
    };

    // Скрытый select() не показывает своё disabled само по себе — его
    // визуально заменяет trigger-кнопка, так что disabled должен быть
    // отражён на ней, иначе спрятанный select можно задизейблить, а кнопка
    // всё равно будет кликабельной и открывающей список.
    const syncDisabledState = () => {
        trigger.disabled = selectEl.disabled;
        trigger.classList.toggle('disabled', selectEl.disabled);
    };
    syncDisabledState();

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectEl.disabled) return;
        if (wrapper.classList.contains('open')) closePanel();
        else openPanel();
    });

    // ── Клавиатура ──
    // Раньше список управлялся только мышью: кнопка получала фокус с Tab,
    // но стрелки/Enter внутри списка не работали, а читалка видела обычную
    // кнопку без связи со списком.
    let typeBuffer = '';
    let typeTimer = null;
    trigger.addEventListener('keydown', (e) => {
        if (selectEl.disabled) return;
        const isOpen = wrapper.classList.contains('open');
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (!isOpen) openPanel(); else setActive(activeIndex + 1);
                return;
            case 'ArrowUp':
                e.preventDefault();
                if (!isOpen) openPanel(); else setActive(activeIndex - 1);
                return;
            case 'Home':
                if (isOpen) { e.preventDefault(); setActive(0); }
                return;
            case 'End':
                if (isOpen) { e.preventDefault(); setActive(selectEl.options.length - 1); }
                return;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (!isOpen) openPanel();
                else if (activeIndex >= 0) selectIndex(activeIndex);
                return;
            case 'Tab':
                if (isOpen) closePanel();
                return;
            case 'Escape':
                if (isOpen) { e.preventDefault(); closePanel(true); }
                return;
        }
        // Быстрый поиск по первым буквам, как в нативном <select>
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            typeBuffer += e.key.toLowerCase();
            clearTimeout(typeTimer);
            typeTimer = setTimeout(() => { typeBuffer = ''; }, 500);
            const opts = Array.from(selectEl.options);
            const found = opts.findIndex(o => o.textContent.trim().toLowerCase().startsWith(typeBuffer));
            if (found !== -1) {
                e.preventDefault();
                if (!isOpen) openPanel();
                setActive(found);
            }
        }
    });

    if (portal) {
        portalRepositionCallbacks.add(() => {
            if (panel.classList.contains('open')) positionPanel();
        });
        ensurePortalListeners();
    }

    wrapper.appendChild(trigger);
    if (!portal) wrapper.appendChild(panel);

    if (selectEl.parentNode) {
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
    }
    if (portal) {
        panel.style.position = 'fixed';
        document.body.appendChild(panel);
        // Портальная панель живёт в document.body и переживает удаление wrapper'а
        // (например, когда модалка, в которой лежал select, удаляется из DOM).
        // Кладём ссылку на неё, чтобы вызывающий код мог явно убрать панель при
        // закрытии модалки — иначе при каждом пересоздании модалки в body будет
        // накапливаться сиротская панель.
        wrapper._portalPanel = panel;
    }

    const onOutsideClick = (e) => {
        if (!wrapper.contains(e.target) && !panel.contains(e.target)) {
            closePanel();
        }
    };
    document.addEventListener('click', onOutsideClick);

    // Esc должен сначала закрыть открытую панель, а не модалку под ней —
    // иначе (например, в настройках, settingsModal.js) Esc закрывает всю
    // модалку, а портальная панель (она вынесена в document.body, чтобы
    // быть поверх backdrop-filter) остаётся висеть поверх страницы, потому
    // что она не является потомком модалки и её закрытие модалку не задевает.
    // capture:true + stopPropagation — чтобы модалка не получила то же
    // нажатие тем же тиком и не закрылась следом.
    const onEscKey = (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) {
            e.stopPropagation();
            // Возвращаем фокус на кнопку: иначе после Esc он оставался на
            // body и Tab начинал обход страницы с самого начала.
            closePanel(true);
        }
    };
    document.addEventListener('keydown', onEscKey, true);

    const observer = new MutationObserver(() => {
        updateTriggerLabel();
        renderItems();
        syncDisabledState();
    });
    observer.observe(selectEl, { childList: true, subtree: true, attributes: true });

    // Остальной код сайта продолжает менять select программно через
    // `select.value = ...` / `select.selectedIndex = ...` (например, при
    // загрузке настроек из localStorage или сбросе к дефолту). Такие
    // присваивания не создают DOM-мутаций, поэтому MutationObserver их не
    // ловит — перехватываем сеттеры напрямую, чтобы кастомная кнопка
    // всегда отражала актуальное значение.
    const nativeValueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    const nativeIndexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
    Object.defineProperty(selectEl, 'value', {
        configurable: true,
        get() { return nativeValueDesc.get.call(selectEl); },
        set(v) {
            nativeValueDesc.set.call(selectEl, v);
            updateTriggerLabel();
            renderItems();
        }
    });
    Object.defineProperty(selectEl, 'selectedIndex', {
        configurable: true,
        get() { return nativeIndexDesc.get.call(selectEl); },
        set(v) {
            nativeIndexDesc.set.call(selectEl, v);
            updateTriggerLabel();
            renderItems();
        }
    });

    return wrapper;
}

export function initAllCustomDropdowns(root = document) {
    const selects = root.querySelectorAll('select.game-select, select.game-input');
    selects.forEach(select => makeCustomDropdown(select));
}

// Конвертирует стандартные select'ы настроек (.r34-select) в кастомные
// стилизованные дропдауны, единые для всего сайта, а не только для игр.
export function initR34SelectDropdowns(root = document) {
    const selects = root.querySelectorAll('select.r34-select');
    selects.forEach(select => makeCustomDropdown(select, { classPrefix: 'r34-custom-dropdown', portal: true }));
}
