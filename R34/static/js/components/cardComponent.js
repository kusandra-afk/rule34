import { escapeHtml } from '../utils.js';

export class CardComponent {
    static createCard(post, index, gallery) {
        // Check if API failed to load data for this post
        if (post.api_failed) {
            const container = document.createElement('div');
            container.className = 'media-container';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.padding = '20px';
            container.style.background = 'rgba(255, 59, 107, 0.08)';
            container.style.border = '1px solid rgba(255, 59, 107, 0.25)';
            container.style.borderRadius = 'var(--radius-sm)';
            container.style.minHeight = '200px';
            
            const warningIcon = document.createElement('div');
            warningIcon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
            warningIcon.style.fontSize = '2rem';
            warningIcon.style.marginBottom = '10px';
            
            const warningText = document.createElement('div');
            warningText.textContent = 'API устал';
            warningText.style.color = '#ff3b6b';
            warningText.style.fontSize = '0.9rem';
            warningText.style.fontWeight = '600';
            warningText.style.textAlign = 'center';
            
            const subText = document.createElement('div');
            subText.textContent = `ID: ${post.id}`;
            subText.style.color = 'rgba(255,255,255,0.5)';
            subText.style.fontSize = '0.8rem';
            subText.style.marginTop = '5px';
            
            container.appendChild(warningIcon);
            container.appendChild(warningText);
            container.appendChild(subText);
            
            return container;
        }
        
        const isVideo = ['mp4', 'webm', 'mov'].includes((post.file_url?.split('.').pop() || '').toLowerCase());
        let aspectRatio = (post.width && post.height) ? (post.width / post.height) : (4 / 3);
        // Clamp aspect ratio to safe range (0.5 to 2.2) to prevent grid layout collapse and width expansion bugs on click
        if (aspectRatio < 0.5) aspectRatio = 0.5;
        if (aspectRatio > 2.2) aspectRatio = 2.2;
        
        const container = document.createElement('div');
        if (gallery && typeof gallery.isLowPowerMode === 'function' && gallery.isLowPowerMode()) {
            container.classList.add('low-power-card');
        }
        container.className = 'media-container';
        container.style.setProperty('--card-aspect', aspectRatio);
        container.style.zIndex = '2';
        if (gallery && gallery.isCustomColumns) {
            container.classList.add('custom-cols');
        }
        container.dataset.idx = index;

        if (isVideo) {
            const cachedDuration = parseFloat(localStorage.getItem(`r34_duration_${post.id}`));
            if (!isNaN(cachedDuration) && cachedDuration > 0) {
                const enabled = localStorage.getItem('r34_min_duration_enabled') === 'true';
                const minDuration = enabled ? (parseInt(localStorage.getItem('r34_min_duration'), 10) || 30) : 0;
                if (minDuration > 0 && cachedDuration < minDuration) {
                    container.style.display = 'none';
                }
            }
        }

        const isLong = (post.width && post.height && (post.height / post.width > 2.8));
        const isProtected = localStorage.getItem('r34_long_image_protection') !== 'false';
        if (isLong && isProtected && !isVideo) {
            container.classList.add('long-truncated');
            const expandBtn = document.createElement('button');
            expandBtn.textContent = 'Развернуть';
            expandBtn.className = 'expand-btn';
            expandBtn.style.position = 'absolute';
            expandBtn.style.bottom = '10px';
            expandBtn.style.left = '50%';
            expandBtn.style.transform = 'translateX(-50%)';
            expandBtn.style.zIndex = '10';
            expandBtn.style.padding = '8px 16px';
            expandBtn.style.background = 'var(--accent)';
            expandBtn.style.color = '#fff';
            expandBtn.style.border = 'none';
            expandBtn.style.borderRadius = '20px';
            expandBtn.style.cursor = 'pointer';
            expandBtn.onclick = (e) => {
                e.stopPropagation();
                container.classList.remove('long-truncated');
                // Убрать класс мало — высота карточки всё ещё считается через
                // --card-aspect, а он выше был намеренно ЗАЖАТ в диапазон
                // 0.5–2.2 (см. комментарий про "grid layout collapse and width
                // expansion bugs"), а не равен реальным пропорциям картинки.
                // Поэтому без класса карточка просто переключается на другой
                // фиксированный (но всё ещё урезанный) расчёт высоты — отсюда
                // "разворачивается лишь немного". Сбрасываем --card-aspect в
                // auto, чтобы высота считалась от реального контента.
                container.style.setProperty('--card-aspect', 'auto');
                expandBtn.remove();
            };
            container.appendChild(expandBtn);
        }

        const placeholder = document.createElement('div');
        placeholder.className = 'media-placeholder';
        placeholder.innerHTML = isVideo ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' : '';
        container.appendChild(placeholder);

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'fullscreen-btn';
        fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
        fullscreenBtn.title = 'Открыть на весь экран';
        fullscreenBtn.onclick = (e) => {
            e.stopPropagation();
            const postsList = container._isFavoriteCard || (gallery && gallery.isFavoritesActive) ? gallery.favoritesPosts : gallery.currentPosts;
            if (gallery && typeof gallery.openFullscreen === 'function') {
                gallery.openFullscreen(index, postsList);
            }
        };
        container.appendChild(fullscreenBtn);

        if (isVideo) {
            const soundWrapper = document.createElement('div');
            soundWrapper.className = 'sound-control-wrapper';

            const sliderContainer = document.createElement('div');
            sliderContainer.className = 'sound-volume-slider-container';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'sound-volume-slider';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.01';
            const defaultVol = localStorage.getItem('r34_default_volume');
            const initialVol = defaultVol !== null ? (parseFloat(defaultVol) || 50) / 100 : 0.50;
            slider.value = initialVol;

            sliderContainer.appendChild(slider);

            const soundBtn = document.createElement('button');
            soundBtn.className = 'sound-toggle-btn';
            soundBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
            soundBtn.title = 'Выключить звук';

            soundWrapper.appendChild(sliderContainer);
            soundWrapper.appendChild(soundBtn);
            container.appendChild(soundWrapper);

            container._soundToggleBtn = soundBtn;
            container._soundWrapper = soundWrapper;
            container._soundVolumeSlider = slider;

            soundBtn.onclick = (e) => {
                e.stopPropagation();
                if (container._videoEl) {
                    container._videoEl.muted = !container._videoEl.muted;
                    if (!container._videoEl.muted && container._videoEl.volume === 0) {
                        container._videoEl.volume = 0.5;
                        slider.value = 0.5;
                    }
                }
            };

            slider.oninput = (e) => {
                e.stopPropagation();
                if (container._videoEl) {
                    const volNum = parseFloat(slider.value);
                    container._videoEl.volume = volNum;
                    if (volNum > 0 && container._videoEl.muted) {
                        container._videoEl.muted = false;
                    }
                    if (volNum === 0) {
                        container._videoEl.muted = true;
                    }
                    const volPct = Math.round(volNum * 100);
                    localStorage.setItem('r34_default_volume', volPct.toString());
                }
            };

            soundWrapper.onclick = (e) => e.stopPropagation();
            soundWrapper.onmousedown = (e) => e.stopPropagation();
        }

        const centerOverlay = document.createElement('div');
        centerOverlay.className = 'center-overlay';
        centerOverlay.style.position = 'absolute';
        centerOverlay.style.left = '0';
        centerOverlay.style.top = '0';
        centerOverlay.style.width = '100%';
        centerOverlay.style.height = '100%';
        centerOverlay.style.zIndex = '5';
        centerOverlay.style.cursor = 'pointer';
        centerOverlay.style.background = 'transparent';
        centerOverlay.style.pointerEvents = 'none';
        container.appendChild(centerOverlay);

        container.addEventListener('click', (e) => {
            if (
                e.target.classList.contains('fullscreen-btn') ||
                e.target.classList.contains('sound-toggle-btn') ||
                e.target.closest('.sound-toggle-btn') ||
                e.target.classList.contains('expand-btn') ||
                e.target.classList.contains('custom-video-controls') ||
                e.target.closest('.custom-video-controls') ||
                e.target.classList.contains('center-play-btn') ||
                e.target.closest('.center-play-btn')
            ) {
                return;
            }
            if (gallery && typeof gallery.toggleExtraInfo === 'function') {
                gallery.toggleExtraInfo(parseInt(container.dataset.idx, 10), container);
            }
        });

        return container;
    }

    static createSourceBlock(post) {
        const sourceBlock = document.createElement('div');
        sourceBlock.className = 'media-source-block';
        sourceBlock.hidden = true;

        const rawSource = post.source ?? post.source_url ?? '';
        const sourceText = typeof rawSource === 'string' ? rawSource.trim() : String(rawSource ?? '').trim();

        const emptySourceValues = new Set(['', 'null', 'none', 'undefined', 'no source', 'нету', 'нет']);
        const isEmptySource = !sourceText || emptySourceValues.has(sourceText.toLowerCase());

        let hrefUrl = '';
        let domain = '';
        let isLink = false;

        const formatFullUrl = (url) => {
            if (!url) return '';
            let trimmed = url.trim();
            if (trimmed.startsWith('//')) return 'https:' + trimmed;
            if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
            return trimmed;
        };

        if (!isEmptySource) {
            const isMediaFile = /\.(jpg|jpeg|png|gif|webp|webm|mp4|mov)$/i.test(sourceText);
            
            if (/^(https?:)?\/\//i.test(sourceText)) {
                isLink = true;
                hrefUrl = formatFullUrl(sourceText);
            } else if (/^www\./i.test(sourceText)) {
                isLink = true;
                hrefUrl = formatFullUrl(sourceText);
            } else if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(sourceText)) {
                isLink = true;
                hrefUrl = formatFullUrl(sourceText);
            } else if (isMediaFile && (post.file_url || post.sample_url)) {
                isLink = true;
                hrefUrl = formatFullUrl(post.file_url || post.sample_url);
            } else if (!isMediaFile && /^[a-z0-9.-]+\.(com|net|org|io|jp|ru|co|ai|art|fan|space|app|dev|site|page|tv|me|cc)$/i.test(sourceText)) {
                isLink = true;
                hrefUrl = formatFullUrl(sourceText);
            }
        }

        if (isLink && hrefUrl) {
            try {
                const urlObj = new URL(hrefUrl);
                domain = urlObj.hostname.replace('www.', '');
            } catch (e) {
                domain = 'источник';
            }
        }

        sourceBlock.innerHTML = `
            <div class="r34-source-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Источник медиафайла
            </div>
            ${isEmptySource ? `
                <div class="r34-source-empty-state">
                    <span class="r34-source-empty-label">Источник не указан</span>
                </div>
            ` : isLink ? `
                <div class="r34-source-link-container">
                    <a href="${escapeHtml(hrefUrl)}" target="_blank" class="r34-source-link-btn" id="src-btn-${post.id}">
                        <svg class="link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        <span class="r34-source-action-label">Перейти к источнику</span>
                        <span class="r34-domain-badge">${escapeHtml(domain)}</span>
                        <span class="r34-link-arrow">↗</span>
                    </a>
                </div>
            ` : `
                <div class="r34-source-plain-text-wrapper">
                    <div class="r34-source-plain-text-container">
                        <div class="r34-source-plain-text">${escapeHtml(sourceText)}</div>
                    </div>
                </div>
            `}
        `;

        const btn = sourceBlock.querySelector('.r34-source-link-btn');
        if (btn) {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                btn.style.setProperty('--mouse-x', `${x}px`);
                btn.style.setProperty('--mouse-y', `${y}px`);
            });
        }

        return sourceBlock;
    }

    static parseRule34Date(raw) {
        if (raw == null || raw === '') return null;

        let d = null;

        if (typeof raw === 'number') {
            if (isNaN(raw) || raw <= 0) return null;
            d = new Date(raw > 1e11 ? raw : raw * 1000);
        } else if (typeof raw === 'string') {
            const str = raw.trim();
            if (!str) return null;

            if (/^\d+$/.test(str)) {
                const num = parseInt(str, 10);
                if (isNaN(num) || num <= 0) return null;
                d = new Date(num > 1e11 ? num : num * 1000);
            } else {
                // Rule34 / Gelbooru format: "Mon Jul 10 18:32:01 +0000 2023" or "Sun Aug 11 14:02:11 2024"
                const gelbooruMatch = str.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4}|[A-Za-z]+)?\s*(\d{4})$/);
                if (gelbooruMatch) {
                    const monthMap = {
                        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
                    };
                    const monthStr = gelbooruMatch[1].toLowerCase();
                    const month = monthMap[monthStr];
                    const day = parseInt(gelbooruMatch[2], 10);
                    const hour = parseInt(gelbooruMatch[3], 10);
                    const min = parseInt(gelbooruMatch[4], 10);
                    const sec = parseInt(gelbooruMatch[5], 10);
                    const tzStr = gelbooruMatch[6];
                    const year = parseInt(gelbooruMatch[7], 10);

                    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
                        let utcMs = Date.UTC(year, month, day, hour, min, sec);
                        if (tzStr && /^[+-]\d{4}$/.test(tzStr)) {
                            const sign = tzStr[0] === '-' ? -1 : 1;
                            const tzHours = parseInt(tzStr.slice(1, 3), 10) || 0;
                            const tzMins = parseInt(tzStr.slice(3, 5), 10) || 0;
                            const offsetMs = (tzHours * 60 + tzMins) * 60 * 1000 * sign;
                            utcMs -= offsetMs;
                        }
                        d = new Date(utcMs);
                    }
                }

                if (!d || isNaN(d.getTime())) {
                    let isoStr = str;
                    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(str)) {
                        isoStr = str.replace(' ', 'T') + 'Z';
                    }
                    d = new Date(isoStr);
                }
            }
        }

        if (!d || isNaN(d.getTime())) return null;

        const year = d.getFullYear();
        const currentYear = new Date().getFullYear();
        if (year < 2006 || year > currentYear + 1) return null;

        return d;
    }

    static estimateDateFromId(id) {
        const idNum = parseInt(id, 10);
        if (!idNum || isNaN(idNum) || idNum <= 0) return null;

        const idMilestones = [
            { id: 100000, time: new Date('2009-01-01').getTime() },
            { id: 500000, time: new Date('2010-11-14').getTime() },
            { id: 750000, time: new Date('2011-06-11').getTime() },
            { id: 1000000, time: new Date('2012-05-05').getTime() },
            { id: 1500000, time: new Date('2014-02-15').getTime() },
            { id: 2000000, time: new Date('2016-03-22').getTime() },
            { id: 2500000, time: new Date('2017-09-10').getTime() },
            { id: 3000000, time: new Date('2018-12-03').getTime() },
            { id: 4000000, time: new Date('2020-08-12').getTime() },
            { id: 5000000, time: new Date('2021-08-17').getTime() },
            { id: 6000000, time: new Date('2022-04-26').getTime() },
            { id: 7000000, time: new Date('2022-11-18').getTime() },
            { id: 8000000, time: new Date('2023-05-30').getTime() },
            { id: 9000000, time: new Date('2023-11-17').getTime() },
            { id: 10000000, time: new Date('2024-04-21').getTime() },
            { id: 14000000, time: new Date('2025-07-03').getTime() },
            { id: 16000000, time: new Date('2025-12-30').getTime() },
            { id: 18000000, time: new Date('2026-07-04').getTime() }
        ];

        if (idNum <= idMilestones[0].id) return new Date(idMilestones[0].time);
        if (idNum >= idMilestones[idMilestones.length - 1].id) {
            const last = idMilestones[idMilestones.length - 1];
            const prev = idMilestones[idMilestones.length - 2];
            const rate = (last.time - prev.time) / (last.id - prev.id);
            const estTime = last.time + (idNum - last.id) * rate;
            return new Date(Math.min(estTime, Date.now()));
        }
        for (let i = 0; i < idMilestones.length - 1; i++) {
            const m1 = idMilestones[i];
            const m2 = idMilestones[i + 1];
            if (idNum >= m1.id && idNum <= m2.id) {
                const ratio = (idNum - m1.id) / (m2.id - m1.id);
                const estTime = m1.time + ratio * (m2.time - m1.time);
                return new Date(estTime);
            }
        }
        return null;
    }

    static createExtraInfo(post, index, gallery) {
        const tagsArr = (post.tags || '').split(' ').filter(Boolean);
        const activeTags = window.tagSearch ? window.tagSearch.activeTags.map(t => t.value) : [];
        const safeTags = tagsArr.filter(tag => typeof tag === 'string' && tag.trim());
        const tagsHtml = safeTags.map(tag => {
            const escapedTag = escapeHtml(tag);
            return `<span class="media-tag${activeTags.includes(tag) ? ' active-tag' : ''}" data-tag="${escapedTag}">${escapedTag}</span>`;
        }).join('');
        
        const score = Number(post.score) || 0;
        const likedKey = `liked_${String(post.id)}`;
        const isLiked = localStorage.getItem(likedKey) === 'true';

        const dateObj = (gallery && typeof gallery.parseRule34Date === 'function' ? gallery.parseRule34Date(post.created_at) : null) || 
                         (gallery && typeof gallery.parseRule34Date === 'function' ? gallery.parseRule34Date(post.created_at_date) : null) || 
                         (gallery && typeof gallery.parseRule34Date === 'function' ? gallery.parseRule34Date(post.date) : null) || 
                         (gallery && typeof gallery.parseRule34Date === 'function' ? gallery.parseRule34Date(post.created) : null) || 
                         (gallery && typeof gallery.parseRule34Date === 'function' ? gallery.parseRule34Date(post.timestamp) : null) ||
                         (gallery && typeof gallery.estimateDateFromId === 'function' ? gallery.estimateDateFromId(post.id) : null);

        const dateInfo = dateObj ? (() => {
            try {
                return {
                    short: dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }),
                    full: dateObj.toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                };
            } catch (e) {
                return null;
            }
        })() : null;
        
        const extraInfo = document.createElement('div');
        extraInfo.className = 'media-extra-info';
        extraInfo.dataset.idx = index;
        const width = post.width != null ? String(post.width) : '?';
        const height = post.height != null ? String(post.height) : '?';
        const postId = post.id != null ? String(post.id) : '?';
        extraInfo.innerHTML = `
            <div class="media-meta">
                <div class="media-dimensions" style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span>${escapeHtml(width)}×${escapeHtml(height)}</span>
                    <span class="media-id-badge" data-id="${escapeHtml(postId)}" title="Нажмите, чтобы скопировать ID">ID: ${escapeHtml(postId)}</span>
                    ${dateInfo ? `<span class="media-date-badge" title="Опубликовано: ${escapeHtml(dateInfo.full)}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8; flex-shrink: 0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        ${escapeHtml(dateInfo.short)}
                    </span>` : ''}
                </div>
                <div class="media-likes" data-post-id="${escapeHtml(postId)}">
                    <button class="like-btn ${isLiked ? 'liked' : ''}" 
                            data-post-id="${escapeHtml(postId)}" 
                            title="${escapeHtml(isLiked ? 'Удалить лайк' : 'Поставить лайк')}">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="like-count">${escapeHtml(String(score))}</span>
                </div>
            </div>
            
            <div class="media-authors-group" style="display: none; margin-top: 10px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                <div style="font-size: 0.8em; color: #2dd4bf; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span style="display:inline-flex; align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></span> Автор:
                </div>
                <div class="media-authors-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>

            <div class="media-characters-group" style="display: none; margin-top: 10px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
                <div style="font-size: 0.8em; color: var(--accent, #a78bfa); margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                    <span style="display:inline-flex; align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span> Персонаж:
                </div>
                <div class="media-characters-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
            </div>

            <div class="media-tags-title" style="font-size: 0.8em; color: rgba(255,255,255,0.4); margin-top: 10px; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: none;">Теги:</div>
            <div class="media-tags-list">${tagsHtml}</div>
        `;
        extraInfo.hidden = true;
        
        const likeBtn = extraInfo.querySelector('.like-btn');
        if (likeBtn) {
            likeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (gallery && typeof gallery.toggleLike === 'function') {
                    gallery.toggleLike(post.id, likeBtn);
                }
            });
        }
        
        const idBadge = extraInfo.querySelector('.media-id-badge');
        if (idBadge) {
            idBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = idBadge.dataset.id;
                if (id && id !== '?') {
                    const copyToClipboard = (text) => {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            return navigator.clipboard.writeText(text);
                        } else {
                            const textarea = document.createElement('textarea');
                            textarea.value = text;
                            textarea.style.position = 'fixed';
                            textarea.style.opacity = '0';
                            document.body.appendChild(textarea);
                            textarea.select();
                            try {
                                document.execCommand('copy');
                                return Promise.resolve();
                            } catch (err) {
                                return Promise.reject(err);
                            } finally {
                                document.body.removeChild(textarea);
                            }
                        }
                    };
                    
                    copyToClipboard(id).then(() => {
                        const originalText = idBadge.textContent;
                        idBadge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><polyline points="20 6 9 17 4 12"/></svg> Скопировано!';
                        idBadge.style.background = 'rgba(52, 227, 154, 0.15)';
                        idBadge.style.color = '#34e39a';
                        idBadge.style.borderColor = 'rgba(52, 227, 154, 0.25)';
                        setTimeout(() => {
                            idBadge.textContent = originalText;
                            idBadge.style.background = 'rgba(var(--accent-rgb, 167, 139, 250), 0.12)';
                            idBadge.style.color = 'var(--accent, #a78bfa)';
                            idBadge.style.borderColor = 'rgba(var(--accent-rgb, 167, 139, 250), 0.2)';
                        }, 1500);
                    }).catch(err => {
                        console.error('Failed to copy ID:', err);
                    });
                }
            });
        }
        
        extraInfo.querySelectorAll('.media-tag').forEach(el => {
            const tag = el.dataset.tag;
            
            const handleExclude = () => {
                if (window.tagSearch) {
                    const existing = window.tagSearch.activeTags.find(t => t.value === tag);
                    if (!existing || existing.active) {
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tag);
                        window.tagSearch.activeTags.push({ value: tag, active: false });
                    }
                    if (window.addExcludedTag) window.addExcludedTag(tag);
                    window.tagSearch.updateActiveTagsDisplay();
                    
                    document.querySelectorAll(`.media-tag[data-tag="${CSS.escape(tag)}"]`).forEach(tagEl => {
                        tagEl.style.textDecoration = 'line-through';
                        tagEl.style.opacity = '0.5';
                        tagEl.classList.remove('active-tag');
                    });
                }
            };

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleExclude();
            };

            el.onclick = (e) => {
                e.stopPropagation();
                if (e.altKey) {
                    e.preventDefault();
                    handleExclude();
                    return;
                }
                if (window.tagSearch) {
                    const existing = window.tagSearch.activeTags.find(t => t.value === tag);
                    let becameActive = false;
                    if (existing && existing.active) {
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tag);
                    } else {
                        window.tagSearch.activeTags = window.tagSearch.activeTags.filter(t => t.value !== tag);
                        window.tagSearch.activeTags.push({ value: tag, active: true });
                        becameActive = true;
                    }
                    
                    document.querySelectorAll(`.media-tag[data-tag="${CSS.escape(tag)}"]`).forEach(tagEl => {
                        tagEl.style.textDecoration = 'none';
                        tagEl.style.opacity = '1';
                        if (becameActive) {
                            tagEl.classList.add('active-tag');
                        } else {
                            tagEl.classList.remove('active-tag');
                        }
                    });

                    window.tagSearch.updateActiveTagsDisplay();
                }
            };
        });
        return extraInfo;
    }

    static recategorizeTags(infoEl, typesMap) {
        const authorsListEl = infoEl.querySelector('.media-authors-list');
        const charactersListEl = infoEl.querySelector('.media-characters-list');
        const authorsGroup = infoEl.querySelector('.media-authors-group');
        const charactersGroup = infoEl.querySelector('.media-characters-group');
        const tagsTitleEl = infoEl.querySelector('.media-tags-title');
        const tagsListEl = infoEl.querySelector('.media-tags-list');
        
        if (!tagsListEl) return;
        
        if (authorsListEl) authorsListEl.innerHTML = '';
        if (charactersListEl) charactersListEl.innerHTML = '';
        
        const tagElements = Array.from(tagsListEl.querySelectorAll('.media-tag'));
        
        let hasAuthors = false;
        let hasCharacters = false;
        let hasOthers = false;
        
        const isAuthorType = (type) => {
            const normalized = String(type || '0').toLowerCase();
            return normalized === '1' || normalized === 'artist' || normalized === 'creator' || normalized === 'author' || normalized === '5';
        };

        const isCharacterType = (type) => {
            const normalized = String(type || '0').toLowerCase();
            return normalized === '4' || normalized === 'character' || normalized === 'char';
        };

        tagElements.forEach(el => {
            const tag = el.dataset.tag;
            const type = typesMap[tag] || '0';
            
            if (isAuthorType(type)) {
                if (authorsListEl) {
                    authorsListEl.appendChild(el);
                    hasAuthors = true;
                }
            } else if (isCharacterType(type)) {
                if (charactersListEl) {
                    charactersListEl.appendChild(el);
                    hasCharacters = true;
                }
            } else {
                hasOthers = true;
            }
        });
        
        if (authorsGroup) {
            authorsGroup.style.display = 'block';
            if (!hasAuthors && authorsListEl) {
                const span = document.createElement('span');
                span.style.color = 'rgba(255,255,255,0.4)';
                span.style.fontSize = '0.85rem';
                span.style.fontStyle = 'italic';
                span.textContent = '(нету)';
                authorsListEl.appendChild(span);
            }
        }
        if (charactersGroup) {
            charactersGroup.style.display = 'block';
            if (!hasCharacters && charactersListEl) {
                const span = document.createElement('span');
                span.style.color = 'rgba(255,255,255,0.4)';
                span.style.fontSize = '0.85rem';
                span.style.fontStyle = 'italic';
                span.textContent = '(нету)';
                charactersListEl.appendChild(span);
            }
        }
        if (hasOthers && tagsTitleEl) {
            tagsTitleEl.style.display = 'block';
        }
    }
}
