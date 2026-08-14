import { resolveCanonicalTag } from './canonicalTags.js';

export function proxyUrl(url) {
    return '/proxy?url=' + encodeURIComponent(url);
}

// Tag count request deduplication only. Do not persist tag counts in localStorage.
const inFlightTagCountRequests = new Map();

function getCachedTagCount(tag) {
    return null;
}

function setCachedTagCount(tag, count) {
    return;
}

export async function fetchTagCount(tag, skipCache = false) {
    if (!tag) return 0;
    let trimmed = tag.trim();
    if (!trimmed) return 0;

    // Preserve creator: prefix so author-based searches use the same API syntax.
    const tagForApi = trimmed;

    // 1. Check cache first (unless skipCache is true)
    if (!skipCache) {
        const cached = getCachedTagCount(tagForApi);
        if (cached !== null) {
            return cached;
        }
    }

    // 2. Deduplicate concurrent requests for the same tag
    const reqKey = tagForApi.toLowerCase();
    if (inFlightTagCountRequests.has(reqKey)) {
        return inFlightTagCountRequests.get(reqKey);
    }

    const fetchPromise = (async () => {
        try {
            const resp = await fetch(proxyUrl(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(tagForApi)}&limit=1`));
            if (resp.status === 429 || resp.status === 403) {
                console.warn(`[Rule34 API] Rate limit (${resp.status}) when fetching count for tag "${tagForApi}"`);
                return '?';
            }
            const xmlStr = await resp.text();
            if (xmlStr.includes("Cloudflare") || xmlStr.includes("Rate limit")) {
                console.warn(`[Rule34 API] Cloudflare rate limit page received for tag count "${tagForApi}"`);
                return '?';
            }
            const match = xmlStr.match(/<posts\s+count="(\d+)"/i);
            const count = match ? parseInt(match[1], 10) : 0;
            // Only cache if not skipped
            if (!skipCache) {
                setCachedTagCount(tagForApi, count);
            }
            return count;
        } catch (e) {
            console.error(`[Rule34 API] Error fetching count for tag "${tagForApi}":`, e);
            return '?';
        } finally {
            inFlightTagCountRequests.delete(reqKey);
        }
    })();

    inFlightTagCountRequests.set(reqKey, fetchPromise);
    return fetchPromise;
}

const BANNED_IMAGE_TAGS = ['gay', 'gay_sex', 'male/male', 'male_only', 'fart', 'pissing'];

export async function fetchTagInfo(tag, noAi = false) {
    if (!tag) return { name: tag, count: 0, imageUrl: null };
    const rawTrimmed = tag.trim();
    if (!rawTrimmed) return { name: rawTrimmed, count: 0, imageUrl: null };
    const trimmed = resolveCanonicalTag(rawTrimmed);

    try {
        let searchTags = trimmed + ' sort:random -gay -gay_sex -male/male -male_only -fart -pissing';
        if (noAi) {
            searchTags += ' -ai_generated -artificial_images -stable_diffusion -midjourney -dall-e -novelai';
        }
        const resp = await fetch(proxyUrl(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(searchTags)}&limit=10&fields=tag_info`));
        if (resp.status === 429 || resp.status === 403) {
            return { name: trimmed, count: 0, imageUrl: null, images: [], imageUrls: [] };
        }
        const xmlStr = await resp.text();
        
        const countMatch = xmlStr.match(/<posts\s+count="(\d+)"/i);
        const count = countMatch ? parseInt(countMatch[1], 10) : 0;

        if (count === 0) {
            return { name: trimmed, count: 0, imageUrl: null, images: [], imageUrls: [] };
        }

        const images = [];
        let copyright = null;
        let tagType = null;
        const allPostTags = new Set();

        // Try to fetch exact tag metadata (type and accurate count)
        try {
            const metaResp = await fetch(proxyUrl(`https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&name=${encodeURIComponent(trimmed)}`));
            if (metaResp.ok) {
                const metaXml = await metaResp.text();
                const tagMatch = metaXml.match(/<tag\s+([^>]+)>/i);
                if (tagMatch) {
                    const typeMatch = tagMatch[1].match(/type="(\d+)"/i);
                    if (typeMatch) {
                        tagType = parseInt(typeMatch[1], 10);
                    }
                    const cntMatch = tagMatch[1].match(/count="(\d+)"/i);
                    if (cntMatch) {
                        const parsedCount = parseInt(cntMatch[1], 10);
                        if (!isNaN(parsedCount) && parsedCount > 0) {
                            count = parsedCount;
                        }
                    }
                }
            }
        } catch (metaErr) {
            // Non-blocking
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
        const postEls = xmlDoc.getElementsByTagName('post');

        for (let i = 0; i < postEls.length; i++) {
            const postEl = postEls[i];
            
            // Check post tags for banned tags
            const postTagsAttr = (postEl.getAttribute('tags') || '').toLowerCase();
            const tagNamesList = postTagsAttr.split(/\s+/).filter(Boolean);
            tagNamesList.forEach(t => allPostTags.add(t));
            let hasBannedTag = false;
            for (const banned of BANNED_IMAGE_TAGS) {
                if (tagNamesList.includes(banned) || (banned.includes('/') && postTagsAttr.includes(banned))) {
                    hasBannedTag = true;
                    break;
                }
            }
            if (hasBannedTag) continue;

            const childTags = postEl.getElementsByTagName('tag');
            for (let j = 0; j < childTags.length; j++) {
                const tagName = (childTags[j].getAttribute('name') || '').toLowerCase();
                if (BANNED_IMAGE_TAGS.includes(tagName)) {
                    hasBannedTag = true;
                    break;
                }
            }
            if (hasBannedTag) continue;

            // Extract image url candidate
            const sampleUrl = postEl.getAttribute('sample_url');
            const fileUrl = postEl.getAttribute('file_url');
            const previewUrl = postEl.getAttribute('preview_url');
            const candidates = [sampleUrl, fileUrl, previewUrl].filter(Boolean);
            
            for (let raw of candidates) {
                let clean = raw.replace(/&amp;/g, '&');
                if (clean.startsWith('//')) clean = 'https:' + clean;
                if (!clean.endsWith('.webm') && !clean.endsWith('.mp4')) {
                    const finalUrl = proxyUrl(clean);
                    if (!images.includes(finalUrl)) {
                        images.push(finalUrl);
                    }
                    break;
                }
            }

            // Extract copyright tag (type="3" or type="copyright")
            if (!copyright) {
                const tagEls = postEl.getElementsByTagName('tag');
                for (let j = 0; j < tagEls.length; j++) {
                    const tagEl = tagEls[j];
                    const name = tagEl.getAttribute('name');
                    const type = tagEl.getAttribute('type');
                    if (name && (type === '3' || type === 'copyright')) {
                        copyright = name;
                        break;
                    }
                }
            }
        }

        // Fallback for image urls if XML parsing missed them
        if (images.length === 0) {
            const postMatches = xmlStr.match(/<post\s+[^>]+>/gi) || [];
            for (const postXml of postMatches) {
                // Check if postXml contains banned tags
                const postXmlLower = postXml.toLowerCase();
                let hasBanned = false;
                for (const banned of BANNED_IMAGE_TAGS) {
                    if (postXmlLower.includes(`"${banned}"`) || postXmlLower.includes(` ${banned} `) || postXmlLower.includes(banned)) {
                        hasBanned = true;
                        break;
                    }
                }
                if (hasBanned) continue;

                const sampleMatch = postXml.match(/sample_url="([^"]+)"/i);
                const fileMatch = postXml.match(/file_url="([^"]+)"/i);
                const previewMatch = postXml.match(/preview_url="([^"]+)"/i);

                const candidates = [
                    sampleMatch ? sampleMatch[1] : null,
                    fileMatch ? fileMatch[1] : null,
                    previewMatch ? previewMatch[1] : null
                ].filter(Boolean);

                for (let raw of candidates) {
                    let clean = raw.replace(/&amp;/g, '&');
                    if (clean.startsWith('//')) clean = 'https:' + clean;
                    if (!clean.endsWith('.webm') && !clean.endsWith('.mp4')) {
                        const finalUrl = proxyUrl(clean);
                        if (!images.includes(finalUrl)) {
                            images.push(finalUrl);
                        }
                        break;
                    }
                }
            }
        }

        const primaryImage = images.length > 0 ? images[0] : null;

        return { 
            name: trimmed, 
            count, 
            type: tagType, 
            isCharacter: tagType === 4,
            isCopyright: tagType === 3,
            isGeneral: tagType === 0,
            imageUrl: primaryImage,
            images: images,
            imageUrls: images,
            currentImageIndex: 0,
            postTags: Array.from(allPostTags),
            copyright 
        };
    } catch (e) {
        console.error(`Error fetching info for tag "${trimmed}":`, e);
        return { name: trimmed, count: 0, imageUrl: null, images: [], imageUrls: [] };
    }
}

export async function fetchMoreTagImages(tagName, noAi = false, pid = 1) {
    if (!tagName) return [];
    try {
        let searchTags = tagName.trim() + ' sort:random -gay -gay_sex -male/male -male_only -fart -pissing';
        if (noAi) {
            searchTags += ' -ai_generated -artificial_images -stable_diffusion -midjourney -dall-e -novelai';
        }
        const resp = await fetch(proxyUrl(`https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(searchTags)}&limit=10&pid=${pid}`));
        if (!resp.ok) return [];
        const xmlStr = await resp.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
        const postEls = xmlDoc.getElementsByTagName('post');
        const list = [];
        for (let i = 0; i < postEls.length; i++) {
            const postEl = postEls[i];
            const sampleUrl = postEl.getAttribute('sample_url') || postEl.getAttribute('file_url') || postEl.getAttribute('preview_url');
            if (sampleUrl) {
                let clean = sampleUrl.replace(/&amp;/g, '&');
                if (clean.startsWith('//')) clean = 'https:' + clean;
                if (!clean.endsWith('.webm') && !clean.endsWith('.mp4')) {
                    list.push(proxyUrl(clean));
                }
            }
        }
        return list;
    } catch (e) {
        return [];
    }
}

const autocompleteCache = new Map();

function isRateLimitResponse(textOrStatus, text) {
    if (typeof textOrStatus === 'number') {
        return textOrStatus === 429 || textOrStatus === 403 || textOrStatus >= 500;
    }

    const lowerText = (text || textOrStatus || '').toLowerCase();
    return lowerText.includes('cloudflare')
        || lowerText.includes('rate limit')
        || lowerText.includes('retry later')
        || lowerText.includes('maintenance')
        || lowerText.includes('api устал')
        || lowerText.includes('too many requests')
        || lowerText.includes('service unavailable')
        || lowerText.includes('temporarily unavailable')
        || lowerText.includes('<!doctype')
        || lowerText.includes('<html')
        || lowerText.includes('<script');
}

export async function fetchAutocomplete(query, prefix = '') {
    if (!query) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];

    // extract last space-separated word if query contains multiple words
    const words = trimmed.split(/\s+/);
    const key = words[words.length - 1].toLowerCase();
    if (!key) return [];

    const cacheKey = prefix ? `${prefix}:${key}` : key;
    if (autocompleteCache.has(cacheKey)) {
        return autocompleteCache.get(cacheKey);
    }

    try {
        const searchQuery = prefix ? `${prefix}:${key}` : key;
        const resp = await fetch(proxyUrl(`https://api.rule34.xxx/autocomplete.php?q=${encodeURIComponent(searchQuery)}`));
        if (isRateLimitResponse(resp.status)) {
            console.warn(`[Rule34 API] Rate limit (${resp.status}) on autocomplete for query "${key}"`);
            return [];
        }
        const text = await resp.text();
        if (isRateLimitResponse(text)) {
            console.warn(`[Rule34 API] Cloudflare rate limit on autocomplete for query "${key}"`);
            return [];
        }
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            const firstBracket = text.indexOf('[');
            const lastBracket = text.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket > firstBracket) {
                try {
                    parsed = JSON.parse(text.slice(firstBracket, lastBracket + 1));
                } catch (e2) {
                    console.error('Error parsing autocomplete json slice:', e2);
                }
            }
        }

        if (Array.isArray(parsed)) {
            autocompleteCache.set(cacheKey, parsed);
            if (autocompleteCache.size > 200) {
                const first = autocompleteCache.keys().next().value;
                if (first !== undefined) autocompleteCache.delete(first);
            }
            return parsed;
        }
        return [];
    } catch (e) {
        console.error('[Rule34 API] Autocomplete load error:', e);
        return [];
    }
}

function normalizePostFromApi(post) {
    if (!post || typeof post !== 'object') {
        return {};
    }

    const normalized = { ...post };

    const rawTags = Array.isArray(post.tags) ? post.tags : null;
    const rawTagsWithTypes = Array.isArray(post.tags_with_types) ? post.tags_with_types : null;

    if (!normalized.tagsWithTypes) {
        if (rawTagsWithTypes) {
            normalized.tagsWithTypes = rawTagsWithTypes.map(tag => {
                if (typeof tag === 'string') {
                    return { name: tag, type: null };
                }
                if (tag && typeof tag === 'object') {
                    return {
                        name: tag.name || tag.value || '',
                        type: tag.type || tag.category || null
                    };
                }
                return { name: '', type: null };
            }).filter(tag => tag.name);
        } else if (rawTags) {
            normalized.tagsWithTypes = rawTags.map(tag => {
                if (typeof tag === 'string') {
                    return { name: tag, type: null };
                }
                if (tag && typeof tag === 'object') {
                    return {
                        name: tag.name || tag.value || '',
                        type: tag.type || tag.category || null
                    };
                }
                return { name: '', type: null };
            }).filter(tag => tag.name);
        }
    }

    if (!normalized.tags) {
        if (normalized.tagsWithTypes && normalized.tagsWithTypes.length > 0) {
            normalized.tags = normalized.tagsWithTypes.map(t => t.name).join(' ');
        } else if (rawTags && rawTags.length > 0) {
            normalized.tags = rawTags.map(tag => typeof tag === 'string' ? tag : (tag.name || tag.value || '')).filter(Boolean).join(' ');
        }
    }

    return normalized;
}

function parsePostsResponse(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
        return [];
    }

    const firstChar = trimmed[0];
    if (firstChar === '[' || firstChar === '{') {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed.map(normalizePostFromApi);
            }
            if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.posts)) {
                    return parsed.posts.map(normalizePostFromApi);
                }
                if (Array.isArray(parsed.post)) {
                    return parsed.post.map(normalizePostFromApi);
                }
                if (parsed.post && typeof parsed.post === 'object') {
                    return [normalizePostFromApi(parsed.post)];
                }
            }
        } catch (e) {
            console.error('[Rule34 API] Error parsing posts JSON:', e);
        }
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
    const postEls = xmlDoc.getElementsByTagName('post');
    const posts = [];

    for (let i = 0; i < postEls.length; i++) {
        const postEl = postEls[i];
        const post = {};

        const attributes = postEl.attributes;
        for (let j = 0; j < attributes.length; j++) {
            const attr = attributes[j];
            post[attr.name] = attr.value;
        }

        const tagsWithTypes = [];
        const tagEls = postEl.getElementsByTagName('tag');
        for (let k = 0; k < tagEls.length; k++) {
            const tagEl = tagEls[k];
            const tagName = tagEl.getAttribute('name');
            const tagType = tagEl.getAttribute('type');
            if (tagName) {
                tagsWithTypes.push({ name: tagName, type: tagType });
            }
        }

        post.tagsWithTypes = tagsWithTypes;
        post.tags = tagsWithTypes.map(t => t.name).join(' ');
        posts.push(post);
    }

    return posts;
}

// теперь с поддержкой пагинации (infinite scroll)
export async function fetchPosts(tagsQuery, popularOnly, page = 0) {
    // Используем настройки API из localStorage
    const apiLimit = parseInt(localStorage.getItem('r34_api_limit') || '40', 10);
    const apiTimeout = parseInt(localStorage.getItem('r34_api_timeout') || '15', 10) * 1000;
    const apiRetries = parseInt(localStorage.getItem('r34_api_retries') || '3', 10);
    const apiRetryDelay = parseInt(localStorage.getItem('r34_api_retry_delay') || '2', 10) * 1000;
    const apiCacheEnabled = false; // Полностью отключаем кэш постов для гарантированного получения свежего контента
    
    const limit = Math.min(Math.max(apiLimit, 1), 1000); // Ограничиваем от 1 до 1000
    let tagPart = tagsQuery ? tagsQuery.trim() : '';
    if (popularOnly) {
        tagPart = tagPart ? tagPart + ' score:>=100' : 'score:>=100';
    }

    // Добавляем исключения нежелательных тегов если они не запрошены явно
    const bannedExclusions = BANNED_IMAGE_TAGS
        .filter(b => !tagPart.toLowerCase().includes(b))
        .map(b => `-${b}`)
        .join(' ');
    
    if (bannedExclusions) {
        tagPart = tagPart ? `${tagPart} ${bannedExclusions}` : bannedExclusions;
    }

    let url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${encodeURIComponent(tagPart)}&limit=${limit}&json=1&fields=tag_info&cb=${Date.now()}`;
    if (page > 0) url += `&pid=${page}`;
    
    // Кэш для API ответов
    const cacheKey = `api_cache_${url}`;
    if (apiCacheEnabled) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const cachedData = JSON.parse(cached);
                const cacheAge = Date.now() - cachedData.timestamp;
                // Кэш действителен 5 минут
                if (cacheAge < 5 * 60 * 1000) {
                    console.log('[Rule34 API] Using cached response for:', url);
                    return cachedData.data;
                }
            } catch (e) {
                console.warn('[Rule34 API] Cache parse error:', e);
            }
        }
    }
    
    // Функция для выполнения запроса с повторами
    const fetchWithRetry = async (attempt = 0) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), apiTimeout);
            
            const response = await fetch(proxyUrl(url), { 
                signal: controller.signal 
            });
            
            clearTimeout(timeoutId);
            
            if (isRateLimitResponse(response.status)) {
                console.warn(`[Rule34 API] Posts fetch rate limited with HTTP status ${response.status} (attempt ${attempt + 1}/${apiRetries})`);
                if (attempt < apiRetries - 1) {
                    console.log(`[Rule34 API] Retrying in ${apiRetryDelay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, apiRetryDelay));
                    return fetchWithRetry(attempt + 1);
                }
                throw new Error("RATE_LIMIT");
            }
            
            const text = await response.text();
            if (!text || text.trim() === '') {
                return [];
            }
            
            const trimmed = text.trim();
            if (isRateLimitResponse(trimmed)) {
                console.warn('[Rule34 API] Posts fetch blocked by Cloudflare or rate limit body (attempt ${attempt + 1}/${apiRetries})');
                if (attempt < apiRetries - 1) {
                    console.log(`[Rule34 API] Retrying in ${apiRetryDelay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, apiRetryDelay));
                    return fetchWithRetry(attempt + 1);
                }
                const err = new Error("RATE_LIMIT");
                err.isRateLimit = true;
                err.responseText = trimmed.slice(0, 200);
                throw err;
            }

            const lowerTrimmed = trimmed.toLowerCase();
            if (lowerTrimmed.startsWith("<!doctype") || lowerTrimmed.startsWith("<html") || lowerTrimmed.startsWith("<script")) {
                console.warn('[Rule34 API] Posts fetch returned HTML instead of data (likely Cloudflare challenge or Rate Limit) (attempt ${attempt + 1}/${apiRetries})');
                if (attempt < apiRetries - 1) {
                    console.log(`[Rule34 API] Retrying in ${apiRetryDelay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, apiRetryDelay));
                    return fetchWithRetry(attempt + 1);
                }
                const err = new Error("RATE_LIMIT");
                err.isRateLimit = true;
                err.responseText = trimmed.slice(0, 200);
                throw err;
            }

            try {
                const rawData = parsePostsResponse(trimmed);
                const data = Array.isArray(rawData) ? rawData.filter(post => {
                    if (!post) return false;
                    const postTags = (post.tags || '').toLowerCase();
                    const tagList = postTags.split(/\s+/);
                    for (const banned of BANNED_IMAGE_TAGS) {
                        if (tagList.includes(banned)) return false;
                        if (banned.includes('/') && postTags.includes(banned)) return false;
                    }
                    if (Array.isArray(post.tagsWithTypes)) {
                        for (const t of post.tagsWithTypes) {
                            const tName = (t.name || '').toLowerCase();
                            if (BANNED_IMAGE_TAGS.includes(tName)) return false;
                        }
                    }
                    return true;
                }) : rawData;
                
                if (Array.isArray(data)) {
                    data.rawCount = Array.isArray(rawData) ? rawData.length : data.length;
                }
                
                // Сохраняем в кэш
                if (apiCacheEnabled) {
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify({
                            timestamp: Date.now(),
                            data: data
                        }));
                    } catch (e) {
                        console.warn('[Rule34 API] Cache save error (likely quota exceeded):', e);
                    }
                }
                
                return data;
            } catch (e) {
                console.error('[Rule34 API] Error parsing posts response:', e, 'Response snippet:', trimmed.slice(0, 150));
                const err = new Error("RATE_LIMIT");
                err.isRateLimit = true;
                err.originalError = e;
                throw err;
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.warn(`[Rule34 API] Request timeout after ${apiTimeout / 1000}s (attempt ${attempt + 1}/${apiRetries})`);
                if (attempt < apiRetries - 1) {
                    console.log(`[Rule34 API] Retrying in ${apiRetryDelay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, apiRetryDelay));
                    return fetchWithRetry(attempt + 1);
                }
                const timeoutError = new Error("RATE_LIMIT");
                timeoutError.isRateLimit = true;
                timeoutError.isTimeout = true;
                throw timeoutError;
            }
            
            if (err.message === "RATE_LIMIT") {
                throw err;
            }
            
            const rateLimitError = new Error("RATE_LIMIT");
            rateLimitError.isRateLimit = true;
            rateLimitError.originalError = err;
            console.error('[Rule34 API] Network error during fetchPosts (attempt ${attempt + 1}/${apiRetries}):', err);
            
            if (attempt < apiRetries - 1) {
                console.log(`[Rule34 API] Retrying in ${apiRetryDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, apiRetryDelay));
                return fetchWithRetry(attempt + 1);
            }
            
            throw rateLimitError;
        }
    };
    
    return fetchWithRetry();
}

export async function fetchPostById(id) {
    if (!id) return null;
    let url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&id=${encodeURIComponent(id)}&json=1&fields=tag_info`;
    try {
        const response = await fetch(proxyUrl(url));
        if (isRateLimitResponse(response.status)) {
            console.warn(`[Rule34 API] fetchPostById rate limited (HTTP ${response.status})`);
            return null;
        }
        const text = await response.text();
        if (!text || text.trim() === '') {
            return null;
        }
        const trimmed = text.trim();
        const lowerTrimmed = trimmed.toLowerCase();
        if (lowerTrimmed.startsWith("<!doctype") || lowerTrimmed.startsWith("<html") || lowerTrimmed.startsWith("<script")) {
            console.warn('[Rule34 API] fetchPostById returned HTML (rate limited)');
            return null;
        }
        try {
            const arr = JSON.parse(text);
            return arr && arr.length > 0 ? arr[0] : null;
        } catch (e) {
            console.error('[Rule34 API] Error parsing post JSON:', e);
            return null;
        }
    } catch (err) {
        console.error('[Rule34 API] Network error during fetchPostById:', err);
        return null;
    }
}

export async function fetchPuzzleCompleted() {
    try {
        const response = await fetch('/api/puzzle-completed');
        if (!response.ok) {
            console.error('[Puzzle API] Failed to fetch puzzle_completed.json');
            return [];
        }
        const data = await response.json();
        return data.puzzles || [];
    } catch (e) {
        console.error('[Puzzle API] Error loading puzzle completed data:', e);
        return [];
    }
}

export async function savePuzzleCompleted(completedPuzzles) {
    try {
        const response = await fetch('/api/puzzle-completed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzles: completedPuzzles })
        });
        if (!response.ok) {
            console.error('[Puzzle API] Failed to save puzzle completed data');
            return false;
        }
        return true;
    } catch (e) {
        console.error('[Puzzle API] Error saving puzzle completed data:', e);
        return false;
    }
}

