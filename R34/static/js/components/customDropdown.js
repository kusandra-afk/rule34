// ============================================================
// R34 GALLERY — CUSTOM DROPDOWN COMPONENT
// Создание кастомного, плавающего, полностью стилизованного
// выпадающего списка с анимацией вместо стандартного select
// ============================================================

import { icon } from '../icons.js';

export function makeCustomDropdown(selectEl) {
    if (!selectEl || selectEl.dataset.customized === 'true') return null;
    selectEl.dataset.customized = 'true';
    selectEl.style.display = 'none';

    const wrapper = document.createElement('div');
    wrapper.className = 'game-custom-dropdown';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'game-custom-dropdown-trigger';

    const labelSpan = document.createElement('span');
    const updateTriggerLabel = () => {
        const curOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
        labelSpan.textContent = curOpt ? curOpt.textContent : '';
    };
    updateTriggerLabel();

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'game-custom-dropdown-arrow';
    arrowSpan.innerHTML = icon('chevronDown', { size: 16 });

    trigger.appendChild(labelSpan);
    trigger.appendChild(arrowSpan);

    const panel = document.createElement('div');
    panel.className = 'game-custom-dropdown-panel';

    const renderItems = () => {
        panel.innerHTML = '';
        Array.from(selectEl.options).forEach((opt, idx) => {
            const item = document.createElement('div');
            item.className = 'game-custom-dropdown-item' + (idx === selectEl.selectedIndex ? ' selected' : '');

            const itemText = document.createElement('span');
            itemText.textContent = opt.textContent;
            item.appendChild(itemText);

            if (idx === selectEl.selectedIndex) {
                const checkSpan = document.createElement('span');
                checkSpan.className = 'game-custom-dropdown-item-check';
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
                renderItems();
            });

            panel.appendChild(item);
        });
    };

    renderItems();

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll('.game-custom-dropdown.open').forEach(d => {
            if (d !== wrapper) d.classList.remove('open');
        });
        wrapper.classList.toggle('open', !isOpen);
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);

    if (selectEl.parentNode) {
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
    }

    const onOutsideClick = (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    };
    document.addEventListener('click', onOutsideClick);

    const observer = new MutationObserver(() => {
        updateTriggerLabel();
        renderItems();
    });
    observer.observe(selectEl, { childList: true, subtree: true, attributes: true });

    return wrapper;
}

export function initAllCustomDropdowns(root = document) {
    const selects = root.querySelectorAll('select.game-select, select.game-input');
    selects.forEach(select => makeCustomDropdown(select));
}
