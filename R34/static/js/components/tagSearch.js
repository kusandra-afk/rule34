import { fetchTagCount, fetchAutocomplete } from '../api.js';
import { formatCount } from '../utils.js';
import { icon } from '../icons.js';

export class TagSearch {
    constructor({ tagInput, arrowButton, tagModeToggle, activeTagsContainer, suggestionsContainer, r34ResultsCount }) {
        this.tagInput = tagInput;
        this.arrowButton = arrowButton;
        this.tagModeToggle = tagModeToggle;
        this.activeTagsContainer = activeTagsContainer;
        this.suggestionsContainer = suggestionsContainer;
        this.r34ResultsCount = r34ResultsCount;
        
        this.activeTags = this._loadPersistedTags();
        this.tagMode = localStorage.getItem('r34_tag_mode') === 'exclude' ? 'exclude' : 'include';
        
        this.activeTagsCounts = {};
        this.onTagsChange = null; // callback(tags) for gallery
        // По умолчанию свёрнуто (чтобы строка поиска была видна сразу), но сохранённый выбор пользователя важнее
        const savedExcludedCollapsed = localStorage.getItem('r34_excluded_tags_collapsed');
        this.excludedTagsCollapsed = savedExcludedCollapsed === null ? true : savedExcludedCollapsed === 'true';
        this.includedTagsCollapsed = localStorage.getItem('r34_included_tags_collapsed') === 'true';
        this._debounceTimer = null;
        this._renderFrame = null;
        this._bindEvents();
        this._updateTagModeButton();
        
        if (this.activeTags.length > 0) {
            this.updateActiveTagsDisplay();
        }
    }

    _bindEvents() {
        // Обработчик кнопки переключения режима тегов
        if (this.tagModeToggle) {
            this.tagModeToggle.addEventListener('click', () => {
                this.tagMode = this.tagMode === 'include' ? 'exclude' : 'include';
                localStorage.setItem('r34_tag_mode', this.tagMode);
                this._updateTagModeButton();
            });
        }

        this.arrowButton.addEventListener('click', () => {
            // Если есть текст в input, добавить как тег
            if (this.tagInput.value.trim()) {
                this.addTag();
            }
            // Запустить поиск по текущим тегам
            if (this.onTagsChange) this.onTagsChange(this.getTagsQuery());
        });
        this.tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (this.tagInput.value.trim()) {
                    this.addTag();
                }
                if (this.onTagsChange) this.onTagsChange(this.getTagsQuery());
            }
        });
        
        // Оптимизированная выгрузка подсказок с дебаунсом 250мс для предотвращения КД API
        this.tagInput.addEventListener('input', () => {
            // Автоматическая замена пробелов на нижнее подчеркивание (_)
            const start = this.tagInput.selectionStart;
            const end = this.tagInput.selectionEnd;
            const originalValue = this.tagInput.value;
            const newValue = originalValue.replace(/ /g, '_');
            
            if (originalValue !== newValue) {
                this.tagInput.value = newValue;
                this.tagInput.setSelectionRange(start, end);
            }

            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            const val = this.tagInput.value.trim();
            if (!val) {
                this.hideSuggestions();
                return;
            }
            this._debounceTimer = setTimeout(() => {
                this.loadTagSuggestions(val);
            }, 250);
        });
        this.tagInput.addEventListener('focus', () => {
            const val = this.tagInput.value.trim();
            if (val) {
                this.loadTagSuggestions(val);
            }
        });

        document.addEventListener('click', (e) => {
            if (!this.tagInput.contains(e.target) && !this.suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });
    }

    _updateTagModeButton() {
        if (!this.tagModeToggle) return;
        
        const plusIcon = this.tagModeToggle.querySelector('.tag-mode-icon-plus');
        const minusIcon = this.tagModeToggle.querySelector('.tag-mode-icon-minus');
        
        if (this.tagMode === 'exclude') {
            this.tagModeToggle.classList.add('mode-exclude');
            if (plusIcon) plusIcon.style.display = 'none';
            if (minusIcon) minusIcon.style.display = 'block';
            this.tagModeToggle.title = 'Режим исключения тегов';
        } else {
            this.tagModeToggle.classList.remove('mode-exclude');
            if (plusIcon) plusIcon.style.display = 'block';
            if (minusIcon) minusIcon.style.display = 'none';
            this.tagModeToggle.title = 'Режим включения тегов';
        }
    }

    addTag(manualTag) {
        const tag = (manualTag || this.tagInput.value).trim().replace(/ /g, '_');
        if (!tag || this.activeTags.some(t => t.value === tag)) {
            this.tagInput.value = '';
            this.hideSuggestions();
            return;
        }
        // Добавляем тег с учетом текущего режима
        const isActive = this.tagMode === 'include';
        this.activeTags.push({ value: tag, active: isActive });
        this.tagInput.value = '';
        this.updateActiveTagsDisplay();
        this.hideSuggestions();
        this._persistTags();
        this._fetchAndStoreTagCount(tag);
        
        // Если тег добавлен в исключенные, синхронизируем с сервером
        if (!isActive && window.addExcludedTag) {
            window.addExcludedTag(tag);
        }
    }

    _persistTags() {
        const persisted = this.activeTags.map(tagObj => ({
            value: tagObj.value,
            active: tagObj.active
        }));
        try {
            localStorage.setItem('r34_active_tags', JSON.stringify(persisted));
        } catch (e) {
            console.warn('Failed to persist active tags:', e);
        }
    }

    _loadPersistedTags() {
        try {
            const raw = localStorage.getItem('r34_active_tags');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(tag => tag && typeof tag.value === 'string').map(tag => ({
                value: tag.value,
                active: tag.active !== false
            }));
        } catch (e) {
            console.warn('Failed to load persisted active tags:', e);
            return [];
        }
    }

    updateActiveTagsDisplay() {
        if (this._renderFrame) {
            return;
        }

        this._renderFrame = requestAnimationFrame(() => {
            this._renderFrame = null;
            this._persistTags();

            const activeTags = this.activeTags.filter(t => t.active);
            const inactiveTags = this.activeTags.filter(t => !t.active);

            if (activeTags.length === 0 && inactiveTags.length === 0) {
                this.activeTagsContainer.innerHTML = '';
                return;
            }

            // Карта всех существующих DOM элементов тегов для повторного использования
            const existingTagsMap = new Map();
            this.activeTagsContainer.querySelectorAll('.tag').forEach(el => {
                if (el.dataset.tagValue) {
                    existingTagsMap.set(el.dataset.tagValue, el);
                }
            });

            // Функция обновления или создания элемента тега
            const renderTagList = (tagObjs, container) => {
                tagObjs.forEach(tagObj => {
                    let tagEl = existingTagsMap.get(tagObj.value);
                    if (tagEl) {
                        existingTagsMap.delete(tagObj.value);
                        
                        // Обновляем состояние существующего элемента без пересоздания DOM
                        tagEl.className = 'tag' + (tagObj.active ? '' : ' inactive');
                        tagEl.style.animation = 'none'; // Отключаем повторную анимацию всплытия
                        
                        const iconSpan = tagEl.querySelector('.tag-icon');
                        if (iconSpan) {
                            iconSpan.className = 'tag-icon' + (tagObj.active ? ' active-icon' : ' inactive-icon');
                            iconSpan.innerHTML = tagObj.active ? icon('check', { size: 10, strokeWidth: 3 }) : icon('x', { size: 10, strokeWidth: 3 });
                        }
                        
                        const countSpan = tagEl.querySelector('.tag-count');
                        if (countSpan) {
                            const tagCount = this.activeTagsCounts[tagObj.value];
                            if (tagCount !== undefined) {
                                countSpan.textContent = formatCount(tagCount);
                            }
                        }
                        container.appendChild(tagEl);
                    } else {
                        const originalIndex = this.activeTags.indexOf(tagObj);
                        tagEl = this.createTagDOMElement(tagObj, originalIndex);
                        container.appendChild(tagEl);
                    }
                });
            };

            // Группа Исключенные теги
            let inactiveWrapper = this.activeTagsContainer.querySelector('.tags-group-wrapper-inactive');
            if (inactiveTags.length > 0) {
                if (!inactiveWrapper) {
                    inactiveWrapper = document.createElement('div');
                    inactiveWrapper.className = 'tags-group-wrapper tags-group-wrapper-inactive';
                    
                    const label = document.createElement('div');
                    label.className = 'tags-group-label';
                    
                    const ignoreExcluded = localStorage.getItem('r34_ignore_excluded_tags') === 'true';
                    
                    label.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="group-dot inactive-dot"></span>
                            Исключенные теги
                            <svg class="tags-group-toggle ${this.excludedTagsCollapsed ? 'collapsed' : ''}" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Игнорировать</span>
                            <label class="r34-toggle-switch" style="transform: scale(0.8);">
                                <input type="checkbox" id="ignoreExcludedToggle" ${ignoreExcluded ? 'checked' : ''}>
                                <span class="r34-slider"></span>
                            </label>
                        </div>
                    `;
                    
                    const toggleCollapse = () => {
                        this.excludedTagsCollapsed = !this.excludedTagsCollapsed;
                        localStorage.setItem('r34_excluded_tags_collapsed', this.excludedTagsCollapsed ? 'true' : 'false');
                        const toggle = label.querySelector('.tags-group-toggle');
                        const listWrapper = label.nextElementSibling;
                        if (toggle) toggle.classList.toggle('collapsed', this.excludedTagsCollapsed);
                        if (listWrapper) listWrapper.classList.toggle('collapsed', this.excludedTagsCollapsed);
                    };
                    
                    label.querySelector('.tags-group-toggle').onclick = (e) => {
                        e.stopPropagation();
                        toggleCollapse();
                    };
                    
                    label.onclick = (e) => {
                        if (e.target.closest('.r34-toggle-switch')) return;
                        toggleCollapse();
                    };
                    
                    const ignoreToggle = label.querySelector('#ignoreExcludedToggle');
                    ignoreToggle.onclick = (e) => {
                        e.stopPropagation();
                        localStorage.setItem('r34_ignore_excluded_tags', ignoreToggle.checked ? 'true' : 'false');
                        if (this.onTagsChange) this.onTagsChange(this.getTagsQuery());
                    };
                    
                    inactiveWrapper.appendChild(label);
                    
                    const listWrapper = document.createElement('div');
                    listWrapper.className = 'tags-group-list-wrapper' + (this.excludedTagsCollapsed ? ' collapsed' : '');
                    
                    const tagsContainer = document.createElement('div');
                    tagsContainer.className = 'tags-group-list';
                    
                    listWrapper.appendChild(tagsContainer);
                    inactiveWrapper.appendChild(listWrapper);
                }
                
                const tagsContainer = inactiveWrapper.querySelector('.tags-group-list');
                renderTagList(inactiveTags, tagsContainer);
                this.activeTagsContainer.appendChild(inactiveWrapper);
            } else if (inactiveWrapper) {
                inactiveWrapper.remove();
            }

            // Группа Включенные теги
            let activeWrapper = this.activeTagsContainer.querySelector('.tags-group-wrapper-active');
            if (activeTags.length > 0) {
                if (!activeWrapper) {
                    activeWrapper = document.createElement('div');
                    activeWrapper.className = 'tags-group-wrapper tags-group-wrapper-active';
                    
                    const label = document.createElement('div');
                    label.className = 'tags-group-label';
                    
                    const ignoreIncluded = localStorage.getItem('r34_ignore_included_tags') === 'true';
                    
                    label.innerHTML = `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="group-dot active-dot"></span>
                            Включенные теги
                            <svg class="tags-group-toggle ${this.includedTagsCollapsed ? 'collapsed' : ''}" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.7rem; color: rgba(255,255,255,0.5);">Игнорировать</span>
                            <label class="r34-toggle-switch" style="transform: scale(0.8);">
                                <input type="checkbox" id="ignoreIncludedToggle" ${ignoreIncluded ? 'checked' : ''}>
                                <span class="r34-slider"></span>
                            </label>
                        </div>
                    `;
                    
                    const toggleCollapse = () => {
                        this.includedTagsCollapsed = !this.includedTagsCollapsed;
                        localStorage.setItem('r34_included_tags_collapsed', this.includedTagsCollapsed ? 'true' : 'false');
                        const toggle = label.querySelector('.tags-group-toggle');
                        const listWrapper = label.nextElementSibling;
                        if (toggle) toggle.classList.toggle('collapsed', this.includedTagsCollapsed);
                        if (listWrapper) listWrapper.classList.toggle('collapsed', this.includedTagsCollapsed);
                    };
                    
                    label.querySelector('.tags-group-toggle').onclick = (e) => {
                        e.stopPropagation();
                        toggleCollapse();
                    };
                    
                    label.onclick = (e) => {
                        if (e.target.closest('.r34-toggle-switch')) return;
                        toggleCollapse();
                    };
                    
                    const ignoreToggle = label.querySelector('#ignoreIncludedToggle');
                    ignoreToggle.onclick = (e) => {
                        e.stopPropagation();
                        localStorage.setItem('r34_ignore_included_tags', ignoreToggle.checked ? 'true' : 'false');
                        if (this.onTagsChange) this.onTagsChange(this.getTagsQuery());
                    };
                    
                    activeWrapper.appendChild(label);
                    
                    const listWrapper = document.createElement('div');
                    listWrapper.className = 'tags-group-list-wrapper' + (this.includedTagsCollapsed ? ' collapsed' : '');
                    
                    const tagsContainer = document.createElement('div');
                    tagsContainer.className = 'tags-group-list';
                    
                    listWrapper.appendChild(tagsContainer);
                    activeWrapper.appendChild(listWrapper);
                }
                
                const tagsContainer = activeWrapper.querySelector('.tags-group-list');
                renderTagList(activeTags, tagsContainer);
                this.activeTagsContainer.appendChild(activeWrapper);
            } else if (activeWrapper) {
                activeWrapper.remove();
            }

            // Удаляем элементы тегов, которых больше нет в списке
            existingTagsMap.forEach(el => el.remove());
        });
    }

    createTagDOMElement(tagObj, i) {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag' + (tagObj.active ? '' : ' inactive');
        tagEl.dataset.tagValue = tagObj.value;
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tag-icon' + (tagObj.active ? ' active-icon' : ' inactive-icon');
        iconSpan.innerHTML = tagObj.active ? icon('check', { size: 10, strokeWidth: 3 }) : icon('x', { size: 10, strokeWidth: 3 });
        tagEl.appendChild(iconSpan);

        const textNode = document.createTextNode(tagObj.value);
        tagEl.appendChild(textNode);

        const countSpan = document.createElement('span');
        countSpan.className = 'tag-count';
        
        const tagCount = this.activeTagsCounts[tagObj.value];
        countSpan.textContent = tagCount !== undefined ? formatCount(tagCount) : '...';
        if (tagCount === undefined) {
            fetchTagCount(tagObj.value, !tagObj.active).then(cnt => {
                this.activeTagsCounts[tagObj.value] = cnt;
                countSpan.textContent = formatCount(cnt);
            }).catch(() => countSpan.textContent = '?');
        }
        tagEl.appendChild(countSpan);

        const handleExclude = (obj) => {
            if (!obj || obj.active === false) return;
            obj.active = false;
            if (window.addExcludedTag) {
                window.addExcludedTag(obj.value);
            }
            this._persistTags();
            this.updateActiveTagsDisplay();
        };

        const handleInclude = (obj) => {
            if (!obj || obj.active === true) return;
            obj.active = true;
            if (window.removeExcludedTag) {
                window.removeExcludedTag(obj.value);
            }
            this._persistTags();
            this.updateActiveTagsDisplay();
        };

        const handleRemove = (obj) => {
            const currentIdx = this.activeTags.indexOf(obj);
            if (currentIdx === -1) return;
            if (!obj.active && window.removeExcludedTag) {
                window.removeExcludedTag(obj.value);
            }
            this.activeTags.splice(currentIdx, 1);
            this._persistTags();
            this.updateActiveTagsDisplay();
        };

        const behavior = localStorage.getItem('r34_tag_click_behavior') || 'default';

        // Универсальный обработчик долгого нажатия для перемещения тегов (работает на всех режимах)
        let pressTimer = null;
        let isLongPress = false;
        let startX = 0;
        let startY = 0;

        const startUniversalPress = (e) => {
            isLongPress = false;
            const touch = (e.touches && e.touches[0]) ? e.touches[0] : e;
            if (!touch) return;
            startX = touch.clientX;
            startY = touch.clientY;

            pressTimer = setTimeout(() => {
                isLongPress = true;
                const currentIdx = this.activeTags.indexOf(tagObj);
                if (currentIdx !== -1) {
                    // В режиме longpress долгое нажатие переключает тег между включенными и исключенными
                    if (behavior === 'longpress') {
                        if (tagObj.active) {
                            handleExclude(tagObj);
                        } else {
                            handleInclude(tagObj);
                        }
                        if (navigator.vibrate) {
                            try { navigator.vibrate(40); } catch(err) {}
                        }
                        tagEl.classList.add('long-pressed-feedback');
                        setTimeout(() => tagEl.classList.remove('long-pressed-feedback'), 300);
                    }
                    // В других режимах долгое нажатие только из исключенных во включенные
                    else if (!tagObj.active) {
                        handleInclude(tagObj);
                        if (navigator.vibrate) {
                            try { navigator.vibrate(40); } catch(err) {}
                        }
                        tagEl.classList.add('long-pressed-feedback');
                        setTimeout(() => tagEl.classList.remove('long-pressed-feedback'), 300);
                    }
                }
            }, 500);
        };

        const cancelUniversalPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        const moveUniversalPress = (e) => {
            if (!pressTimer) return;
            const touch = (e.touches && e.touches[0]) ? e.touches[0] : e;
            if (!touch) return;
            const moveX = touch.clientX;
            const moveY = touch.clientY;
            if (Math.hypot(moveX - startX, moveY - startY) > 10) {
                cancelUniversalPress();
            }
        };

        // Добавляем touch события для всех режимов
        tagEl.addEventListener('touchstart', (e) => {
            startUniversalPress(e);
        }, { passive: true });
        
        tagEl.addEventListener('touchend', (e) => {
            cancelUniversalPress();
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });

        tagEl.addEventListener('touchmove', moveUniversalPress, { passive: true });
        tagEl.addEventListener('touchcancel', cancelUniversalPress, { passive: true });

        // Добавляем mouse события для десктопа (работает во всех режимах)
        tagEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            startUniversalPress(e);
        });

        tagEl.addEventListener('mouseup', () => {
            cancelUniversalPress();
        });

        tagEl.addEventListener('mouseleave', () => {
            cancelUniversalPress();
        });

        if (behavior === 'default') {
            tagEl.onclick = (e) => {
                e.stopPropagation();
                if (isLongPress) {
                    isLongPress = false;
                    return;
                }
                const currentIdx = this.activeTags.indexOf(tagObj);
                if (currentIdx === -1) return;
                
                // Shift+клик перемещает тег только из исключенных во включенные
                if (e.shiftKey && !tagObj.active) {
                    handleInclude(tagObj);
                } else {
                    // Обычный клик
                    if (tagObj.active) {
                        handleExclude(tagObj);
                    } else {
                        handleRemove(tagObj);
                    }
                }
            };
        } else if (behavior === 'dblclick') {
            let clickTimer = null;
            tagEl.onclick = (e) => {
                e.stopPropagation();
                if (isLongPress) {
                    isLongPress = false;
                    return;
                }
                const currentIdx = this.activeTags.indexOf(tagObj);
                if (currentIdx === -1) return;

                // Shift+клик перемещает тег только из исключенных во включенные
                if (e.shiftKey && !tagObj.active) {
                    handleInclude(tagObj);
                    return;
                }

                if (clickTimer === null) {
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        handleRemove(tagObj);
                    }, 250);
                } else {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    handleExclude(tagObj);
                }
            };
        } else if (behavior === 'longpress') {
            // В режиме longpress обычный клик удаляет тег
            tagEl.onclick = (e) => {
                e.stopPropagation();
                if (isLongPress) {
                    isLongPress = false;
                    return;
                }
                const currentIdx = this.activeTags.indexOf(tagObj);
                if (currentIdx === -1) return;
                
                // Shift+клик перемещает тег только из исключенных во включенные
                if (e.shiftKey && !tagObj.active) {
                    handleInclude(tagObj);
                } else {
                    handleRemove(tagObj);
                }
            };
        }

        return tagEl;
    }

    _fetchAndStoreTagCount(tag, skipCache = false) {
        fetchTagCount(tag, skipCache).then(cnt => {
            this.activeTagsCounts[tag] = cnt;
            // Update counts in DOM directly to avoid destroying and recreating DOM nodes
            const formatted = formatCount(cnt);
            if (this.activeTagsContainer) {
                const tagEls = this.activeTagsContainer.querySelectorAll('.tag');
                tagEls.forEach(el => {
                    if (el.dataset.tagValue === tag) {
                        const countSpan = el.querySelector('.tag-count');
                        if (countSpan) countSpan.textContent = formatted;
                    }
                });
            }
        }).catch(() => {});
    }

    getTagsQuery() {
        // Check ignore flags
        const ignoreExcluded = localStorage.getItem('r34_ignore_excluded_tags') === 'true';
        const ignoreIncluded = localStorage.getItem('r34_ignore_included_tags') === 'true';
        
        const normalizeTagForQuery = (tagValue) => {
            const trimmed = (tagValue || '').trim();
            return trimmed.startsWith('creator:') ? trimmed.replace('creator:', '') : trimmed;
        };
        
        // We separate active tags and inactive (excluded) tags
        const active = this.activeTags.filter(t => t.active).map(t => normalizeTagForQuery(t.value));
        const inactive = this.activeTags.filter(t => !t.active).map(t => normalizeTagForQuery(t.value));
        
        // Filter based on ignore flags
        const activeToUse = ignoreIncluded ? [] : active.filter(Boolean);
        const inactiveToUse = ignoreExcluded ? [] : inactive.filter(Boolean);
        
        // To respect Rule34 API's tag limit (usually 10 tags),
        // we send all active tags, and only up to 4 inactive tags to the API.
        // The remaining inactive tags will be filtered client-side in loadPosts.
        const apiInactive = inactiveToUse.slice(0, 4);
        
        const apiTags = [...activeToUse, ...apiInactive.map(t => '-' + t)];
        return apiTags.join(' ');
    }

    loadTagSuggestions(value) {
        if (!value) {
            this.hideSuggestions();
            return;
        }
        
        fetchAutocomplete(value, '')
            .then(data => {
                this.displaySuggestions(data);
            })
            .catch((e) => {
                console.error('Error loading suggestions:', e);
                this.hideSuggestions();
            });
    }

    async getSuggestions(value) {
        if (!value) return [];
        try {
            return await fetchAutocomplete(value, '');
        } catch (e) {
            return [];
        }
    }

    displaySuggestions(suggestions) {
        this.suggestionsContainer.innerHTML = '';
        if (!suggestions || suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            
            const displayValue = suggestion.value || suggestion.label;
            const tagValue = suggestion.value || suggestion.label;
            
            const textNode = document.createTextNode(displayValue);
            item.appendChild(textNode);
            const countSpan = document.createElement('span');
            
            // Пытаемся быстро вытащить количество постов из label (формат: "tag_name (12345)")
            let count = null;
            if (suggestion.label) {
                const match = suggestion.label.match(/\((\d+)\)$/);
                if (match) {
                    count = parseInt(match[1], 10);
                }
            }
            // Use suggestion.count for creators as well
            if (count === null && suggestion.count !== undefined) {
                count = suggestion.count;
            }

            if (count !== null) {
                this.activeTagsCounts[tagValue] = count;
                countSpan.textContent = formatCount(count);
            } else if (this.activeTagsCounts[tagValue] !== undefined) {
                countSpan.textContent = formatCount(this.activeTagsCounts[tagValue]);
            } else {
                countSpan.style.display = 'none';
            }
            item.appendChild(countSpan);
            item.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.addTag(tagValue);
            };
            this.suggestionsContainer.appendChild(item);
        });
        this.suggestionsContainer.style.display = 'block';
    }

    hideSuggestions() {
        this.suggestionsContainer.style.display = 'none';
    }
}
