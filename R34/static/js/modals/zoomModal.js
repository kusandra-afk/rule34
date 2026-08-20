/**
 * Zoom / Fullscreen preview modal for posts and media
 */

import { icon } from '../icons.js';
import { proxyUrl } from '../api.js';

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function openZoomModal(post, options = {}) {
    const { onTagClick, onExcludeTag, getTagSearch } = options;

    let zoomOverlay = document.getElementById('preview-zoom-overlay');
    if (!zoomOverlay) {
        zoomOverlay = document.createElement('div');
        zoomOverlay.id = 'preview-zoom-overlay';
        zoomOverlay.className = 'preview-zoom-overlay';
        document.body.appendChild(zoomOverlay);
    }

    zoomOverlay.innerHTML = '';
    zoomOverlay.style.display = 'flex';

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'preview-zoom-content';

    const ext = (post.file_url?.split('.').pop() || '').toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov'].includes(ext);

    let mediaEl;
    if (isVideo) {
        mediaEl = document.createElement('video');
        mediaEl.src = proxyUrl(post.file_url);
        mediaEl.controls = true;
        mediaEl.autoplay = true;
        mediaEl.loop = true;
        mediaEl.style.maxWidth = '90vw';
        mediaEl.style.maxHeight = '70vh';
        mediaEl.style.borderRadius = '8px';
        mediaEl.style.outline = 'none';
    } else {
        mediaEl = document.createElement('img');
        mediaEl.src = proxyUrl(post.sample_url || post.file_url);
        mediaEl.style.maxWidth = '90vw';
        mediaEl.style.maxHeight = '70vh';
        mediaEl.style.objectFit = 'contain';
        mediaEl.style.borderRadius = '8px';
    }

    const rawSourceUrl = post.file_url || post.sample_url || '';
    const formattedSourceUrl = rawSourceUrl.startsWith('//') ? 'https:' + rawSourceUrl : (rawSourceUrl.startsWith('http') ? rawSourceUrl : 'https://' + rawSourceUrl);

    const infoBar = document.createElement('div');
    infoBar.className = 'preview-zoom-info';
    infoBar.innerHTML = `
        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 20px; font-size: 0.9rem;">
            <span style="color: #ff3b6b; font-weight: bold;">Score: ${escapeHTML(String(post.score))}</span>
            <span style="color: rgba(255,255,255,0.6);">ID: ${post.id}</span>
            <a href="${escapeHTML(formattedSourceUrl)}" target="_blank" style="color: #2dd4bf; text-decoration: none;">Источник ↗</a>
        </div>
        <div class="zoom-authors-group" style="display: none; margin-top: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 8px;">
            <div style="font-size: 0.8em; color: #2dd4bf; margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                ${icon('palette', { size: 16 })} Автор:
            </div>
            <div class="zoom-authors-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>
        <div class="zoom-characters-group" style="display: none; margin-top: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 8px;">
            <div style="font-size: 0.8em; color: var(--accent, #a78bfa); margin-bottom: 6px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px;">
                ${icon('user', { size: 16 })} Персонаж:
            </div>
            <div class="zoom-characters-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>
    `;

    // Categorize tags for Zoom Modal
    const tagNames = (post.tags || '').split(' ').filter(Boolean);
    if (tagNames.length > 0) {
        (async () => {
            try {
                const typesMap = {};
                const uncached = [];
                for (const tag of tagNames) {
                    const cached = localStorage.getItem(`r34_tagtype_${escapeHTML(tag)}`);
                    if (cached !== null) {
                        typesMap[tag] = cached;
                    } else {
                        uncached.push(tag);
                    }
                }

                if (uncached.length > 0) {
                    const chunk = uncached.slice(0, 10);
                    try {
                        const url = `https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&name=${encodeURIComponent(chunk.join(' '))}`;
                        const resp = await fetch(proxyUrl(url));
                        const text = await resp.text();
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(text, "text/xml");
                        const tagEls = xmlDoc.getElementsByTagName('tag');
                        for (const tagEl of tagEls) {
                            const name = tagEl.getAttribute('name');
                            const type = String(tagEl.getAttribute('type') || '0');
                            if (name) {
                                typesMap[name] = type;
                                localStorage.setItem(`r34_tagtype_${name}`, type);
                            }
                        }
                    } catch (e) {
                        console.error('Error batch fetching tags for zoom:', e);
                    }
                }

                const authorsListEl = infoBar.querySelector('.zoom-authors-list');
                const charactersListEl = infoBar.querySelector('.zoom-characters-list');
                const authorsGroup = infoBar.querySelector('.zoom-authors-group');
                const charactersGroup = infoBar.querySelector('.zoom-characters-group');

                let hasAuthors = false;
                let hasCharacters = false;

                const isAuthorType = (type) => {
                    const normalized = String(type || '0').toLowerCase();
                    return normalized === '1' || normalized === 'artist' || normalized === 'creator' || normalized === 'author' || normalized === '5';
                };

                const isCharacterType = (type) => {
                    const normalized = String(type || '0').toLowerCase();
                    return normalized === '4' || normalized === 'character' || normalized === 'char';
                };

                const tagSearch = typeof getTagSearch === 'function' ? getTagSearch() : window.tagSearch;

                for (const tag of tagNames) {
                    const type = typesMap[tag] || '0';
                    if (isAuthorType(type) || isCharacterType(type)) {
                        const span = document.createElement('span');
                        span.className = 'media-tag';
                        span.textContent = tag;
                        span.style.fontSize = '0.8rem';
                        span.style.padding = '3px 8px';

                        // Check status
                        const existing = tagSearch && tagSearch.activeTags ? tagSearch.activeTags.find(t => t.value === tag) : null;
                        if (existing) {
                            if (existing.active) {
                                span.classList.add('active-tag');
                            } else {
                                span.style.textDecoration = 'line-through';
                                span.style.opacity = '0.5';
                            }
                        }

                        const handleExclude = () => {
                            if (typeof onExcludeTag === 'function') {
                                onExcludeTag(tag);
                            } else if (tagSearch) {
                                const existing = tagSearch.activeTags.find(t => t.value === tag);
                                if (!existing || existing.active) {
                                    tagSearch.activeTags = tagSearch.activeTags.filter(t => t.value !== tag);
                                    tagSearch.activeTags.push({ value: tag, active: false });
                                }
                                if (window.addExcludedTag) window.addExcludedTag(tag);
                                tagSearch.updateActiveTagsDisplay();
                            }
                            span.style.textDecoration = 'line-through';
                            span.style.opacity = '0.5';
                            span.classList.remove('active-tag');
                        };

                        span.oncontextmenu = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleExclude();
                        };

                        span.onclick = (e) => {
                            e.stopPropagation();
                            if (e.altKey) {
                                e.preventDefault();
                                handleExclude();
                                return;
                            }
                            zoomOverlay.style.display = 'none';
                            const tagModal = document.getElementById('tag-modal');
                            if (tagModal) tagModal.style.display = 'none';

                            if (typeof onTagClick === 'function') {
                                onTagClick(tag);
                            } else if (tagSearch) {
                                const existing = tagSearch.activeTags.find(t => t.value === tag);
                                if (existing && existing.active) {
                                    tagSearch.activeTags = tagSearch.activeTags.filter(t => t.value !== tag);
                                } else {
                                    tagSearch.activeTags = tagSearch.activeTags.filter(t => t.value !== tag);
                                    tagSearch.activeTags.push({ value: tag, active: true });
                                }
                                tagSearch.updateActiveTagsDisplay();
                                if (window.reloadGallery) window.reloadGallery();
                            }
                        };

                        if (isAuthorType(type)) {
                            if (authorsListEl) {
                                authorsListEl.appendChild(span);
                                hasAuthors = true;
                            }
                        } else {
                            if (charactersListEl) {
                                charactersListEl.appendChild(span);
                                hasCharacters = true;
                            }
                        }
                    }
                }

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

            } catch (err) {
                console.error('Failed to categorize tags for zoom:', err);
            }
        })();
    }

    contentWrapper.appendChild(mediaEl);
    contentWrapper.appendChild(infoBar);
    zoomOverlay.appendChild(contentWrapper);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'zoom-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
        zoomOverlay.style.display = 'none';
        if (isVideo && mediaEl) {
            mediaEl.pause();
            mediaEl.src = '';
        }
    };
    zoomOverlay.appendChild(closeBtn);

    // Close when clicking anywhere on overlay
    zoomOverlay.onclick = (e) => {
        if (e.target === zoomOverlay || (e.target.closest('.preview-zoom-overlay') && !e.target.closest('.preview-zoom-content'))) {
            zoomOverlay.style.display = 'none';
            if (isVideo && mediaEl) {
                mediaEl.pause();
                mediaEl.src = '';
            }
        }
    };

    const escHandler = (e) => {
        if (e.key === 'Escape' && !e.shiftKey) {
            zoomOverlay.style.display = 'none';
            if (isVideo && mediaEl) {
                mediaEl.pause();
                mediaEl.src = '';
            }
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}
