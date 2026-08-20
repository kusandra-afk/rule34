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
        if (cls !== 'r34-select' && cls !== 'game-select' && cls !== 'game-input') {
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

    const renderItems = () => {
        panel.innerHTML = '';
        Array.from(selectEl.options).forEach((opt, idx) => {
            const item = document.createElement('div');
            item.className = `${classPrefix}-item` + (idx === selectEl.selectedIndex ? ' selected' : '');

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
                if (selectEl.selectedIndex !== idx) {
                    selectEl.selectedIndex = idx;
                    selectEl.value = opt.value;
                    updateTriggerLabel();
                    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                wrapper.classList.remove('open');
                panel.classList.remove('open');
                renderItems();
            });

            panel.appendChild(item);
        });
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
        panel.style.top = (rect.bottom + 6) + 'px';
        panel.style.left = rect.left + 'px';
        panel.style.width = rect.width + 'px';
        panel.style.minWidth = rect.width + 'px';
    };

    const closePanel = () => {
        wrapper.classList.remove('open');
        panel.classList.remove('open');
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll(`.${classPrefix}.open`).forEach(d => {
            if (d !== wrapper) d.classList.remove('open');
        });
        document.querySelectorAll(`.${classPrefix}-panel.open`).forEach(p => {
            if (p !== panel) p.classList.remove('open');
        });
        const nextOpen = !isOpen;
        wrapper.classList.toggle('open', nextOpen);
        if (portal && nextOpen) {
            document.body.appendChild(panel);
            positionPanel();
        }
        panel.classList.toggle('open', nextOpen);
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
    }

    const onOutsideClick = (e) => {
        if (!wrapper.contains(e.target) && !panel.contains(e.target)) {
            closePanel();
        }
    };
    document.addEventListener('click', onOutsideClick);

    const observer = new MutationObserver(() => {
        updateTriggerLabel();
        renderItems();
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
