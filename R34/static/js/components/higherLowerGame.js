import { fetchTagInfo, proxyUrl, fetchMoreTagImages } from '../api.js';
import { icon } from '../icons.js';
import { makeCustomDropdown } from './customDropdown.js';
import { renderOriginBadgeHtml, FRANCHISE_DATABASE } from '../characterOrigins.js';
import { formatDisplayTagName, resolveCanonicalTag } from '../canonicalTags.js';

const POPULAR_CHARACTER_SEED = [
    // Genshin Impact
    'ganyu_(genshin_impact)', 'hu_tao_(genshin_impact)', 'raiden_shogun', 'yae_miko_(genshin_impact)',
    'mona_(genshin_impact)', 'keqing_(genshin_impact)', 'eula_(genshin_impact)', 'shenhe_(genshin_impact)',
    'lisa_(genshin_impact)', 'jean_(genshin_impact)', 'yelan_(genshin_impact)', 'beidou_(genshin_impact)',
    'furina_(genshin_impact)', 'navia_(genshin_impact)', 'clorinde_(genshin_impact)', 'lumine_(genshin_impact)',
    'amber_(genshin_impact)', 'rosaria_(genshin_impact)', 'yoimiya_(genshin_impact)', 'nilou_(genshin_impact)',
    'dehya_(genshin_impact)', 'arlecchino_(genshin_impact)', 'kokomi_(genshin_impact)', 'layla_(genshin_impact)',
    
    // Honkai & ZZZ
    'kafka_(honkai:_star_rail)', 'firefly_(honkai:_star_rail)', 'acheron_(honkai:_star_rail)',
    'sparkle_(honkai:_star_rail)', 'silver_wolf_(honkai:_star_rail)', 'topaz_(honkai:_star_rail)',
    'march_7th_(honkai:_star_rail)', 'himeko_(honkai:_star_rail)', 'tingyun_(honkai:_star_rail)',
    'ruan_mei_(honkai:_star_rail)', 'black_swan_(honkai:_star_rail)', 'robin_(honkai:_star_rail)',
    'ellen_joe', 'jane_doe_(zenless_zone_zero)', 'nicole_demara', 'anby_demara', 'zhu_yuan',
    
    // Overwatch
    'd.va_(overwatch)', 'mercy_(overwatch)', 'widowmaker_(overwatch)', 'tracer_(overwatch)',
    'brigitte_(overwatch)', 'kiriko_(overwatch)', 'ashe_(overwatch)', 'pharah_(overwatch)',
    'mei_(overwatch)', 'sombra_(overwatch)',
    
    // Final Fantasy & Nier
    'tifa_lockhart', 'aerith_gainsborough', 'yuffie_kisaragi', '2b_(nier:automata)',
    'a2_(nier:automata)', 'rikku_(final_fantasy)', 'yuna_(final_fantasy)', 'cindy_aurum',
    
    // League of Legends
    'ahri', 'jinx_(league_of_legends)', 'katarina_(league_of_legends)', 'akali', 'evelynn',
    'kaisa_(league_of_legends)', 'miss_fortune_(league_of_legends)', 'lux_(league_of_legends)',
    'vi_(league_of_legends)', 'caitlyn_(league_of_legends)', 'sona_(league_of_legends)', 'riven_(league_of_legends)',
    
    // Fate Series
    'saber_(fate)', 'artoria_pendragon', 'astolfo_(fate)', 'rin_tohsaka', 'tamamo_no_mae_(fate)',
    'nero_claudius_(fate)', 'jeanne_d\'arc_(fate)', 'jeanne_alter_(fate)', 'scathach_(fate)',
    'mordred_(fate)', 'ishtar_(fate)', 'ereshkigal_(fate)', 'kama_(fate)', 'morgan_(fate)',
    
    // Anime & Manga & Gaming
    'hatsune_miku', 'asuka_langley_soryu', 'rei_ayanami', 'misato_katsuragi',
    'makima_(chainsaw_man)', 'power_(chainsaw_man)', 'yor_forger', 'frieren', 'fern_(sousou_no_frieren)',
    'rem_(re:zero)', 'ram_(re:zero)', 'emilia_(re:zero)', 'aqua_(konosuba)', 'megumin', 'darkness_(konosuba)',
    'lucy_(cyberpunk)', 'rebecca_(cyberpunk)', 'marin_kitagawa', 'ryuko_matoi', 'satsuki_kiryuin',
    'chun-li', 'cammy_white', 'juri_han', 'morrigan_aensland', 'mai_shiranui',
    'samus_aran', 'princess_zelda', 'princess_peach', 'princess_daisy', 'rosalina_(mario)', 'bowsette',
    'pyra_(xenoblade)', 'mythra_(xenoblade)', 'bayonetta',
    'nami_(one_piece)', 'nico_robin', 'boa_hancock', 'yamato_(one_piece)', 'uta_(one_piece)',
    'hinata_hyuga', 'tsunade_(naruto)', 'sakura_haruno', 'ino_yamanaka',
    'yoruichi_shihoin', 'rangiku_matsumoto', 'tier_harribel', 'orihime_inoue',
    'android_18', 'bulma', 'videl', 'miku_nakano', 'nino_nakano'
];

const POPULAR_COPYRIGHT_SEED = [
    'pokemon', 'genshin_impact', 'league_of_legends', 'overwatch', 'overwatch_2',
    'touhou', 'fate_(series)', 'fate/grand_order', 'fate/stay_night',
    'honkai:_star_rail', 'honkai_impact_3rd', 'zenless_zone_zero', 'blue_archive',
    'azur_lane', 'arknights', 'nikke', 'final_fantasy_vii', 'final_fantasy_xiv',
    'nier:automata', 'chainsaw_man', 'naruto', 'naruto_shippuden',
    'one_piece', 'bleach', 'dragon_ball', 'jojos_bizarre_adventure',
    'my_hero_academia', 'demon_slayer', 'kimetsu_no_yaiba', 'jujutsu_kaisen',
    'attack_on_titan', 'spy_x_family', 'neon_genesis_evangelion',
    're:zero_kara_hajimeru_isekai_seikatsu', 'kono_subarashii_sekai_ni_shukufuku_wo!',
    'dungeon_ni_deai_wo_motomeru_no_wa_machigatteiru_darou_ka', 'sword_art_online',
    'fairy_tail', 'hunter_x_hunter', 'fullmetal_alchemist', 'code_geass', 'death_note',
    'one-punch_man', 'sousou_no_frieren', 'oshi_no_ko', 'sono_bisque_doll_wa_koi_wo_suru',
    'ijiranaide_nagatoro-san', 'komi-san_wa_komyushou_desu', 'gotoubun_no_hanayome',
    'to_love-ru', 'high_school_dxd', 'bocchi_the_rock!', 'cyberpunk_2077', 'cyberpunk:_edgerunners',
    'street_fighter', 'tekken', 'mortal_kombat', 'dead_or_alive', 'guilty_gear',
    'resident_evil', 'the_witcher', 'metroid', 'super_mario', 'the_legend_of_zelda',
    'sonic_the_hedgehog', 'persona_5', 'danganronpa', 'dark_souls',
    'elden_ring', 'devil_may_cry', 'bayonetta', 'vocaloid', 'hololive', 'nijisanji',
    'dc_comics', 'marvel', 'star_wars', 'hazbin_hotel', 'helluva_boss',
    'sailor_moon', 'kill_la_kill', 'gurren_lagann', 'puella_magi_madoka_magica',
    'monogatari_(series)', 'black_lagoon', 'overlord', 'mushoku_tensei',
    'k-on!', 'azumanga_daioh', 'berserk', 'dungeon_meshi', 'splatoon', 'apex_legends',
    'fortnite', 'skullgirls', 'undertale', 'hollow_knight', 'world_of_warcraft',
    'kingdom_hearts', 'mass_effect', 'tomb_raider', 'fire_emblem', 'xenoblade_chronicles'
];

// Титаны и самые узнаваемые флагманы франшиз (гарантированный шанс появления в игре)
const FLAGSHIP_FRANCHISES = [
    'pokemon', 'genshin_impact', 'league_of_legends', 'overwatch', 'touhou',
    'fate/grand_order', 'honkai:_star_rail', 'zenless_zone_zero', 'blue_archive',
    'azur_lane', 'final_fantasy_vii', 'nier:automata', 'chainsaw_man', 'naruto',
    'one_piece', 'bleach', 'dragon_ball', 'jojos_bizarre_adventure', 'my_hero_academia',
    'kimetsu_no_yaiba', 'jujutsu_kaisen', 'attack_on_titan', 'spy_x_family',
    'neon_genesis_evangelion', 're:zero_kara_hajimeru_isekai_seikatsu',
    'kono_subarashii_sekai_ni_shukufuku_wo!', 'sword_art_online', 'sousou_no_frieren',
    'sono_bisque_doll_wa_koi_wo_suru', 'cyberpunk:_edgerunners', 'resident_evil',
    'the_legend_of_zelda', 'super_mario', 'sonic_the_hedgehog', 'street_fighter',
    'persona_5', 'vocaloid', 'hololive', 'hazbin_hotel'
];

const POPULAR_GENERAL_SEED = [
    'solo', '1girl', 'female', 'breasts', 'large_breasts', 'nipples', 'pussy',
    'ass', 'thighs', 'long_hair', 'blonde_hair', 'brown_hair', 'black_hair',
    'blue_hair', 'pink_hair', 'looking_at_viewer', 'smile', 'blush', 'open_mouth',
    'underwear', 'panties', 'bra', 'swimwear', 'bikini', 'nude', 'cleavage',
    'spread_legs', 'lying', 'sitting', 'standing', 'navel', 'collarbone'
];

let CHARACTER_TAGS = [...POPULAR_CHARACTER_SEED];
let GENERAL_TAGS = [...POPULAR_GENERAL_SEED];
let COPYRIGHT_TAGS = [...POPULAR_COPYRIGHT_SEED];

const MIN_CHARACTER_POSTS = 4000;
const MIN_COPYRIGHT_POSTS = 2500;
const BANNED_HL_TAGS = ['gay', 'gay_sex', 'male/male', 'male_only', 'fart', 'pissing'];

function isTagBanned(tag) {
    if (!tag) return true;
    const lower = tag.toLowerCase().trim();
    return BANNED_HL_TAGS.some(banned => lower === banned || lower.includes(`_${banned}`) || lower.includes(`${banned}_`) || lower.includes(banned));
}

let dynamicTagsLoaded = false;
let isLoadingTags = false;

async function loadDynamicPopularTags(force = false) {
    if (isLoadingTags) return;
    if (dynamicTagsLoaded && !force && CHARACTER_TAGS.length >= 50 && COPYRIGHT_TAGS.length >= 20 && GENERAL_TAGS.length >= 30) return;
    
    isLoadingTags = true;
    try {
        console.log('[HigherLower] Fetching dynamic tags from Rule34 API...');
        
        if (force) {
            CHARACTER_TAGS = [...POPULAR_CHARACTER_SEED];
            GENERAL_TAGS = [];
            COPYRIGHT_TAGS = [];
        }

        // Fetch popular tags across multiple pages of the tag endpoint
        const urls = [
            proxyUrl('https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&order=count&limit=300&json=1'),
            proxyUrl('https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&order=count&limit=300&pid=1&json=1'),
            proxyUrl('https://api.rule34.xxx/index.php?page=dapi&s=tag&q=index&order=count&limit=300&pid=2&json=1'),
            proxyUrl('https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=sort:random+-gay+-gay_sex+-male/male+-male_only+-fart+-pissing&limit=100&json=1')
        ];

        const results = await Promise.allSettled(urls.map(u => fetch(u)));

        for (const res of results) {
            if (res.status !== 'fulfilled' || !res.value.ok) continue;
            try {
                const text = await res.value.text();
                const trimmed = text.trim();
                if (!trimmed) continue;

                let data = null;
                if (trimmed.startsWith('<') || trimmed.includes('<?xml')) {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
                    
                    // Check if it's tag response
                    const xmlTags = xmlDoc.getElementsByTagName('tag');
                    if (xmlTags.length > 0) {
                        data = [];
                        for (let i = 0; i < xmlTags.length; i++) {
                            const tagEl = xmlTags[i];
                            data.push({
                                name: tagEl.getAttribute('name'),
                                count: tagEl.getAttribute('count'),
                                type: tagEl.getAttribute('type')
                            });
                        }
                    } else {
                        // Or post response
                        const xmlPosts = xmlDoc.getElementsByTagName('post');
                        if (xmlPosts.length > 0) {
                            data = [];
                            for (let i = 0; i < xmlPosts.length; i++) {
                                const postEl = xmlPosts[i];
                                data.push({
                                    tags: postEl.getAttribute('tags') || ''
                                });
                            }
                        }
                    }
                } else {
                    try {
                        data = JSON.parse(trimmed);
                    } catch (e) {}
                }

                if (!Array.isArray(data)) continue;

                for (const item of data) {
                    if (!item) continue;

                    // If it's a tag object with explicit type
                    if (item.name) {
                        const name = String(item.name).trim();
                        if (!name || name.length <= 2 || !isNaN(name) || isTagBanned(name)) continue;
                        if (['highres', 'commentary_request', 'tagme', 'check_tag', 'absurdres', 'translated', 'rule34', 'video', 'sound', 'webm', 'mp4'].includes(name)) continue;

                        const type = parseInt(item.type, 10);
                        const count = parseInt(item.count, 10);

                        const canonicalName = resolveCanonicalTag(name);
                        // STRICT TYPE 4 for characters only
                        if (type === 4) {
                            if (!isNaN(count) && count < MIN_CHARACTER_POSTS) {
                                continue;
                            }
                            if (!CHARACTER_TAGS.includes(canonicalName)) CHARACTER_TAGS.push(canonicalName);
                        } else if (type === 3) {
                            if (!isNaN(count) && count < MIN_COPYRIGHT_POSTS) {
                                continue;
                            }
                            if (!COPYRIGHT_TAGS.includes(canonicalName)) COPYRIGHT_TAGS.push(canonicalName);
                        } else if (type === 0 || isNaN(type)) {
                            if (!GENERAL_TAGS.includes(canonicalName)) GENERAL_TAGS.push(canonicalName);
                        }
                    }
                    // If it's a post object with general tags, add ONLY to GENERAL_TAGS (never to CHARACTER_TAGS)
                    else if (item.tags) {
                        const postTags = String(item.tags).split(/\s+/);
                        for (const rawTag of postTags) {
                            const tag = rawTag.trim();
                            if (!tag || tag.length <= 2 || !isNaN(tag) || isTagBanned(tag)) continue;
                            if (['highres', 'commentary_request', 'tagme', 'check_tag', 'absurdres', 'translated', 'rule34', 'video', 'sound', 'webm', 'mp4'].includes(tag)) continue;

                            if (!GENERAL_TAGS.includes(tag)) {
                                GENERAL_TAGS.push(tag);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[HigherLower] Error parsing API tag chunk:', e);
            }
        }

        console.log(`[HigherLower] Loaded dynamic tags: ${CHARACTER_TAGS.length} characters, ${COPYRIGHT_TAGS.length} copyrights, ${GENERAL_TAGS.length} general`);
        dynamicTagsLoaded = true;
    } catch (err) {
        console.error('[HigherLower] Error fetching dynamic tags from API:', err);
    } finally {
        isLoadingTags = false;
    }
}

export class HigherLowerGame {
    constructor() {
        // Load popular dynamic tags in background to expand game variety
        loadDynamicPopularTags().catch(() => {});

        this.container = null;
        this.mode = 'menu'; // 'menu', 'solo', 'lobby', 'multiplayer'
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('r34_hl_highscore') || '0', 10);
        const savedCat = localStorage.getItem('r34_hl_category');
        this.selectedCategory = (savedCat === 'copyrights' || savedCat === 'general') ? savedCat : 'characters';
        this.isNoAiMode = localStorage.getItem('r34_hl_no_ai') === 'true';
        this.leftTag = null;
        this.rightTag = null;
        this.tagCache = new Map();
        this.signalQueue = [];
        this.wsConnection = null;
        
        // Multiplayer State
        this.roomId = null;
        this.playerId = localStorage.getItem('r34_hl_player_id') || ('p_' + Math.random().toString(36).substr(2, 8));
        localStorage.setItem('r34_hl_player_id', this.playerId);
        this.playerName = localStorage.getItem('r34_hl_player_name') || ('Игрок_' + Math.floor(1000 + Math.random() * 9000));
        this.isHost = false;
        this.peer = null;
        this.hostConn = null;
        this.connections = [];
        this.roomData = null;
        this.previousPlayers = null;
        this.hasAnsweredCurrentRound = false;
        this.evaluatingRound = false;
        this.currentLeftTagData = null;
        this.currentRightTagData = null;
        this.multiplayerLoadingTags = false;
        this.loadingLeftName = null;
        this.loadingRightName = null;
        this.roomHeartbeatTimer = null;
        this.processedPacketIds = new Set();
        this.pollTimer = null;

        window.addEventListener('beforeunload', () => {
            if (this.roomId) {
                this.leaveRoom();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (window.safeScreen && window.safeScreen.isActive) return;
            if (!this.container || !this.container.classList.contains('open')) return;
            // Ignore if typing in input or select
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') {
                if (this.mode === 'solo' && !this.isTransitioning && this.leftTag && this.rightTag) {
                    const higherBtn = document.getElementById('hlBtnHigher');
                    if (higherBtn) higherBtn.click();
                } else if (this.mode === 'multiplayer' && this.roomData?.currentRound?.phase === 'guessing') {
                    const multiHigherBtn = document.getElementById('hlMultiHigherBtn');
                    if (multiHigherBtn) multiHigherBtn.click();
                }
            } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
                if (this.mode === 'solo' && !this.isTransitioning && this.leftTag && this.rightTag) {
                    const lowerBtn = document.getElementById('hlBtnLower');
                    if (lowerBtn) lowerBtn.click();
                } else if (this.mode === 'multiplayer' && this.roomData?.currentRound?.phase === 'guessing') {
                    const multiLowerBtn = document.getElementById('hlMultiLowerBtn');
                    if (multiLowerBtn) multiLowerBtn.click();
                }
            } else if (e.key === 'Escape') {
                const lightbox = document.querySelector('.hl-lightbox');
                if (lightbox) {
                    lightbox.remove();
                }
            }
        });

        this.initUI();
    }

    initUI() {
        let overlay = document.getElementById('hlGameOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'hlGameOverlay';
            overlay.className = 'hl-overlay';
            document.body.appendChild(overlay);
        }
        this.container = overlay;
    }

    open() {
        this.container.classList.add('open');
        document.body.style.overflow = 'hidden';
        this.renderMenu();
    }

    async close() {
        this.container.classList.remove('open');
        document.body.style.overflow = '';
        await this.leaveRoom();
    }

    showToast(message, type = 'danger') {
        if (window.safeScreen && window.safeScreen.isActive) return;
        let container = document.getElementById('hl-global-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hl-global-toast-container';
            container.className = 'hl-toast-container';
            container.style.cssText = `
                position: fixed;
                top: 24px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000000;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
                width: 90%;
                max-width: 480px;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'hl-toast-banner';
        if (type === 'warning' || type === 'danger') {
            toast.style.borderColor = 'rgba(239, 68, 68, 0.6)';
            toast.style.color = '#fca5a5';
        } else if (type === 'info') {
            toast.style.borderColor = 'rgba(167, 139, 250, 0.6)';
            toast.style.color = '#c4b5fd';
        } else if (type === 'success') {
            toast.style.borderColor = 'rgba(16, 185, 129, 0.6)';
            toast.style.color = '#6ee7b7';
        }

        toast.innerHTML = `
            <span style="font-size: 1.1rem; display: flex; align-items: center;">${type === 'info' ? icon('user', { size: 16 }) : type === 'success' ? icon('check', { size: 16 }) : icon('x', { size: 16 })}</span>
            <span>${this.escapeHtml(message)}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-15px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    showModalAlert(title, message, onOk) {
        const existing = document.getElementById('hlModalAlert');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'hlModalAlert';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            backdrop-filter: blur(4px);
            padding: 16px;
        `;

        modal.innerHTML = `
            <div style="background: #1e1e24; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; padding: 24px; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; color: #fff; font-family: inherit;">
                <div style="font-size: 1.25rem; font-weight: 700; margin-bottom: 12px; color: #f87171;">${this.escapeHtml(title)}</div>
                <div style="font-size: 0.95rem; color: #cbd5e1; margin-bottom: 24px; line-height: 1.5;">${this.escapeHtml(message)}</div>
                <button id="hlModalOkBtn" style="background: #ef4444; color: white; border: none; border-radius: 10px; padding: 10px 24px; font-weight: 600; font-size: 0.95rem; cursor: pointer; width: 100%; transition: background 0.2s;">OK</button>
            </div>
        `;

        document.body.appendChild(modal);

        const btn = modal.querySelector('#hlModalOkBtn');
        btn.addEventListener('click', () => {
            modal.remove();
            if (onOk) onOk();
        });
    }

    async fetchActiveRooms() {
        try {
            const res = await fetch('https://ntfy.sh/r34_active_rooms/json?since=all');
            if (!res.ok) return [];
            const text = await res.text();
            const lines = text.trim().split('\n');
            const roomsMap = new Map();
            
            for (const line of lines) {
                if (!line) continue;
                try {
                    const raw = JSON.parse(line);
                    if (raw.message) {
                        const data = JSON.parse(raw.message);
                        if (data && data.code) {
                            if (data.action === 'REMOVE' || data.status === 'playing') {
                                roomsMap.delete(data.code);
                            } else if (Date.now() - (data.timestamp || 0) < 60000) {
                                roomsMap.set(data.code, data);
                            }
                        }
                    }
                } catch (err) {}
            }
            return Array.from(roomsMap.values());
        } catch (e) {
            return [];
        }
    }

    renderActiveRoomsModal() {
        const existing = document.getElementById('hlRoomsModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'hlRoomsModal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            backdrop-filter: blur(6px);
            padding: 16px;
        `;

        modal.innerHTML = `
            <div style="background: #1e1e24; border: 1px solid rgba(var(--accent-rgb, 167, 139, 250), 0.3); border-radius: 20px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); color: var(--adaptive-text-main, #fff); font-family: inherit; display: flex; flex-direction: column; max-height: 80vh;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent, #a78bfa); display: flex; align-items: center; gap: 8px;">
                        🌐 Активные комнаты онлайн
                    </div>
                    <button id="hlCloseRoomsModal" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer; padding: 4px;">&times;</button>
                </div>
                
                <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 16px;">
                    Выберите комнату из списка или введите код вручную.
                </div>

                <div id="hlRoomsListContainer" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; min-height: 160px; max-height: 320px;">
                    <div style="text-align: center; color: #94a3b8; padding: 40px 0;">Загрузка списка комнат...</div>
                </div>

                <div style="display: flex; gap: 10px;">
                    <button id="hlRefreshRoomsBtn" class="hl-btn-secondary" style="flex: 1; padding: 10px; font-size: 0.9rem;">Обновить список</button>
                    <button id="hlCloseModalBtn" class="hl-btn-primary" style="flex: 1; padding: 10px; font-size: 0.9rem;">Закрыть</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const loadRooms = async () => {
            const listEl = document.getElementById('hlRoomsListContainer');
            if (!listEl) return;
            listEl.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 40px 0;">Поиск комнат...</div>`;
            const rooms = await this.fetchActiveRooms();

            if (rooms.length === 0) {
                listEl.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 40px 0;">Нет активных комнат. Создайте свою!</div>`;
                return;
            }

            listEl.innerHTML = rooms.map(r => `
                <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                    <div>
                        <div style="font-weight: 700; font-size: 1rem; color: #fff; margin-bottom: 2px;">Комната: ${this.escapeHtml(r.hostName)}</div>
                        <div style="font-size: 0.8rem; color: #94a3b8; display: flex; gap: 10px;">
                            <span>Код: <b style="color: var(--accent, #a78bfa); letter-spacing: 1px;">${r.code}</b></span>
                            <span>Игроки: ${r.currentPlayers}/${r.maxPlayers}</span>
                            <span>До победы: ${r.targetScore}</span>
                        </div>
                    </div>
                    <button class="hl-btn-primary hl-join-listed-room" data-code="${r.code}" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto;">Войти</button>
                </div>
            `).join('');

            listEl.querySelectorAll('.hl-join-listed-room').forEach(btn => {
                btn.addEventListener('click', () => {
                    const code = btn.getAttribute('data-code');
                    modal.remove();
                    const codeInput = document.getElementById('hlRoomCodeInput');
                    if (codeInput) codeInput.value = code;
                    this.joinRoom(code);
                });
            });
        };

        loadRooms();

        modal.querySelector('#hlCloseRoomsModal').addEventListener('click', () => modal.remove());
        modal.querySelector('#hlCloseModalBtn').addEventListener('click', () => modal.remove());
        modal.querySelector('#hlRefreshRoomsBtn').addEventListener('click', () => loadRooms());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }
    async leaveRoom() {
        this.syncLogs = [];
        const wasHost = this.isHost;
        const prevRoomId = this.roomId;

        if (this.roomId) {
            fetch('/api/room/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: this.roomId, playerId: this.playerId })
            }).catch(() => {});
        }
        if (this.roomHeartbeatTimer) {
            clearInterval(this.roomHeartbeatTimer);
            this.roomHeartbeatTimer = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }
        if (this.eventSource) {
            try { this.eventSource.close(); } catch(err) {}
            this.eventSource = null;
        }

        if (this.isHost) {
            this.connections.forEach(c => {
                if (c.dc && c.dc.readyState === 'open') {
                    try {
                        c.dc.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                    } catch (e) {}
                    c.dc.close();
                }
            });
            this.connections = [];
        } else if (this.hostConn && this.hostConn.readyState === 'open') {
            try {
                this.hostConn.send(JSON.stringify({ type: 'LEAVE', playerId: this.playerId }));
            } catch (e) {}
            this.hostConn.close();
        }

        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        this.hostConn = null;
        this.roomId = null;
        this.roomData = null;
        this.previousPlayers = null;
        this.isHost = false;
        this.currentLeftTagData = null;
        this.currentRightTagData = null;
        this.multiplayerLoadingTags = false;
        this.loadingLeftName = null;
        this.loadingRightName = null;

        if (prevRoomId) {
            if (wasHost) {
                this.showToast(`🚪 Комната ${prevRoomId} закрыта. Соединение отключено.`, 'info');
            } else {
                this.showToast(`🚪 Вы покинули комнату ${prevRoomId}. Соединение отключено.`, 'info');
            }
        }
    }

    renderSyncScreen(title = 'Синхронизация игроков...', desc = 'Ожидание подключения...') {
        if (!this.syncLogs) this.syncLogs = [];
        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('space', { size: 20 })}</div>
                    <h2 class="hl-app-title">Мультиплеер</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn" title="Закрыть">&times;</button>
            </div>
            <div class="hl-card">
                <div class="hl-sync-container">
                    <div class="hl-sync-icon">
                        <div class="hl-spin">${icon('refresh', { size: 32 })}</div>
                    </div>
                    <h3 class="hl-sync-title">${this.escapeHtml(title)}</h3>
                    <p class="hl-sync-desc">${this.escapeHtml(desc)}</p>

                    <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px 16px; margin-top: 20px; text-align: left; max-height: 180px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; color: #cbd5e1; width: 100%; box-sizing: border-box;" id="hlSyncLogBox">
                        ${this.syncLogs.map(l => `<div style="margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 2px;">${this.escapeHtml(l)}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
        const handleCancel = async () => {
            await this.leaveRoom();
            this.renderMultiplayerSetup();
        };
        const backBtn = document.getElementById('hlHeaderBackBtn');
        if (backBtn) backBtn.addEventListener('click', handleCancel);
        document.getElementById('hlCloseBtn').addEventListener('click', handleCancel);
    }

    addSyncLog(message) {
        if (!this.syncLogs) this.syncLogs = [];
        const time = new Date().toLocaleTimeString();
        const entry = `[${time}] ${message}`;
        this.syncLogs.push(entry);
        if (this.syncLogs.length > 30) this.syncLogs.shift();
        
        const logBox = document.getElementById('hlSyncLogBox');
        if (logBox) {
            const div = document.createElement('div');
            div.style.cssText = 'margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 2px;';
            div.textContent = entry;
            logBox.appendChild(div);
            logBox.scrollTop = logBox.scrollHeight;
        }
    }

    getTagPool(category = this.selectedCategory) {
        if (category === 'copyrights') {
            return (COPYRIGHT_TAGS && COPYRIGHT_TAGS.length > 0) ? COPYRIGHT_TAGS : [...POPULAR_COPYRIGHT_SEED];
        } else if (category === 'general') {
            return (GENERAL_TAGS && GENERAL_TAGS.length > 0) ? GENERAL_TAGS : [...POPULAR_GENERAL_SEED];
        } else {
            return (CHARACTER_TAGS && CHARACTER_TAGS.length > 0) ? CHARACTER_TAGS : [...POPULAR_CHARACTER_SEED];
        }
    }

    // --- RENDER MENU ---
    renderMenu() {
        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon game-logo-icon game-logo-icon-higherlower">${icon('flame', { size: 20 })}</div>
                    <h2 class="hl-app-title">Больше или Меньше</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn" title="Закрыть">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-menu-container">
                    <span class="hl-hero-badge game-badge-gradient-primary">Интерактивная Мини-Игра</span>
                    <h1 class="hl-menu-title game-menu-title">Угадай, у какого тега больше постов!</h1>
                    <p class="hl-menu-desc game-menu-desc">
                        Вам даются два тега с обложками реальных артов из базы. Сравните их популярность и угадайте, у второго тега <b>БОЛЬШЕ</b> или <b>МЕНЬШЕ</b> постов, чем у первого!
                    </p>

                    <div class="hl-category-select-box">
                        <div style="font-size: 0.85rem; font-weight: 700; color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 6px;">
                            ${icon('tag', { size: 16 })} Выберите категорию тегов:
                        </div>
                        <div class="hl-category-pills">
                            <button class="hl-cat-pill ${this.selectedCategory === 'characters' ? 'active' : ''}" id="hlCatCharactersBtn">
                                ${icon('user', { size: 16 })} Только Персонажи
                            </button>
                            <button class="hl-cat-pill ${this.selectedCategory === 'copyrights' ? 'active' : ''}" id="hlCatCopyrightsBtn">
                                ${icon('space', { size: 16 })} Битва Вселенных
                            </button>
                        </div>
                        <div class="game-setting-box" style="margin-top: 8px;">
                            <label class="game-switch">
                                <input type="checkbox" id="hlSoloNoAiCheckbox" ${this.isNoAiMode ? 'checked' : ''}>
                                <span class="game-switch-slider"></span>
                                <span class="game-switch-label" style="display: flex; align-items: center; gap: 6px;">
                                    ${icon('noAi', { size: 14 })} Режим "Без ИИ"
                                </span>
                            </label>
                        </div>
                    </div>

                    <!-- Выбор режима (Higher/Lower style modes grid) -->
                    <div class="hl-modes-grid">
                        <div class="hl-mode-card game-mode-card primary-mode" id="hlStartSoloBtn">
                            <div class="hl-mode-icon-circle game-mode-icon-circle">
                                ${icon('gamepad', { size: 24 })}
                            </div>
                            <h3 class="hl-mode-title game-mode-title">Одиночный Режим</h3>
                            <p class="hl-mode-subtitle game-mode-subtitle">Сравнивайте популярность тегов в одиночку и бейте свои рекорды.</p>
                            <div class="hl-mode-stat game-mode-stat">Рекорд: <span>${this.highScore}</span></div>
                        </div>

                        <div class="hl-mode-card game-mode-card multiplayer" id="hlMultiplayerMenuBtn">
                            <div class="hl-mode-icon-circle game-mode-icon-circle">
                                ${icon('space', { size: 24 })}
                            </div>
                            <h3 class="hl-mode-title game-mode-title">Онлайн с Друзьями</h3>
                            <p class="hl-mode-subtitle game-mode-subtitle">Создавайте комнаты и угадывайте популярность вместе в реальном времени.</p>
                            <div class="hl-mode-stat game-mode-stat" style="color: #fcd34d; background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.3);">
                                Мультиплеер (до 15 чел.)
                            </div>
                            <span id="hlKeyWarningTag" style="display: none; position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); background: #ef4444; color: #fff; font-size: 0.6rem; font-weight: 900; padding: 1px 6px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); pointer-events: none;">ТРЕБУЕТСЯ API</span>
                        </div>
                    </div>

                    <div class="hl-howto-box">
                        <div class="hl-howto-title">${icon('lightbulb', { size: 16 })} Простые правила:</div>
                        <div class="hl-howto-text">
                            • <b>Тег слева:</b> Показывает точное количество постов в галерее.<br>
                            • <b>Тег справа:</b> Скрывает точное число. Нажмите <b>${icon('arrowUp', { size: 12 })} БОЛЬШЕ</b> или <b>${icon('arrowDown', { size: 12 })} МЕНЬШЕ</b>.<br>
                            • За каждый правильный ответ вы получаете +1 очко и открываете следующий тег!
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        const menuHeaderBackBtn = document.getElementById('hlMenuHeaderBackBtn');
        if (menuHeaderBackBtn) {
            menuHeaderBackBtn.addEventListener('click', () => {
                this.close();
                if (typeof window.openGameChoiceModal === 'function') {
                    window.openGameChoiceModal();
                }
            });
        }
        document.getElementById('hlStartSoloBtn').addEventListener('click', () => this.startSoloGame());
        
        const multiBtn = document.getElementById('hlMultiplayerMenuBtn');
        
        const updateMultiBtnState = () => {
            const key = (localStorage.getItem('hlMeteredKey') || '').trim();
            const warningTag = document.getElementById('hlKeyWarningTag');
            
            if (!key) {
                multiBtn.disabled = true;
                multiBtn.style.opacity = '0.6';
                multiBtn.style.filter = 'grayscale(0.8)';
                multiBtn.style.cursor = 'not-allowed';
                if (warningTag) {
                    warningTag.style.display = 'block';
                    warningTag.innerText = 'ТРЕБУЕТСЯ API КЛЮЧ';
                }
            } else {
                multiBtn.disabled = false;
                multiBtn.style.opacity = '1';
                multiBtn.style.filter = 'none';
                multiBtn.style.cursor = 'pointer';
                if (warningTag) {
                    warningTag.style.display = 'none';
                }
            }
        };

        multiBtn.addEventListener('mouseenter', () => {
            const key = (localStorage.getItem('hlMeteredKey') || '').trim();
            if (!key) {
                this.showToast('⚠️ Сначала введите API ключ Metered.ca в меню выбора игр', 'warning');
            }
        });

        multiBtn.addEventListener('click', () => {
            const key = (localStorage.getItem('hlMeteredKey') || '').trim();
            if (!key) {
                this.showToast('❌ Доступ запрещен: введите API ключ Metered.ca для работы мультиплеера', 'danger');
                return;
            }
            this.renderMultiplayerSetup();
        });
        
        updateMultiBtnState();

        const catCharBtn = document.getElementById('hlCatCharactersBtn');
        const catCopyBtn = document.getElementById('hlCatCopyrightsBtn');
        if (catCharBtn && catCopyBtn) {
            catCharBtn.addEventListener('click', () => {
                this.selectedCategory = 'characters';
                localStorage.setItem('r34_hl_category', 'characters');
                catCharBtn.classList.add('active');
                catCopyBtn.classList.remove('active');
            });
            catCopyBtn.addEventListener('click', () => {
                this.selectedCategory = 'copyrights';
                localStorage.setItem('r34_hl_category', 'copyrights');
                catCopyBtn.classList.add('active');
                catCharBtn.classList.remove('active');
            });
        }

        const soloNoAiCb = document.getElementById('hlSoloNoAiCheckbox');
        if (soloNoAiCb) {
            soloNoAiCb.addEventListener('change', (e) => {
                this.isNoAiMode = e.target.checked;
                localStorage.setItem('r34_hl_no_ai', this.isNoAiMode ? 'true' : 'false');
            });
        }
    }

    // --- MULTIPLAYER SETUP FORM ---
    renderKeyInstructionsModal() {
        const overlay = document.createElement('div');
        overlay.className = 'hl-overlay';
        overlay.style.zIndex = '80000'; // Higher than the main game overlay (65000)
        overlay.innerHTML = `
            <div class="hl-card" style="max-width: 500px; padding: 0; overflow: hidden; margin: auto; position: relative; pointer-events: auto;">
                <div style="padding: 24px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: #f59e0b; color: #000; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900;">!</div>
                        <h2 style="margin: 0; font-size: 1.2rem; color: #fff;">Инструкция (API Ключ)</h2>
                    </div>
                    <button id="hlCloseModalBtn" style="background: none; border: none; color: #fff; font-size: 2rem; cursor: pointer; line-height: 1;">&times;</button>
                </div>
                
                <div style="padding: 24px; color: rgba(255,255,255,0.9); font-size: 0.9rem; line-height: 1.6; max-height: 75vh; overflow-y: auto;">
                    <p style="margin-bottom: 20px; font-weight: 500;">Для работы мультиплеера необходимо выполнить следующие шаги:</p>
                    
                    <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 14px; padding: 20px; margin-bottom: 24px;">
                        <ol style="margin: 0; padding-left: 20px;">
                            <li style="margin-bottom: 14px;">
                                <b>Регистрация:</b> Перейдите на сайт в окно регистрации по ссылке <a href="https://dashboard.metered.ca/signup" target="_blank" style="color: #f59e0b; font-weight: 800; text-decoration: underline;">dashboard.metered.ca/signup</a>. Введите ник, почту и пароль, остальное заполнять <b>не обязательно</b>.
                            </li>
                            <li style="margin-bottom: 14px;">
                                <b>Создание приложения:</b> Далее вас попросит создать новое приложение. В поле ввода домена (Domain) вводите <b>что угодно</b> (любое слово на английском) и нажимайте <b>Create App</b>.
                            </li>
                            <li style="margin-bottom: 14px;">
                                <b>Активация чата:</b> После этого на левой панели найдите вкладку <b>Realtime Messaging</b> и перейдите в неё. Там выберите пункт <b>Real-time chat</b> и нажмите кнопку <b>Enable Realtime Messaging</b>.
                            </li>
                            <li style="margin-bottom: 14px;">
                                <b>Генерация ключа:</b> После этого нажмите на правую кнопку <b>Create key</b>. В открывшемся окне в поле <b>Key type</b> обязательно выберите <b>Publishable key</b>, затем промотайте в самый низ и нажмите кнопку <b>Create key</b>.
                            </li>
                            <li style="margin-bottom: 14px;">
                                <b>Копирование:</b> После этого копируйте полученный <b>API Key</b> (он выглядит как <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.85rem;">pk_live_..........</code>).
                            </li>
                            <li style="margin-bottom: 6px;">
                                <b>Запуск игры:</b> Вставляйте этот ключ в поле ввода на главном экране игры, нажимайте <b>Проверить</b>, и если пишет, что ключ верный — можете начинать играть!
                            </li>
                        </ol>
                    </div>

                    <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #f59e0b; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <p style="margin: 0; font-size: 0.85rem; color: #fff; line-height: 1.5;">💡 <b>Важное упоминание:</b> У каждого игрока в идеале должен быть зарегистрирован свой ключ, но можно сделать и так, что кто-то один создаст его и просто даст код ключа остальным игрокам — он будет работать у всех!</p>
                    </div>

                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); font-style: italic; display: flex; gap: 8px; align-items: flex-start; margin-top: 10px;">
                        ${icon('lightbulb', { size: 14 })}
                        <span>Ключ сохраняется в памяти вашего браузера, поэтому вводить его повторно при следующем заходе не потребуется.</span>
                    </div>
                </div>

                <div style="padding: 16px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end; background: rgba(0,0,0,0.2);">
                    <button class="hl-btn-primary" id="hlConfirmModalBtn" style="min-width: 120px; padding: 10px 20px;">Понятно!</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        
        setTimeout(() => overlay.classList.add('open'), 10);

        const close = () => {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 300);
        };

        document.getElementById('hlCloseModalBtn').onclick = close;
        document.getElementById('hlConfirmModalBtn').onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
    }

    renderMultiplayerSetup() {
        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon game-logo-icon game-logo-icon-higherlower">${icon('space', { size: 20 })}</div>
                    <h2 class="hl-app-title">Онлайн Режим <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 6px;">БЕТА</span></h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn" title="Закрыть">&times;</button>
            </div>

            <div class="hl-card game-card-setup">
                <div class="hl-menu-container game-menu-container-compact">
                    <span class="hl-hero-badge game-badge-gradient-secondary">Интерактивный Онлайн</span>

                    <h1 class="hl-menu-title game-menu-title" style="font-size: 1.75rem;">Мультиплеерные Комнаты</h1>
                    <p class="hl-menu-desc game-menu-desc" style="font-size: 0.9rem;">
                        Играй с друзьями вне зависимости от устройства. Создай комнату или введи 5-значный код для входа!
                    </p>

                    <div class="hl-form-box game-form-box">
                        <div class="hl-form-field game-form-field">
                            <label class="hl-form-label game-form-label" style="display: flex; align-items: center; gap: 6px;">${icon('user', { size: 14 })} Твое Имя / Никнейм:</label>
                            <input type="text" id="hlPlayerNameInput" class="hl-input game-input" value="${this.escapeHtml(this.playerName)}" placeholder="Введите ваш ник..." maxlength="20">
                        </div>

                        <hr class="game-form-divider">

                        <div class="game-form-group">
                            <label class="hl-form-label game-form-label">Присоединиться к комнате:</label>
                            <div class="game-form-row">
                                <input type="text" id="hlRoomCodeInput" class="hl-input game-input game-code-input" placeholder="КОД КОМНАТЫ">
                                <button class="hl-btn-primary" id="hlJoinRoomBtn" style="min-width: auto; padding: 10px 18px;">${icon('arrowRight', { size: 16 })} Войти</button>
                            </div>
                        </div>

                        <hr class="game-form-divider">

                        <div class="game-form-group">
                            <label class="hl-form-label game-form-label">Создать новую комнату:</label>
                            
                            <div style="display: flex; flex-direction: column; gap: 8px; text-align: left;">
                                <label class="hl-form-label game-form-label" style="font-size: 0.85rem;">Категория игры:</label>
                                <div class="hl-category-pills" style="width: 100%;">
                                    <div id="hlCatCharactersBtn" class="hl-cat-pill game-pills-row ${this.selectedCategory === 'characters' ? 'active' : ''}">
                                        ${icon('user', { size: 14 })} Персонажи
                                    </div>
                                    <div id="hlCatCopyrightsBtn" class="hl-cat-pill game-pills-row ${this.selectedCategory === 'copyrights' ? 'active' : ''}">
                                        ${icon('space', { size: 14 })} Франшизы
                                    </div>
                                </div>
                            </div>

                            <div class="game-setting-box">
                                <div class="game-setting-header">
                                    <label class="hl-form-label game-form-label" style="margin: 0;">Макс. игроков:</label>
                                    <span id="hlMaxPlayersVal" style="font-weight: 800; font-size: 1rem; color: var(--accent, #a78bfa);">6 игрок.</span>
                                </div>
                                <input type="range" id="hlMaxPlayersRange" class="game-range-slider" min="2" max="15" value="6">
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <label class="hl-form-label game-form-label" style="margin: 0;">Очков для победы:</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <select id="hlTargetScoreSelect" class="game-select" style="flex: 1;">
                                        <option value="5">5 очков (Быстрая)</option>
                                        <option value="10" selected>10 очков (Стандарт)</option>
                                        <option value="15">15 очков (Долгая)</option>
                                        <option value="20">20 очков (Марафон)</option>
                                        <option value="custom">Свой вариант...</option>
                                    </select>
                                    <input type="number" id="hlTargetScoreCustom" class="hl-input game-input" min="1" max="100" value="10" placeholder="1-100" style="display: none; width: 110px; text-align: center; font-weight: bold;">
                                </div>
                            </div>

                            <div class="game-setting-box" style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
                                <span style="font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.9); display: flex; align-items: center; gap: 8px;">
                                    ${icon('noAi', { size: 16 })} Режим "Без ИИ"
                                </span>
                                <label class="game-switch">
                                    <input type="checkbox" id="hlNoAiCheckbox">
                                    <span class="game-switch-slider"></span>
                                </label>
                            </div>

                            <button class="hl-btn-primary game-create-btn" id="hlCreateRoomBtn">
                                ${icon('sparkles', { size: 16 })} Создать Комнату
                            </button>
                        </div>
                    </div>

                    <button class="hl-btn-secondary game-back-btn" id="hlBackMenuBtn">
                        ${icon('arrowLeft', { size: 14 })} Назад в меню
                    </button>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('hlBackMenuBtn').addEventListener('click', () => this.renderMenu());
        const headerBackBtn = document.getElementById('hlHeaderBackBtn');
        if (headerBackBtn) headerBackBtn.addEventListener('click', () => this.renderMenu());

        const nameInput = document.getElementById('hlPlayerNameInput');
        nameInput.addEventListener('change', () => {
            this.playerName = nameInput.value.trim() || 'Игрок';
            localStorage.setItem('r34_hl_player_name', this.playerName);
        });

        // Категории в виде табов
        const catCharBtn = document.getElementById('hlCatCharactersBtn');
        const catCopyBtn = document.getElementById('hlCatCopyrightsBtn');
        if (catCharBtn && catCopyBtn) {
            catCharBtn.addEventListener('click', () => {
                this.selectedCategory = 'characters';
                localStorage.setItem('r34_hl_category', 'characters');
                catCharBtn.classList.add('active');
                catCopyBtn.classList.remove('active');
            });
            catCopyBtn.addEventListener('click', () => {
                this.selectedCategory = 'copyrights';
                localStorage.setItem('r34_hl_category', 'copyrights');
                catCopyBtn.classList.add('active');
                catCharBtn.classList.remove('active');
            });
        }

        const rangeInput = document.getElementById('hlMaxPlayersRange');
        const rangeVal = document.getElementById('hlMaxPlayersVal');
        if (rangeInput && rangeVal) {
            rangeInput.addEventListener('input', (e) => {
                rangeVal.textContent = `${e.target.value} игрок.`;
            });
        }

        const scoreSelect = document.getElementById('hlTargetScoreSelect');
        const scoreCustom = document.getElementById('hlTargetScoreCustom');
        if (scoreSelect && scoreCustom) {
            makeCustomDropdown(scoreSelect);
            scoreSelect.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    scoreCustom.style.display = 'block';
                    scoreCustom.focus();
                } else {
                    scoreCustom.style.display = 'none';
                }
            });
        }

        document.getElementById('hlCreateRoomBtn').addEventListener('click', async (e) => {
            if (e.target.disabled) return;
            e.target.disabled = true;
            this.playerName = nameInput.value.trim() || 'Игрок';
            localStorage.setItem('r34_hl_player_name', this.playerName);
            
            const maxP = parseInt(rangeInput ? rangeInput.value : 6, 10) || 6;
            
            let targetS = 10;
            if (scoreSelect && scoreSelect.value === 'custom') {
                targetS = parseInt(scoreCustom.value, 10) || 10;
                if (targetS < 1) targetS = 1;
                if (targetS > 100) targetS = 100;
            } else if (scoreSelect) {
                targetS = parseInt(scoreSelect.value, 10) || 10;
            }

            const cat = this.selectedCategory;
            const noAiCb = document.getElementById('hlNoAiCheckbox');
            const noAi = noAiCb ? noAiCb.checked : false;
            await this.createRoom(maxP, targetS, cat, noAi);
            e.target.disabled = false;
        });

        document.getElementById('hlJoinRoomBtn').addEventListener('click', () => {
            this.playerName = nameInput.value.trim() || 'Игрок';
            localStorage.setItem('r34_hl_player_name', this.playerName);
            const code = document.getElementById('hlRoomCodeInput').value.trim();
            if (!code) {
                alert('Введите код комнаты!');
                return;
            }
            this.joinRoom(code);
        });
    }

    async ensureTagsLoaded(force = false) {
        if (!dynamicTagsLoaded || force) {
            this.renderSyncScreen('Загрузка игры...', 'Получаем случайные теги из базы Rule34...');
            await loadDynamicPopularTags(force);
        }
    }

    // --- SOLO GAME LOGIC ---
    async startSoloGame() {
        await this.ensureTagsLoaded(true);
        this.score = 0;
        this.mode = 'solo';
        this.isTransitioning = false;
        this.renderSoloGame();
        
        // Load initial pair
        this.leftTag = await this.getRandomTagData('', this.selectedCategory);
        this.rightTag = await this.getRandomTagData(this.leftTag.name, this.selectedCategory);
        this.renderSoloGame();
    }

    async getRandomTagData(excludeTagName = '', category = this.selectedCategory) {
        let pool = this.getTagPool(category);
        if (!pool || pool.length === 0) {
            await loadDynamicPopularTags(true);
            pool = this.getTagPool(category);
        }

        let attempts = 0;
        const isNoAi = (this.mode === 'multiplayer' || this.mode === 'lobby') ? !!(this.roomData && this.roomData.noAi) : !!this.isNoAiMode;
        const isCharCategory = category === 'characters';
        const isCopyrightCategory = category === 'copyrights';

        while (attempts < 40 && pool && pool.length > 0) {
            attempts++;
            
            // Умная ротация флагманов: в 35% случаев для франшиз подкидываем известнейших титанов
            let candidateTag = '';
            if (isCopyrightCategory && Math.random() < 0.35 && FLAGSHIP_FRANCHISES.length > 0) {
                candidateTag = FLAGSHIP_FRANCHISES[Math.floor(Math.random() * FLAGSHIP_FRANCHISES.length)];
            } else if (isCharCategory && Math.random() < 0.35 && POPULAR_CHARACTER_SEED.length > 0) {
                candidateTag = POPULAR_CHARACTER_SEED[Math.floor(Math.random() * POPULAR_CHARACTER_SEED.length)];
            } else {
                const idx = Math.floor(Math.random() * pool.length);
                candidateTag = pool[idx];
            }

            if (!candidateTag || candidateTag === excludeTagName || isTagBanned(candidateTag)) continue;

            const cacheKey = candidateTag + (isNoAi ? ':noai' : '');
            if (this.tagCache.has(cacheKey)) {
                const cached = this.tagCache.get(cacheKey);
                if (cached && cached.count > 0 && cached.imageUrl) {
                    if (isCharCategory) {
                        if (cached.count < MIN_CHARACTER_POSTS) continue;
                        if (cached.type !== null && cached.type !== undefined && cached.type !== 4) continue;
                    }
                    if (isCopyrightCategory) {
                        if (cached.count < MIN_COPYRIGHT_POSTS) continue;
                        if (cached.type !== null && cached.type !== undefined && cached.type !== 3 && !FRANCHISE_DATABASE[candidateTag.toLowerCase()]) continue;
                    }
                    return cached;
                }
            }

            try {
                const data = await fetchTagInfo(candidateTag, isNoAi);
                if (data && data.count > 0 && data.imageUrl) {
                    if (isCharCategory) {
                        if (data.count < MIN_CHARACTER_POSTS) {
                            console.log(`[HigherLower] Filtered character "${candidateTag}" with ${data.count} < 4000 posts`);
                            continue;
                        }
                        if (data.type !== null && data.type !== undefined && data.type !== 4) {
                            console.log(`[HigherLower] Filtered non-character tag "${candidateTag}" (type=${data.type})`);
                            continue;
                        }
                    }
                    if (isCopyrightCategory) {
                        if (data.count < MIN_COPYRIGHT_POSTS) {
                            console.log(`[HigherLower] Filtered small copyright tag "${candidateTag}" with ${data.count} < ${MIN_COPYRIGHT_POSTS} posts`);
                            continue;
                        }
                        if (data.type !== null && data.type !== undefined && data.type !== 3 && !FRANCHISE_DATABASE[candidateTag.toLowerCase()]) {
                            console.log(`[HigherLower] Filtered non-copyright tag "${candidateTag}" (type=${data.type})`);
                            continue;
                        }
                    }
                    this.tagCache.set(cacheKey, data);
                    return data;
                }
            } catch (e) {
                console.error('Error fetching info for tag', candidateTag, e);
            }
        }

        // If not found in primary category, try safe category-specific fallback
        if (isCharCategory) {
            for (const charTag of POPULAR_CHARACTER_SEED) {
                if (charTag !== excludeTagName && !isTagBanned(charTag)) {
                    try {
                        const data = await fetchTagInfo(charTag, isNoAi);
                        if (data && data.count > 0 && data.imageUrl) {
                            return data;
                        }
                    } catch (e) {}
                }
            }
            return { name: excludeTagName || POPULAR_CHARACTER_SEED[0], count: 50000, imageUrl: null };
        } else if (isCopyrightCategory) {
            for (const cpTag of POPULAR_COPYRIGHT_SEED) {
                if (cpTag !== excludeTagName && !isTagBanned(cpTag)) {
                    try {
                        const data = await fetchTagInfo(cpTag, isNoAi);
                        if (data && data.count > 0 && data.imageUrl) {
                            return data;
                        }
                    } catch (e) {}
                }
            }
            return { name: excludeTagName || POPULAR_COPYRIGHT_SEED[0], count: 100000, imageUrl: null };
        } else {
            const allPool = [...CHARACTER_TAGS, ...COPYRIGHT_TAGS, ...GENERAL_TAGS];
            for (let i = 0; i < Math.min(20, allPool.length); i++) {
                const altTag = allPool[Math.floor(Math.random() * allPool.length)];
                if (!altTag || altTag === excludeTagName || isTagBanned(altTag)) continue;
                try {
                    const data = await fetchTagInfo(altTag, isNoAi);
                    if (data && data.count > 0 && data.imageUrl) {
                        return data;
                    }
                } catch (e) {}
            }
            return { name: excludeTagName || '1girl', count: 50000, imageUrl: null };
        }
    }

    getRandomTagName(excludeTagName = '', category = 'characters') {
        const isCharCategory = category === 'characters';
        const isCopyrightCategory = category === 'copyrights';
        let pool = this.getTagPool(category);

        let attempts = 0;
        while (attempts < 100 && pool && pool.length > 0) {
            attempts++;
            let candidateTag = '';
            if (isCopyrightCategory && Math.random() < 0.35 && FLAGSHIP_FRANCHISES.length > 0) {
                candidateTag = FLAGSHIP_FRANCHISES[Math.floor(Math.random() * FLAGSHIP_FRANCHISES.length)];
            } else if (isCharCategory && Math.random() < 0.35 && POPULAR_CHARACTER_SEED.length > 0) {
                candidateTag = POPULAR_CHARACTER_SEED[Math.floor(Math.random() * POPULAR_CHARACTER_SEED.length)];
            } else {
                const idx = Math.floor(Math.random() * pool.length);
                candidateTag = pool[idx];
            }
            if (candidateTag && candidateTag !== excludeTagName && !isTagBanned(candidateTag)) {
                return candidateTag;
            }
        }
        if (isCharCategory) {
            return POPULAR_CHARACTER_SEED.find(t => t !== excludeTagName && !isTagBanned(t)) || POPULAR_CHARACTER_SEED[0];
        }
        if (isCopyrightCategory) {
            return POPULAR_COPYRIGHT_SEED.find(t => t !== excludeTagName && !isTagBanned(t)) || POPULAR_COPYRIGHT_SEED[0];
        }
        return pool && pool.length > 0 ? pool.find(t => !isTagBanned(t)) || pool[0] : '1girl';
    }

    async getTagDataByName(tagName, isNoAi) {
        if (!tagName) return { name: '', count: 0, imageUrl: null };
        const cacheKey = tagName + (isNoAi ? ':noai' : '');
        if (this.tagCache.has(cacheKey)) {
            return this.tagCache.get(cacheKey);
        }

        try {
            const data = await fetchTagInfo(tagName, isNoAi);
            if (data && data.count > 0 && data.imageUrl) {
                this.tagCache.set(cacheKey, data);
                return data;
            }
        } catch (e) {
            console.error('Error fetching info for tag', tagName, e);
        }

        return { name: tagName, count: 0, imageUrl: null };
    }

    async loadMultiplayerRoundTags(leftName, rightName) {
        this.multiplayerLoadingTags = true;
        this.loadingLeftName = leftName;
        this.loadingRightName = rightName;
        
        // Render a loading state locally so the user knows we are fetching
        this.renderMultiplayerGame();

        try {
            const isNoAi = !!this.roomData.noAi;
            const [leftData, rightData] = await Promise.all([
                this.getTagDataByName(leftName, isNoAi),
                this.getTagDataByName(rightName, isNoAi)
            ]);

            if (this.loadingLeftName === leftName && this.loadingRightName === rightName) {
                this.currentLeftTagData = leftData;
                this.currentRightTagData = rightData;
                this.multiplayerLoadingTags = false;
                this.renderMultiplayerGame();
            }
        } catch (e) {
            console.error('Error loading multiplayer round tags:', e);
            if (this.loadingLeftName === leftName && this.loadingRightName === rightName) {
                this.multiplayerLoadingTags = false;
                this.renderMultiplayerGame();
            }
        }
    }

    renderSoloGame(rightRevealed = false, answerResult = null) {
        if (!this.leftTag || !this.rightTag) {
            this.container.innerHTML = `
                <div class="hl-header">
                    <div class="hl-title-group"><h2 class="hl-app-title">Загрузка...</h2></div>
                    <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
                </div>
                <div class="hl-card">
                    <div class="hl-sync-container">
                        <div class="hl-sync-icon">
                            <div class="hl-spin">${icon('refresh', { size: 32 })}</div>
                        </div>
                        <h3 class="hl-sync-title">Подготовка раунда...</h3>
                        <p class="hl-sync-desc">Загружаем изображения и подсчитываем посты в базе</p>
                    </div>
                </div>
            `;
            document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
            return;
        }

        const leftImg = this.leftTag.imageUrl;
        const rightImg = this.rightTag.imageUrl;

        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('flame', { size: 20 })}</div>
                    <h2 class="hl-app-title">Одиночный Режим</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-arena">
                    <div class="hl-arena-top">
                        <div class="hl-score-badge">Счёт: <span class="hl-score-num">${this.score}</span></div>
                        <span class="hl-cat-badge">${this.selectedCategory === 'copyrights' ? `${icon('space', { size: 14 })} Битва Вселенных` : `${icon('user', { size: 14 })} Только Персонажи`}</span>
                        ${this.isNoAiMode ? `<span class="hl-cat-badge" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.35); color: #fbbf24; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">${icon('noAi', { size: 12 })} Без ИИ</span>` : ''}
                        <div class="hl-score-badge" style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">Рекорд: ${this.highScore}</div>
                    </div>

                    <div class="hl-versus-grid">
                        <!-- Левая карточка (Известная) -->
                        <div class="hl-tag-card">
                            ${leftImg ? `<img src="${leftImg}" class="hl-card-bg" id="hlBg_left" alt="" loading="lazy">` : ''}
                            <div class="hl-card-overlay"></div>
                            <div class="hl-card-content">
                                <span class="hl-tag-badge">Известный Тег</span>
                                ${this.renderCardImageContainer(this.leftTag, 'left')}
                                <div class="hl-tag-name">${this.formatTagName(this.leftTag.name)}</div>
                                ${renderOriginBadgeHtml(this.leftTag)}
                                <div class="hl-tag-count">${this.leftTag.count.toLocaleString()}</div>
                                <div class="hl-tag-sub">постов в галерее</div>
                            </div>
                        </div>

                        <!-- VS значок -->
                        <div class="hl-vs-circle">VS</div>

                        <!-- Правая карточка (Скрытая/Открытая) -->
                        <div class="hl-tag-card ${answerResult === 'correct' ? 'correct' : answerResult === 'wrong' ? 'wrong' : ''}" id="hlRightCard">
                            ${rightImg ? `<img src="${rightImg}" class="hl-card-bg" id="hlBg_right" alt="" loading="lazy">` : ''}
                            <div class="hl-card-overlay"></div>
                            <div class="hl-card-content">
                                ${rightRevealed ? `
                                    <span class="hl-tag-badge" style="background: ${answerResult === 'correct' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; color: #fff; display: inline-flex; align-items: center; gap: 4px;">
                                        ${answerResult === 'correct' ? `${icon('check', { size: 16 })} ПРАВИЛЬНО!` : `${icon('x', { size: 16 })} НЕВЕРНО!`}
                                    </span>
                                    ${this.renderCardImageContainer(this.rightTag, 'right')}
                                    <div class="hl-tag-name">${this.formatTagName(this.rightTag.name)}</div>
                                    ${renderOriginBadgeHtml(this.rightTag)}
                                    <div class="hl-tag-count" style="color: ${answerResult === 'correct' ? '#10b981' : '#ef4444'};">
                                        ${this.rightTag.count.toLocaleString()}
                                    </div>
                                    <div class="hl-tag-sub">постов в галерее</div>
                                ` : `
                                    <span class="hl-tag-badge" style="background: rgba(244, 63, 94, 0.2); border-color: rgba(244, 63, 94, 0.4); color: #fca5a5;">Целевой Тег</span>
                                    ${this.renderCardImageContainer(this.rightTag, 'right')}
                                    <div class="hl-tag-name">${this.formatTagName(this.rightTag.name)}</div>
                                    ${renderOriginBadgeHtml(this.rightTag)}
                                    <div style="color: rgba(255,255,255,0.9); font-size: 0.95rem; font-weight: 600;">
                                        В галерее постов:
                                    </div>
                                    <div class="hl-choice-btns">
                                        <button class="hl-btn-higher" id="hlBtnHigher">${icon('arrowUp', { size: 16 })} БОЛЬШЕ</button>
                                        <button class="hl-btn-lower" id="hlBtnLower">${icon('arrowDown', { size: 16 })} МЕНЬШЕ</button>
                                    </div>
                                    <div class="hl-tag-sub" style="margin-top: 4px;">чем у ${this.formatTagName(this.leftTag.name)} (${this.leftTag.count.toLocaleString()})</div>
                                `}
                            </div>
                        </div>
                    </div>

                    <div class="hl-howto-box" style="margin: 0 auto; text-align: center; align-items: center; max-width: 100%;">
                        <div class="hl-howto-title">Вопрос:</div>
                        <div class="hl-howto-text">
                            У тега <b>"${this.formatTagName(this.rightTag.name)}"</b> больше или меньше постов в галерее, чем <b>${this.leftTag.count.toLocaleString()}</b> (у тега "${this.formatTagName(this.leftTag.name)}")?
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        this.attachImageControls();

        if (!rightRevealed) {
            document.getElementById('hlBtnHigher').addEventListener('click', () => this.handleSoloChoice('higher'));
            document.getElementById('hlBtnLower').addEventListener('click', () => this.handleSoloChoice('lower'));
        }
    }

    async handleSoloChoice(choice) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const isHigher = this.rightTag.count >= this.leftTag.count;
        const isCorrect = (choice === 'higher' && isHigher) || (choice === 'lower' && !isHigher);

        this.renderSoloGame(true, isCorrect ? 'correct' : 'wrong');

        if (isCorrect) {
            this.score++;
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('r34_hl_highscore', this.highScore.toString());
            }

            setTimeout(async () => {
                this.leftTag = this.rightTag;
                this.rightTag = await this.getRandomTagData(this.leftTag.name, this.selectedCategory);
                this.isTransitioning = false;
                this.renderSoloGame();
            }, 2800);
        } else {
            setTimeout(() => {
                this.isTransitioning = false;
                this.renderGameOverSolo();
            }, 2800);
        }
    }

    renderGameOverSolo() {
        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group"><h2 class="hl-app-title">Игра Окончена</h2></div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-menu-container">
                    <div class="hl-result-icon">${icon('x', { size: 42, strokeWidth: 2.5 })}</div>
                    <h2 style="font-size: 2rem; font-weight: 900; color: #ef4444; margin: 0;">Вы ошиблись!</h2>
                    
                    <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 20px 30px; border-radius: 18px; margin: 10px 0;">
                        <div style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">Твой итоговый счёт:</div>
                        <div style="font-size: 3rem; font-weight: 900; color: var(--accent, #a78bfa);">${this.score}</div>
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.5); margin-top: 4px;">Лучший рекорд: ${this.highScore}</div>
                    </div>

                    <div class="hl-menu-actions">
                        <button class="hl-btn-primary" id="hlRestartSoloBtn">
                            ${icon('refresh', { size: 16 })} Попробовать Снова
                        </button>
                        <button class="hl-btn-secondary" id="hlMenuBtn">
                            ${icon('space', { size: 16 })} В Главное Меню
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('hlRestartSoloBtn').addEventListener('click', () => this.startSoloGame());
        document.getElementById('hlMenuBtn').addEventListener('click', () => this.renderMenu());
    }

    // --- SERVER & P2P HYBRID MULTIPLAYER LOGIC ---
    generateRoomCode() {
        const chars = 'BCDFGHJKLMNPQRSTVWXYZ';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    getMeteredKey() {
        return localStorage.getItem('hlMeteredKey') || '';
    }

    async sendSignal(code, data, targetId = null) {
        if (!data) return;
        if (!data._msgId) {
            data._msgId = `${this.playerId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        
        // Only allow WebRTC handshake signals through ntfy
        const allowedSignalingTypes = ['JOIN_ROOM', 'JOIN_ACCEPT', 'JOIN_REJECT', 'OFFER', 'ANSWER', 'ICE_CANDIDATE', 'GUEST_JOINED', 'JOIN'];
        if (data.type && !allowedSignalingTypes.includes(data.type)) {
            return;
        }

        // Public ntfy.sh topic for internet-wide signaling
        const topic = `r34_sig_${code}`;
        try {
            await fetch(`https://ntfy.sh/${topic}`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
        } catch (e) {
            console.error('>>> DEBUG: [Signaling] Send error:', e);
            this.signalQueue.push({ code, data, targetId });
        }

        // Also notify local server if available
        try {
            fetch('/api/room/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: code,
                    senderId: this.playerId,
                    targetId: targetId || null,
                    packet: data
                })
            }).catch(() => {});
        } catch (e) {}
    }

    listenSignal(code, onMessage) {
        if (this.eventSource) {
            try { this.eventSource.close(); } catch(err) {}
            this.eventSource = null;
        }
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // Default free public STUN servers for WebRTC
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
        ];

        const savedKey = this.getMeteredKey();
        if (savedKey && typeof savedKey === 'string' && savedKey.trim()) {
            const cleanKey = savedKey.trim();
            const appName = cleanKey.includes('.') ? cleanKey.split('.')[0] : cleanKey;
            this.iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' },
                { urls: `stun:${appName}.metered.ca:80` },
                { urls: `stun:${appName}.metered.ca:443` },
                {
                    urls: [
                        `turn:${appName}.metered.ca:80?transport=udp`,
                        `turn:${appName}.metered.ca:443?transport=tcp`
                    ],
                    username: 'metered',
                    credential: 'key'
                }
            ];
        }

        if (typeof this.onSignalingWelcome === 'function') {
            this.onSignalingWelcome();
        }

        const safeOnMessage = (msg) => {
            if (!msg || typeof msg !== 'object') return;
            if (msg._msgId) {
                if (this.processedPacketIds.has(msg._msgId)) return;
                this.processedPacketIds.add(msg._msgId);
                if (this.processedPacketIds.size > 2000) {
                    const first = this.processedPacketIds.values().next().value;
                    this.processedPacketIds.delete(first);
                }
            }
            onMessage(msg);
        };

        // Process queued signals
        while (this.signalQueue.length > 0) {
            const queued = this.signalQueue.shift();
            this.sendSignal(queued.code, queued.data, queued.targetId);
        }

        // Public ntfy.sh SSE stream for room signaling
        const topic = `r34_sig_${code}`;
        try {
            this.eventSource = new EventSource(`https://ntfy.sh/${topic}/sse`);
            this.eventSource.onmessage = (event) => {
                try {
                    const packet = JSON.parse(event.data);
                    if (packet.message) {
                        const msg = JSON.parse(packet.message);
                        safeOnMessage(msg);
                    }
                } catch (e) {}
            };
            this.eventSource.onerror = (e) => {
                if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
                    console.log('>>> DEBUG: [Signaling] ntfy SSE closed');
                }
            };
        } catch (err) {
            console.error('>>> DEBUG: [Signaling] SSE error:', err);
        }
    }

    async createRoom(maxPlayers, targetScore, category = 'characters', noAi = false) {
        await this.ensureTagsLoaded(true);
        console.log('>>> DEBUG: createRoom called with:', { maxPlayers, targetScore, category, noAi });
        this.syncLogs = [];
        this.renderSyncScreen('Создание комнаты...', 'Ожидание подключения игроков...');
        this.addSyncLog('Инициализация комнаты...');
        this.isHost = true;

        const code = this.generateRoomCode();
        console.log('>>> DEBUG: Generated room code:', code);
        this.roomId = code;
        this.connections = [];
        this.clientPeerConnections = {};
        this.addSyncLog(`Сгенерирован код комнаты: ${code}`);

        const leftTagName = this.getRandomTagName('', category);
        const rightTagName = this.getRandomTagName(leftTagName, category);

        this.roomData = {
            id: this.roomId,
            hostId: this.playerId,
            status: 'waiting',
            maxPlayers,
            targetScore,
            category,
            noAi,
            round: 1,
            currentRound: {
                leftTag: { name: leftTagName },
                rightTag: { name: rightTagName },
                phase: 'guessing'
            },
            players: {
                [this.playerId]: {
                    id: this.playerId,
                    name: this.playerName,
                    score: 0,
                    status: 'joined',
                    isHost: true,
                    lastAnswer: null,
                    lastResult: null
                }
            },
            createdAt: new Date().toISOString()
        };

        // Notify server of room creation
        try {
            await fetch('/api/room/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: code,
                    hostId: this.playerId,
                    gameType: 'higher_lower',
                    roomData: this.roomData
                })
            });
        } catch (e) {}

        this.addSyncLog('Открытие канала связи...');
        this.listenSignal(code, async (msg) => {
            if (!msg || typeof msg !== 'object') return;

            // Handle client JOIN via server relay
            if (msg.type === 'JOIN' && msg.player && msg.player.id !== this.playerId) {
                const clientPlayer = msg.player;
                const clientPlayerId = clientPlayer.id;
                this.addSyncLog(`Игрок ${clientPlayer.name} подключился`);
                this.roomData.players[clientPlayerId] = clientPlayer;
                this.broadcastRoomData();
                this.handleRoomStateUpdate();
                return;
            }

            // Handle client ANSWER via server relay
            if (msg.type === 'ANSWER' && msg.choice && msg.playerId && msg.playerId !== this.playerId) {
                console.log('DEBUG: Host received ANSWER from', msg.playerId, ':', msg.choice);
                if (this.roomData.players[msg.playerId]) {
                    this.roomData.players[msg.playerId].status = 'answered';
                    this.roomData.players[msg.playerId].lastAnswer = msg.choice;
                    this.broadcastRoomData();
                    this.handleRoomStateUpdate();
                    this.checkAndEvaluateRound();
                }
                return;
            }

            // Handle client LEAVE via server relay
            if (msg.type === 'LEAVE' && msg.playerId && msg.playerId !== this.playerId) {
                const leftPlayerId = msg.playerId;
                if (this.roomData?.players[leftPlayerId]) {
                    const leftName = this.roomData.players[leftPlayerId].name || 'Игрок';
                    delete this.roomData.players[leftPlayerId];
                    this.showToast(`🚪 Игрок "${this.escapeHtml(leftName)}" покинул комнату`, 'danger');
                    this.broadcastRoomData();
                    this.handleRoomStateUpdate();
                    this.checkAndEvaluateRound();
                }
                return;
            }

            // Handle WebRTC OFFER
            if (msg.type === 'OFFER') {
                const clientPlayerId = msg.playerId;
                this.addSyncLog(`Получен P2P OFFER от игрока ${clientPlayerId.substring(0, 6)}...`);
                if (this.roomData.status === 'playing') {
                    this.addSyncLog('Отклонено: игра уже идет');
                    await this.sendSignal(code, { type: 'ERROR', playerId: clientPlayerId, message: 'Игра уже началась!' }, clientPlayerId);
                    return;
                }
                if (Object.keys(this.roomData.players).length >= this.roomData.maxPlayers && !this.roomData.players[clientPlayerId]) {
                    this.addSyncLog('Отклонено: комната заполнена');
                    await this.sendSignal(code, { type: 'ERROR', playerId: clientPlayerId, message: 'Комната заполнена!' }, clientPlayerId);
                    return;
                }

                try {
                    const iceConfig = {
                        iceServers: this.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
                    };
                    const pc = new RTCPeerConnection(iceConfig);
                    this.clientPeerConnections[clientPlayerId] = pc;
                    this.addSyncLog('Создан RTCPeerConnection для клиента...');

                    pc.onicecandidateerror = (e) => {
                        console.warn('[Host WebRTC ICE Notice]:', e);
                    };

                    pc.ondatachannel = (event) => {
                        const dc = event.channel;
                        this.connections.push({ playerId: clientPlayerId, dc });
                        this.addSyncLog('DataChannel получен от клиента');

                        dc.onopen = () => {
                            this.addSyncLog('DataChannel открыт!');
                            this.broadcastRoomData();
                        };

                        dc.onmessage = (e) => {
                            try {
                                const data = JSON.parse(e.data);
                                if (data.type === 'JOIN') {
                                    this.addSyncLog(`Игрок ${data.player.name} присоединился (P2P)`);
                                    this.roomData.players[data.player.id] = data.player;
                                    this.broadcastRoomData();
                                    this.handleRoomStateUpdate();
                                } else if (data.type === 'ANSWER') {
                                    console.log('DEBUG: Host received ANSWER from', data.playerId, ':', data.choice);
                                    if (this.roomData.players[data.playerId]) {
                                        this.roomData.players[data.playerId].status = 'answered';
                                        this.roomData.players[data.playerId].lastAnswer = data.choice;
                                        this.broadcastRoomData();
                                        this.handleRoomStateUpdate();
                                        this.checkAndEvaluateRound();
                                    }
                                } else if (data.type === 'LEAVE') {
                                    const leftPlayerId = data.playerId || clientPlayerId;
                                    if (this.roomData?.players[leftPlayerId]) {
                                        const leftName = this.roomData.players[leftPlayerId].name || 'Игрок';
                                        delete this.roomData.players[leftPlayerId];
                                        this.showToast(`🚪 Игрок "${this.escapeHtml(leftName)}" покинул комнату`, 'danger');
                                        this.broadcastRoomData();
                                        this.handleRoomStateUpdate();
                                        this.checkAndEvaluateRound();
                                    }
                                } else if (data.type === 'PONG') {
                                    // Heartbeat response
                                }
                            } catch (err) {}
                        };

                        dc.onclose = () => {
                            this.addSyncLog('DataChannel закрыт клиентом');
                            this.connections = this.connections.filter(c => c.dc !== dc);
                            delete this.clientPeerConnections[clientPlayerId];
                        };
                    };

                    await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    await new Promise(resolve => {
                        if (pc.iceGatheringState === 'complete') resolve();
                        else {
                            const checkState = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); } };
                            pc.addEventListener('icegatheringstatechange', checkState);
                            setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); }, 1200);
                        }
                    });

                    this.addSyncLog('Отправка ANSWER клиенту через сигналинг...');
                    await this.sendSignal(code, { type: 'ANSWER', playerId: clientPlayerId, answer: pc.localDescription }, clientPlayerId);
                } catch (pcErr) {
                    console.warn('[Host WebRTC error]:', pcErr);
                }
            }
        });

        this.addSyncLog('Ожидание подключения игроков в лобби...');
        this.mode = 'lobby';

        if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
        this.roomHeartbeatTimer = setInterval(() => {
            if (this.isHost && this.connections) {
                const pingMsg = JSON.stringify({ type: 'PING' });
                this.connections.forEach(c => {
                    if (c.dc && c.dc.readyState === 'open') {
                        try { c.dc.send(pingMsg); } catch(e) {}
                    }
                });
            }
        }, 4000);

        this.renderLobby();
    }

    checkAndEvaluateRound() {
        if (this.isHost && this.roomData?.currentRound?.phase === 'guessing' && !this.evaluatingRound) {
            const playersList = Object.values(this.roomData.players);
            const allAnswered = playersList.length > 0 && playersList.every(p => p.status === 'answered');
            if (allAnswered) {
                this.evaluatingRound = true;
                this.evaluateMultiplayerRound();
            }
        }
    }

    async joinRoom(roomCode) {
        this.syncLogs = [];
        const cleanCode = roomCode.trim().toUpperCase();
        this.renderSyncScreen('Присоединение к комнате...', 'Подключение к хосту...');
        this.addSyncLog(`Попытка присоединения к комнате: ${cleanCode}`);
        this.isHost = false;
        this.roomId = cleanCode;

        // 1. First attempt to join room via server backend
        try {
            const resp = await fetch('/api/room/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: cleanCode,
                    playerId: this.playerId,
                    playerName: this.playerName
                })
            });
            if (resp.ok) {
                const json = await resp.json();
                if (json.roomData) {
                    this.roomData = json.roomData;
                    this.addSyncLog('Комната найдена на сервере! Загрузка лобби...');
                    if (this.mode !== 'lobby' && this.roomData.status === 'waiting') {
                        this.mode = 'lobby';
                        this.renderLobby();
                    }
                }
            }
        } catch (e) {
            console.warn('[JoinRoom Server Notice]:', e);
        }

        const myPlayerObj = {
            id: this.playerId,
            name: this.playerName,
            score: 0,
            status: 'joined',
            isHost: false,
            lastAnswer: null,
            lastResult: null
        };

        const handleRoomStatePacket = (newRoomData) => {
            const currentRoundNum = this.roomData?.round || 0;
            const newRoundNum = newRoomData.round || 0;
            
            if (currentRoundNum === newRoundNum && this.roomData?.players?.[this.playerId]) {
                const localPlayer = this.roomData.players[this.playerId];
                if (localPlayer.status === 'answered' && newRoomData.players?.[this.playerId]?.status === 'answering') {
                    console.log('>>> DEBUG: [Sync] Preserving local "answered" status (host is slightly behind)');
                    newRoomData.players[this.playerId].status = 'answered';
                    newRoomData.players[this.playerId].lastAnswer = localPlayer.lastAnswer;
                }
            }

            this.roomData = newRoomData;
            
            if (this.mode !== 'lobby' && this.roomData.status === 'waiting') {
                this.addSyncLog('Получено состояние комнаты, открытие лобби...');
                this.mode = 'lobby';
                this.renderLobby();
            } else {
                this.handleRoomStateUpdate();
            }
        };

        this.listenSignal(cleanCode, async (msg) => {
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'ROOM_STATE' && msg.data) {
                handleRoomStatePacket(msg.data);
            } else if (msg.type === 'ANSWER' && msg.playerId === this.playerId) {
                if (this.pc && this.pc.signalingState === 'have-local-offer') {
                    this.addSyncLog('Получен ANSWER от хоста, настраиваем P2P...');
                    try {
                        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
                    } catch (e) {
                        console.warn('[WebRTC setRemoteDescription]:', e);
                    }
                }
            } else if (msg.type === 'ERROR' && msg.playerId === this.playerId) {
                this.addSyncLog(`Ошибка соединения: ${msg.message}`);
                this.showModalAlert('Ошибка', msg.message, async () => {
                    await this.leaveRoom();
                    this.renderMenu();
                });
            } else if (msg.type === 'ROOM_CLOSED') {
                this.addSyncLog('Комната была закрыта создателем');
                this.showModalAlert('Создатель покинул игру', '🛑 Комната была закрыта создателем. Сессия завершена.', async () => {
                    await this.leaveRoom();
                    this.renderMenu();
                });
            }
        });

        // Announce JOIN immediately over server relay
        this.addSyncLog('Отправка запроса на вход (Relay)...');
        await this.sendSignal(cleanCode, {
            type: 'JOIN',
            playerId: this.playerId,
            player: myPlayerObj
        }, this.roomData?.hostId);

        // In parallel, attempt WebRTC P2P connection
        try {
            const iceConfig = {
                iceServers: this.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }]
            };
            const pc = new RTCPeerConnection(iceConfig);
            this.pc = pc;

            pc.onicecandidateerror = (e) => {
                console.warn('[Client WebRTC ICE Notice]:', e);
            };

            const dc = pc.createDataChannel('game');
            this.hostConn = dc;

            dc.onopen = () => {
                this.addSyncLog('P2P DataChannel с хостом открыт');
                this.lastHostPingTime = Date.now();
                dc.send(JSON.stringify({
                    type: 'JOIN',
                    player: myPlayerObj
                }));
                // Guest stops ntfy listener when DataChannel opens
                if (this.eventSource) {
                    this.eventSource.close();
                    this.eventSource = null;
                }
            };

            dc.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'ROOM_STATE') {
                        handleRoomStatePacket(data.data);
                    } else if (data.type === 'ERROR') {
                        this.addSyncLog(`Ошибка от хоста: ${data.message}`);
                        this.showModalAlert('Ошибка', data.message, async () => {
                            await this.leaveRoom();
                            this.renderMenu();
                        });
                    } else if (data.type === 'ROOM_CLOSED') {
                        this.addSyncLog('Комната была закрыта создателем');
                        this.showModalAlert('Создатель покинул игру', '🛑 Комната была закрыта создателем. Сессия завершена.', async () => {
                            await this.leaveRoom();
                            this.renderMenu();
                        });
                    } else if (data.type === 'PING') {
                        this.lastHostPingTime = Date.now();
                        if (dc && dc.readyState === 'open') {
                            dc.send(JSON.stringify({ type: 'PONG', playerId: this.playerId }));
                        }
                    }
                } catch (err) {}
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await new Promise(resolve => {
                if (pc.iceGatheringState === 'complete') resolve();
                else {
                    const checkState = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); } };
                    pc.addEventListener('icegatheringstatechange', checkState);
                    setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); }, 1200);
                }
            });

            this.addSyncLog('Отправка WebRTC Offer...');
            await this.sendSignal(cleanCode, { type: 'OFFER', playerId: this.playerId, offer: pc.localDescription }, this.roomData?.hostId);
        } catch (webrtcErr) {
            console.warn('[Client WebRTC setup error, relying on server relay]:', webrtcErr);
        }

        // Heartbeat monitor for client (P2P liveness)
        if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
        this.roomHeartbeatTimer = setInterval(() => {
            if (!this.isHost && this.roomId) {
                this.lastHostPingTime = Date.now();
            }
        }, 8000);
    }

    broadcastRoomData() {
        if (!this.roomId || !this.roomData || !this.isHost) return;
        const msg = JSON.stringify({ type: 'ROOM_STATE', data: this.roomData });
        this.connections.forEach(c => {
            if (c.dc && c.dc.readyState === 'open') {
                try { c.dc.send(msg); } catch(e) {}
            }
        });
    }


    handleRoomStateUpdate() {
        if (!this.roomData) return;
        console.log(`>>> DEBUG: [Sync] handleRoomStateUpdate. Status: ${this.roomData.status}, Mode: ${this.mode}`);

        const currentPlayers = this.roomData.players || {};

        if (this.previousPlayers) {
            // Check for left players
            Object.keys(this.previousPlayers).forEach(pId => {
                if (!currentPlayers[pId] && pId !== this.playerId) {
                    const leftName = this.previousPlayers[pId]?.name || 'Игрок';
                    this.showToast(`🚪 Игрок "${leftName}" покинул игру`, 'danger');
                }
            });

            // Check for joined players
            Object.keys(currentPlayers).forEach(pId => {
                if (!this.previousPlayers[pId] && pId !== this.playerId) {
                    const joinedName = currentPlayers[pId]?.name || 'Игрок';
                    this.showToast(`✨ Игрок "${joinedName}" присоединился к комнате`, 'info');
                }
            });
        }

        this.previousPlayers = { ...currentPlayers };

        if (this.roomData.status === 'finished') {
            if (!this._gameOverToastShown) {
                this._gameOverToastShown = true;
                const players = Object.values(this.roomData.players || {}).sort((a, b) => b.score - a.score);
                const maxScore = players[0]?.score || 0;
                const winners = players.filter(p => p.score === maxScore && maxScore > 0);
                if (winners.length > 0) {
                    const names = winners.map(w => w.name).join(', ');
                    this.showToast(`🏆 Игра окончена! Победитель: ${names} (${maxScore} очков)`, 'success');
                }
            }
            this.renderMultiplayerGameOver();
            return;
        } else {
            this._gameOverToastShown = false;
        }

        if (this.roomData.status === 'waiting') {
            this.renderLobby();
            return;
        }

        // Handle sync phase screen during playing status
        if (this.roomData.currentRound?.phase === 'syncing') {
            this.renderSyncScreen('Синхронизация игроков...', 'Загрузка данных следующего раунда...');
            return;
        }

        // Trigger loading tag counts/images asynchronously if we are playing
        if (this.roomData.status === 'playing' && this.roomData.currentRound) {
            const round = this.roomData.currentRound;
            const leftName = round.leftTag?.name;
            const rightName = round.rightTag?.name;

            if (leftName && rightName) {
                if (this.currentLeftTagData?.name !== leftName || this.currentRightTagData?.name !== rightName) {
                    if (!this.multiplayerLoadingTags || this.loadingLeftName !== leftName || this.loadingRightName !== rightName) {
                        this.loadMultiplayerRoundTags(leftName, rightName);
                    }
                }
            }
        }

        if (this.roomData.status === 'playing') {
            if (this.mode !== 'multiplayer') {
                console.log('>>> DEBUG: [Sync] Switching mode to multiplayer');
                this.mode = 'multiplayer';
            }
            this.renderMultiplayerGame();
        }
    }

    // --- MULTIPLAYER LOBBY ---
    renderLobby() {
        const players = Object.values(this.roomData.players || {});
        const isHost = this.roomData.hostId === this.playerId;

        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('space', { size: 20 })}</div>
                    <h2 class="hl-app-title">${isHost ? 'Лобби Хоста (Мультиплеер)' : 'Комната Мультиплеера'}</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn" title="Закрыть">&times;</button>
            </div>

            <div class="hl-card" style="max-width: 580px;">
                <div class="hl-menu-container" style="gap: 16px;">
                    <span class="hl-hero-badge" style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(217, 119, 6, 0.15)); border-color: rgba(251, 191, 36, 0.4); color: #fcd34d;">
                        ${isHost ? 'Вы — Организатор (Хост)' : 'Вы подключились к комнате'} • ${this.roomData.category === 'copyrights' ? 'Битва Вселенных' : 'Только Персонажи'}
                    </span>

                    <h1 class="hl-menu-title" style="font-size: 1.75rem;">${isHost ? 'Лобби Комнаты' : 'Подключение к Комнате'}</h1>
                    <p class="hl-menu-desc" style="font-size: 0.9rem;">
                        Поделитесь кодом комнаты с друзьями. Игра начнется, когда организатор запустит раунд.
                    </p>

                    <!-- Код комнаты -->
                    <div class="hl-room-header-card" style="width: 100%;">
                        <div style="text-align: left;">
                            <div style="font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">КОД КОМНАТЫ:</div>
                            <div class="hl-room-code-val" style="color: #fbbf24; margin-top: 2px;">${this.roomId}</div>
                        </div>
                        <button id="hlCopyCodeBtn" class="hl-btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; min-width: auto; gap: 6px;">
                            ${icon('clipboard', { size: 14 })} Копировать
                        </button>
                    </div>

                    <div class="hl-form-box" style="width: 100%;">
                        <!-- Участники -->
                        <div style="width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left;">
                            <div class="hl-form-label" style="font-size: 0.85rem;">
                                Участники (${players.length}/${this.roomData.maxPlayers}):
                            </div>
                            <div class="hl-leaderboard" style="display: flex; flex-direction: column; gap: 6px; width: 100%; max-height: 140px; overflow-y: auto; box-sizing: border-box; padding: 10px;">
                                ${players.map(p => `
                                    <div class="hl-player-row">
                                        <div class="hl-player-name">
                                            ${p.isHost ? icon('crown', { size: 16, className: 'hl-host-crown' }) : icon('user', { size: 16 })} ${this.escapeHtml(p.name)}
                                            ${p.id === this.playerId ? ' <small style="color: var(--accent, #a78bfa);">(Вы)</small>' : ''}
                                        </div>
                                        <div class="hl-player-status hl-status-done">Готов</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                        <!-- Логи подключения -->
                        <div style="width: 100%; display: flex; flex-direction: column; gap: 4px; text-align: left;">
                            <div style="font-size: 0.72rem; font-weight: 700; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">Логи:</div>
                            <div id="hlSyncLogBox" style="width: 100%; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 8px 12px; font-family: monospace; font-size: 0.7rem; color: #888; height: 60px; overflow-y: auto; box-sizing: border-box;">
                                ${(this.syncLogs && this.syncLogs.length > 0) ? this.syncLogs.map(l => `<div style="margin-bottom: 2px;">${this.escapeHtml(l)}</div>`).join('') : 'Ожидание событий...'}
                            </div>
                        </div>

                        <!-- Кнопка запуска / Ожидание -->
                        <div style="width: 100%; margin-top: 6px;">
                            ${isHost ? `
                                <button class="hl-btn-primary game-start-btn" id="hlStartMultiplayerGameBtn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                    ${icon('sparkles', { size: 16 })} НАЧАТЬ ИГРУ
                                </button>
                            ` : `
                                <div class="game-waiting-indicator" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                                    ${icon('hourglass', { size: 16 })} Ожидание запуска игры организатором...
                                </div>
                            `}
                        </div>
                    </div>

                    <button class="hl-btn-secondary" id="hlLeaveRoomBtn" style="min-width: 140px; padding: 10px 16px;">
                        Выйти из комнаты
                    </button>
                </div>
            </div>
        `;

        const handleLeaveToSetup = async () => {
            await this.leaveRoom();
            this.renderMultiplayerSetup();
        };

        const headerBackBtn = document.getElementById('hlHeaderBackBtn');
        if (headerBackBtn) headerBackBtn.addEventListener('click', handleLeaveToSetup);

        document.getElementById('hlLeaveRoomBtn').addEventListener('click', handleLeaveToSetup);

        document.getElementById('hlCloseBtn').addEventListener('click', async () => {
            await this.leaveRoom();
            this.close();
        });
        document.getElementById('hlCopyCodeBtn').addEventListener('click', () => {
            navigator.clipboard.writeText(this.roomId);
            document.getElementById('hlCopyCodeBtn').innerHTML = `${icon('check', { size: 14 })} Скопировано!`;
            setTimeout(() => {
                const btn = document.getElementById('hlCopyCodeBtn');
                if (btn) btn.innerHTML = `${icon('clipboard', { size: 14 })} Скопировать`;
            }, 2000);
        });

        if (isHost) {
            document.getElementById('hlStartMultiplayerGameBtn').addEventListener('click', () => {
                console.log('>>> DEBUG: [Host] Starting game...');
                this.roomData.status = 'playing';
                this.roomData.round = 1;
                this.roomData.currentRound.phase = 'guessing';
                
                Object.keys(this.roomData.players).forEach(pId => {
                    this.roomData.players[pId].status = 'answering';
                    this.roomData.players[pId].score = 0;
                    this.roomData.players[pId].lastAnswer = null;
                    this.roomData.players[pId].lastResult = null;
                });
                
                this.mode = 'multiplayer';
                this.broadcastRoomData();
                this.handleRoomStateUpdate();
            });
        }
    }

    // --- MULTIPLAYER GAME VIEW ---
    renderMultiplayerGame() {
        const round = this.roomData.currentRound || {};
        const leftTag = this.currentLeftTagData || { name: round.leftTag?.name || '', count: 0, imageUrl: null };
        const rightTag = this.currentRightTagData || { name: round.rightTag?.name || '', count: 0, imageUrl: null };
        const players = Object.values(this.roomData.players || {});
        const me = this.roomData.players?.[this.playerId];

        const isRevealed = round.phase === 'revealed';
        const hasAnswered = me?.status === 'answered';
        const myResult = me?.lastResult; // 'correct' or 'wrong'
        const myChoice = me?.lastAnswer;

        const leftImg = leftTag.imageUrl;
        const rightImg = rightTag.imageUrl;

        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('space', { size: 20 })}</div>
                    <h2 class="hl-app-title" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <span>Раунд ${this.roomData.round}</span>
                        <small style="font-size: 0.85rem; color: var(--accent, #a78bfa); font-weight: 600;">(Цель: ${this.roomData.targetScore} очков)</small>
                        ${this.roomData.noAi ? `<span style="font-size: 0.65em; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; padding: 2px 8px; border-radius: 8px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;">${icon('noAi', { size: 10 })} Без ИИ</span>` : ''}
                    </h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-arena">
                    <div class="hl-versus-grid">
                        <!-- Левая карточка -->
                        <div class="hl-tag-card">
                            ${this.multiplayerLoadingTags ? `
                                <div class="hl-card-overlay"></div>
                                <div class="hl-card-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 250px;">
                                    <div class="hl-sync-icon" style="width: 48px; height: 48px; margin-bottom: 12px;">
                                        <div class="hl-spin">${icon('refresh', { size: 24 })}</div>
                                    </div>
                                    <div style="font-size: 0.95rem; color: rgba(255,255,255,0.7); font-weight: 500;">Загрузка тега...</div>
                                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 4px;">подсчет постов и поиск арта</div>
                                </div>
                            ` : `
                                ${leftImg ? `<img src="${leftImg}" class="hl-card-bg" id="hlBg_left" alt="" loading="lazy">` : ''}
                                <div class="hl-card-overlay"></div>
                                <div class="hl-card-content">
                                    <span class="hl-tag-badge">Известный Тег</span>
                                    ${this.renderCardImageContainer(leftTag, 'left')}
                                    <div class="hl-tag-name">${this.formatTagName(leftTag.name)}</div>
                                    ${renderOriginBadgeHtml(leftTag)}
                                    <div class="hl-tag-count">${leftTag.count.toLocaleString()}</div>
                                    <div class="hl-tag-sub">постов в базе</div>
                                </div>
                            `}
                        </div>

                        <div class="hl-vs-circle">VS</div>

                        <!-- Правая карточка -->
                        <div class="hl-tag-card ${isRevealed ? (myResult === 'correct' ? 'correct' : 'wrong') : ''}">
                            ${this.multiplayerLoadingTags ? `
                                <div class="hl-card-overlay"></div>
                                <div class="hl-card-content" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 250px;">
                                    <div class="hl-sync-icon" style="width: 48px; height: 48px; margin-bottom: 12px;">
                                        <div class="hl-spin">${icon('refresh', { size: 24 })}</div>
                                    </div>
                                    <div style="font-size: 0.95rem; color: rgba(255,255,255,0.7); font-weight: 500;">Загрузка тега...</div>
                                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 4px;">подсчет постов и поиск арта</div>
                                </div>
                            ` : `
                                ${rightImg ? `<img src="${rightImg}" class="hl-card-bg" id="hlBg_right" alt="" loading="lazy">` : ''}
                                <div class="hl-card-overlay"></div>
                                <div class="hl-card-content">
                                    ${isRevealed ? `
                                        <span class="hl-tag-badge" style="background: ${myResult === 'correct' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; color: #fff; display: inline-flex; align-items: center; gap: 4px;">
                                            ${myResult === 'correct' ? `${icon('check', { size: 16 })} ВЫ УГАДАЛИ! (+1)` : `${icon('x', { size: 16 })} ВЫ НЕ УГАДАЛИ`}
                                        </span>
                                        ${this.renderCardImageContainer(rightTag, 'right')}
                                        <div class="hl-tag-name">${this.formatTagName(rightTag.name)}</div>
                                        ${renderOriginBadgeHtml(rightTag)}
                                        <div class="hl-tag-count" style="color: ${myResult === 'correct' ? '#10b981' : '#ef4444'};">
                                            ${rightTag.count.toLocaleString()}
                                        </div>
                                        <div class="hl-tag-sub">постов в базе</div>
                                        ${myChoice ? `
                                            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-top: 4px;">
                                                Твой выбор: <b>${myChoice === 'higher' ? 'БОЛЬШЕ' : 'МЕНЬШЕ'}</b>
                                            </div>
                                        ` : ''}
                                    ` : hasAnswered ? `
                                        <span class="hl-tag-badge" style="background: rgba(var(--accent-rgb, 167, 139, 250), 0.2); border-color: rgba(var(--accent-rgb, 167, 139, 250), 0.4); color: var(--accent, #c4b5fd);">Целевой Тег</span>
                                        ${this.renderCardImageContainer(rightTag, 'right')}
                                        <div class="hl-tag-name">${this.formatTagName(rightTag.name)}</div>
                                        ${renderOriginBadgeHtml(rightTag)}
                                        <div style="color: #6ee7b7; font-weight: 800; font-size: 1.05rem; margin: 16px 0; background: rgba(16, 185, 129, 0.2); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3); display: inline-flex; align-items: center; gap: 6px;">
                                            ${icon('check', { size: 18 })} Выбор принят: ${myChoice === 'higher' ? 'БОЛЬШЕ' : 'МЕНЬШЕ'}
                                        </div>
                                        <div class="hl-tag-sub">Ожидаем ответы остальных участников...</div>
                                    ` : `
                                        <span class="hl-tag-badge" style="background: rgba(244, 63, 94, 0.2); border-color: rgba(244, 63, 94, 0.4); color: #fca5a5;">Целевой Тег</span>
                                        ${this.renderCardImageContainer(rightTag, 'right')}
                                        <div class="hl-tag-name">${this.formatTagName(rightTag.name)}</div>
                                        ${renderOriginBadgeHtml(rightTag)}
                                        <div style="color: rgba(255,255,255,0.9); font-size: 0.95rem; font-weight: 600;">
                                            В галерее постов:
                                        </div>
                                        <div class="hl-choice-btns">
                                            <button class="hl-btn-higher" id="hlMultiHigherBtn">${icon('arrowUp', { size: 16 })} БОЛЬШЕ</button>
                                            <button class="hl-btn-lower" id="hlMultiLowerBtn">${icon('arrowDown', { size: 16 })} МЕНЬШЕ</button>
                                        </div>
                                        <div class="hl-tag-sub" style="margin-top: 4px;">чем у ${this.formatTagName(leftTag.name)} (${leftTag.count.toLocaleString()})</div>
                                    `}
                                </div>
                            `}
                        </div>
                    </div>

                    ${isRevealed ? `
                        <div style="background: rgba(var(--accent-rgb, 167, 139, 250), 0.15); border: 1px solid rgba(var(--accent-rgb, 167, 139, 250), 0.3); color: var(--accent, #c4b5fd); padding: 10px 16px; border-radius: 12px; font-weight: 600; font-size: 0.9rem; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            ${icon('hourglass', { size: 16 })} Подведение итогов... Загрузка следующего раунда!
                        </div>
                    ` : ''}

                    <!-- Таблица игроков -->
                    <div class="hl-leaderboard">
                        <div style="font-size: 0.85rem; font-weight: 700; color: rgba(255,255,255,0.6); text-align: left;">
                            ${isRevealed ? 'Результаты участников в этом раунде:' : 'Состояние участников в этом раунде:'}
                        </div>
                        ${players.map(p => `
                            <div class="hl-player-row">
                                <div class="hl-player-name">
                                    ${p.name} ${p.id === this.playerId ? '(Вы)' : ''}
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div class="hl-player-score">${p.score} очков</div>
                                    ${isRevealed ? `
                                        <div style="font-size: 0.82rem; font-weight: 700;">
                                            ${p.lastAnswer === 'higher' ? '▲ БОЛЬШЕ' : p.lastAnswer === 'lower' ? '▼ МЕНЬШЕ' : '-'}
                                            ${p.lastResult === 'correct' ? ' <span style="color: #6ee7b7; background: rgba(16,185,129,0.25); padding: 2px 8px; border-radius: 6px;">+1</span>' : ' <span style="color: #fca5a5; background: rgba(239,68,68,0.2); padding: 2px 8px; border-radius: 6px;">0</span>'}
                                        </div>
                                    ` : `
                                        <div class="hl-player-status ${p.status === 'answered' ? 'hl-status-done' : 'hl-status-answering'}">
                                            ${p.status === 'answered' ? 'Ответил' : 'Думает...'}
                                        </div>
                                    `}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        this.attachImageControls();

        if (!hasAnswered && !isRevealed && !this.multiplayerLoadingTags) {
            document.getElementById('hlMultiHigherBtn').addEventListener('click', () => this.submitMultiplayerAnswer('higher'));
            document.getElementById('hlMultiLowerBtn').addEventListener('click', () => this.submitMultiplayerAnswer('lower'));
        }

        // Check if all players answered (Host logic triggers round evaluation)
        if (this.isHost && round.phase !== 'revealed' && !this.evaluatingRound && !this.multiplayerLoadingTags) {
            const allAnswered = players.length > 0 && players.every(p => p.status === 'answered');
            if (allAnswered) {
                this.evaluatingRound = true;
                this.evaluateMultiplayerRound();
            }
        }
    }

    async submitMultiplayerAnswer(choice) {
        if (!this.roomId || !this.roomData) return;
        const me = this.roomData.players?.[this.playerId];
        if (me && me.status === 'answered') return; // Если уже ответил, игнорируем повторные клики!

        // Instantly update local state so player sees their selection right away
        if (this.roomData.players[this.playerId]) {
            this.roomData.players[this.playerId].status = 'answered';
            this.roomData.players[this.playerId].lastAnswer = choice;
        }
        this.renderMultiplayerGame();

        try {
            if (this.isHost) {
                this.broadcastRoomData();
                this.checkAndEvaluateRound();
            } else {
                if (this.hostConn && this.hostConn.readyState === 'open') {
                    console.log(`>>> DEBUG: [Client] Sending ANSWER ${choice} to host via DC`);
                    try {
                        this.hostConn.send(JSON.stringify({
                            type: 'ANSWER',
                            playerId: this.playerId,
                            choice: choice
                        }));
                    } catch (dcErr) {}
                }
                // Always send via server relay to guarantee delivery
                this.sendSignal(this.roomId, {
                    type: 'ANSWER',
                    playerId: this.playerId,
                    choice: choice
                }, this.roomData?.hostId);
            }
        } catch (e) {
            console.error('Error submitting answer:', e);
        }
    }

    async evaluateMultiplayerRound() {
        try {
            const round = this.roomData.currentRound;
            
            let leftCount = this.currentLeftTagData ? this.currentLeftTagData.count : 0;
            let rightCount = this.currentRightTagData ? this.currentRightTagData.count : 0;
            
            // Fallback: if somehow not loaded, fetch them quickly
            if (!this.currentLeftTagData || this.currentLeftTagData.name !== round.leftTag?.name) {
                const isNoAi = !!this.roomData.noAi;
                const leftData = await this.getTagDataByName(round.leftTag?.name, isNoAi);
                leftCount = leftData.count;
            }
            if (!this.currentRightTagData || this.currentRightTagData.name !== round.rightTag?.name) {
                const isNoAi = !!this.roomData.noAi;
                const rightData = await this.getTagDataByName(round.rightTag?.name, isNoAi);
                rightCount = rightData.count;
            }

            const isHigher = rightCount >= leftCount;

            const players = { ...this.roomData.players };
            let winnerFound = false;

            Object.keys(players).forEach(pId => {
                const p = players[pId];
                const correct = (p.lastAnswer === 'higher' && isHigher) || (p.lastAnswer === 'lower' && !isHigher);
                if (correct) {
                    p.score += 1;
                    p.lastResult = 'correct';
                } else {
                    p.lastResult = 'wrong';
                }

                if (p.score >= this.roomData.targetScore) {
                    winnerFound = true;
                }
            });

            this.roomData.players = players;
            this.roomData.currentRound.phase = 'revealed';
            
            this.broadcastRoomData();
            this.handleRoomStateUpdate();

            // 2. Wait 3.8 seconds so players can clearly see the numbers, whether they were right or wrong, and scores
            await new Promise(resolve => setTimeout(resolve, 3800));

            // Reset player statuses for next round
            Object.keys(players).forEach(pId => {
                const p = players[pId];
                p.status = 'answering';
                p.lastAnswer = null;
                p.lastResult = null;
            });

            if (winnerFound) {
                this.roomData.players = players;
                this.roomData.status = 'finished';
                this.roomData.currentRound.phase = 'finished';
                
                this.broadcastRoomData();
                this.handleRoomStateUpdate();
            } else {
                // 3. Set syncing state while generating next round tags
                this.roomData.currentRound.phase = 'syncing';
                this.broadcastRoomData();
                this.handleRoomStateUpdate();

                // Prepare next round tags
                const roomCat = this.roomData.category || 'characters';
                const nextLeftTagName = round.rightTag.name;
                const nextRightTagName = this.getRandomTagName(nextLeftTagName, roomCat);

                this.roomData.players = players;
                this.roomData.round = (this.roomData.round || 1) + 1;
                this.roomData.currentRound = {
                    leftTag: { name: nextLeftTagName },
                    rightTag: { name: nextRightTagName },
                    phase: 'guessing'
                };
                
                this.broadcastRoomData();
                this.handleRoomStateUpdate();
            }
        } catch (err) {
            console.error('Error evaluating multiplayer round', err);
        } finally {
            this.evaluatingRound = false;
        }
    }

    renderMultiplayerGameOver() {
        const players = Object.values(this.roomData.players || {}).sort((a, b) => b.score - a.score);
        const maxScore = players[0]?.score || 0;
        const winners = players.filter(p => p.score === maxScore && maxScore > 0);

        let winnerTitle = '';
        if (winners.length > 1) {
            winnerTitle = `Ничья! Победители: ${winners.map(w => this.escapeHtml(w.name)).join(', ')}!`;
        } else if (winners.length === 1) {
            winnerTitle = `Победитель: ${this.escapeHtml(winners[0].name)}!`;
        } else {
            winnerTitle = 'Игра завершена!';
        }

        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group"><h2 class="hl-app-title">Игра Завершена!</h2></div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-menu-container">
                    <div class="hl-trophy-icon">${icon('trophy', { size: 48, strokeWidth: 2 })}</div>
                    <h2 style="font-size: 1.8rem; font-weight: 900; color: #fde047; margin: 0; line-height: 1.2;">
                        ${winnerTitle}
                    </h2>

                    <div class="hl-leaderboard" style="max-width: 480px; margin-top: 10px;">
                        <div style="font-size: 0.9rem; font-weight: 700; color: rgba(255,255,255,0.7); text-align: left; margin-bottom: 6px;">
                            Итоговая таблица результатов:
                        </div>
                        ${players.map((p, idx) => {
                            const isWinner = p.score === maxScore && maxScore > 0;
                            return `
                            <div class="hl-player-row" style="${isWinner ? 'background: rgba(234, 179, 8, 0.15); border: 1px solid rgba(234, 179, 8, 0.4);' : ''}">
                                <div class="hl-player-name">
                                    ${isWinner ? icon('crown', { size: 18, className: 'hl-host-crown' }) : idx === 1 ? icon('star', { size: 18 }) : icon('user', { size: 18 })} ${this.escapeHtml(p.name)}
                                    ${isWinner ? ' <small style="color: #fde047; font-weight: 800;">(Победитель)</small>' : ''}
                                </div>
                                <div class="hl-player-score" style="${isWinner ? 'color: #fde047; font-weight: 800;' : ''}">
                                    ${p.score} / ${this.roomData.targetScore}
                                </div>
                            </div>
                        `;}).join('')}
                    </div>

                    <button class="hl-btn-primary" id="hlBackMenuBtn" style="width: 100%; max-width: 480px; margin-top: 14px;">
                        ${icon('space', { size: 16 })} Главное Меню
                    </button>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('hlBackMenuBtn').addEventListener('click', async () => {
            await this.leaveRoom();
            this.renderMenu();
        });
    }

    // --- HELPERS ---
    renderCardImageContainer(tagData, side) {
        if (!tagData) return '';
        const images = (tagData.images && tagData.images.length > 0) ? tagData.images : (tagData.imageUrl ? [tagData.imageUrl] : []);
        let currentIdx = typeof tagData.currentImageIndex === 'number' ? tagData.currentImageIndex : 0;
        if (currentIdx >= images.length) currentIdx = 0;
        const currentImg = images[currentIdx] || tagData.imageUrl;
        const count = images.length;

        if (!currentImg) return '';

        return `
            <div class="hl-tag-img-container" data-side="${side}" title="Нажмите, чтобы открыть на весь экран">
                <img src="${currentImg}" class="hl-tag-thumb" id="hlThumb_${side}" alt="" loading="lazy">
                
                ${count > 1 ? `
                    <div class="hl-img-counter">
                        ${icon('image', { size: 12 })}
                        <span id="hlImgIdx_${side}">${currentIdx + 1}</span>/<span id="hlImgTotal_${side}">${count}</span>
                    </div>
                    <button class="hl-img-nav-btn hl-img-prev" data-side="${side}" data-dir="-1" title="Предыдущая картинка">
                        ${icon('chevronLeft', { size: 20 })}
                    </button>
                    <button class="hl-img-nav-btn hl-img-next" data-side="${side}" data-dir="1" title="Следующая картинка">
                        ${icon('chevronRight', { size: 20 })}
                    </button>
                ` : ''}

                <div class="hl-img-bottom-bar">
                    <button class="hl-img-cycle-btn" data-side="${side}" data-dir="1" title="Показать следующий арт">
                        ${icon('refresh', { size: 12 })} Сменить арт
                    </button>
                    <div class="hl-img-zoom-hint">
                        ${icon('search', { size: 12 })} На весь экран
                    </div>
                </div>
            </div>
        `;
    }

    async switchCardImage(side, direction = 1) {
        let tagData = null;
        if (this.mode === 'multiplayer' || this.mode === 'lobby') {
            tagData = side === 'left' ? this.currentLeftTagData : this.currentRightTagData;
        } else {
            tagData = side === 'left' ? this.leftTag : this.rightTag;
        }
        if (!tagData) return;

        if (!tagData.images || tagData.images.length <= 1) {
            const isNoAi = (this.mode === 'multiplayer' || this.mode === 'lobby') ? !!(this.roomData && this.roomData.noAi) : !!this.isNoAiMode;
            const randomPage = Math.floor(Math.random() * 8) + 1;
            const more = await fetchMoreTagImages(tagData.name, isNoAi, randomPage);
            if (more && more.length > 0) {
                const existing = new Set(tagData.images || [tagData.imageUrl].filter(Boolean));
                more.forEach(url => existing.add(url));
                tagData.images = Array.from(existing);
            }
        }

        const images = (tagData.images && tagData.images.length > 0) ? tagData.images : (tagData.imageUrl ? [tagData.imageUrl] : []);
        if (images.length === 0) return;

        let currentIdx = typeof tagData.currentImageIndex === 'number' ? tagData.currentImageIndex : 0;
        currentIdx = (currentIdx + direction + images.length) % images.length;
        tagData.currentImageIndex = currentIdx;
        tagData.imageUrl = images[currentIdx];

        const thumbImg = document.getElementById(`hlThumb_${side}`);
        const bgImg = document.getElementById(`hlBg_${side}`);
        const idxSpan = document.getElementById(`hlImgIdx_${side}`);
        const totalSpan = document.getElementById(`hlImgTotal_${side}`);

        if (thumbImg) thumbImg.src = images[currentIdx];
        if (bgImg) bgImg.src = images[currentIdx];
        if (idxSpan) idxSpan.textContent = (currentIdx + 1).toString();
        if (totalSpan) totalSpan.textContent = images.length.toString();

        const container = this.container.querySelector(`.hl-tag-img-container[data-side="${side}"]`);
        if (container && images.length > 1 && !container.querySelector('.hl-img-nav-btn')) {
            container.outerHTML = this.renderCardImageContainer(tagData, side);
            this.attachImageControls();
        }
    }

    attachImageControls() {
        const containers = this.container.querySelectorAll('.hl-tag-img-container');
        containers.forEach(container => {
            const side = container.getAttribute('data-side');
            let tagData = null;
            if (this.mode === 'multiplayer' || this.mode === 'lobby') {
                tagData = side === 'left' ? this.currentLeftTagData : this.currentRightTagData;
            } else {
                tagData = side === 'left' ? this.leftTag : this.rightTag;
            }

            const navBtns = container.querySelectorAll('.hl-img-nav-btn');
            navBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dir = parseInt(btn.getAttribute('data-dir') || '1', 10);
                    this.switchCardImage(side, dir);
                });
            });

            const cycleBtn = container.querySelector('.hl-img-cycle-btn');
            if (cycleBtn) {
                cycleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const dir = parseInt(cycleBtn.getAttribute('data-dir') || '1', 10);
                    this.switchCardImage(side, dir);
                });
            }

            container.addEventListener('click', (e) => {
                if (e.target.closest('.hl-img-nav-btn') || e.target.closest('.hl-img-cycle-btn')) {
                    return;
                }
                this.openImageLightbox(tagData, side);
            });
        });
    }

    attachLightboxListeners() {
        this.attachImageControls();
    }

    openImageLightbox(tagData, side = null) {
        if (!tagData) return;
        if (typeof tagData === 'string') {
            tagData = { name: '', count: 0, imageUrl: tagData, images: [tagData], currentImageIndex: 0 };
        }

        const images = (tagData.images && tagData.images.length > 0) ? tagData.images : (tagData.imageUrl ? [tagData.imageUrl] : []);
        if (images.length === 0) return;

        let currentIdx = typeof tagData.currentImageIndex === 'number' ? tagData.currentImageIndex : 0;
        if (currentIdx >= images.length) currentIdx = 0;

        const lightbox = document.createElement('div');
        lightbox.className = 'hl-lightbox';

        const updateLightboxView = () => {
            const curImg = images[currentIdx] || tagData.imageUrl;
            lightbox.innerHTML = `
                <div class="hl-lightbox-header">
                    <div class="hl-lightbox-title">
                        <span>${this.formatTagName(tagData.name || 'Арт')}</span>
                        ${images.length > 1 ? `<span style="font-size: 0.85rem; color: var(--accent, #a78bfa); font-weight: 700;">(${currentIdx + 1} / ${images.length})</span>` : ''}
                    </div>
                    <button class="hl-lightbox-close" id="hlLightboxCloseBtn">&times;</button>
                </div>

                ${images.length > 1 ? `
                    <button class="hl-lightbox-arrow prev" id="hlLightboxPrevBtn" title="Предыдущая картинка (←)">
                        ${icon('chevronLeft', { size: 32 })}
                    </button>
                    <button class="hl-lightbox-arrow next" id="hlLightboxNextBtn" title="Следующая картинка (→)">
                        ${icon('chevronRight', { size: 32 })}
                    </button>
                ` : ''}

                <div class="hl-lightbox-img-wrapper">
                    <img src="${curImg}" class="hl-lightbox-img" id="hlLightboxImg" alt="Превью арта">
                </div>

                <div class="hl-lightbox-footer">
                    <button class="hl-lightbox-btn" id="hlLightboxCycleBtn">
                        ${icon('refresh', { size: 14 })} ${images.length > 1 ? 'Следующая картинка' : 'Сменить картинку'}
                    </button>
                    <button class="hl-lightbox-btn" id="hlLightboxDoneBtn">
                        ${icon('check', { size: 14 })} Закрыть
                    </button>
                </div>
            `;

            const prevBtn = lightbox.querySelector('#hlLightboxPrevBtn');
            const nextBtn = lightbox.querySelector('#hlLightboxNextBtn');
            const cycleBtn = lightbox.querySelector('#hlLightboxCycleBtn');
            const closeBtn = lightbox.querySelector('#hlLightboxCloseBtn');
            const doneBtn = lightbox.querySelector('#hlLightboxDoneBtn');

            if (prevBtn) prevBtn.onclick = (e) => { e.stopPropagation(); navigate(-1); };
            if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); navigate(1); };
            if (cycleBtn) cycleBtn.onclick = (e) => { e.stopPropagation(); navigate(1); };
            if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); closeLightbox(); };
            if (doneBtn) doneBtn.onclick = (e) => { e.stopPropagation(); closeLightbox(); };
        };

        const navigate = async (dir) => {
            if (images.length <= 1) {
                const isNoAi = (this.mode === 'multiplayer' || this.mode === 'lobby') ? !!(this.roomData && this.roomData.noAi) : !!this.isNoAiMode;
                const randomPage = Math.floor(Math.random() * 8) + 1;
                const more = await fetchMoreTagImages(tagData.name, isNoAi, randomPage);
                if (more && more.length > 0) {
                    const existing = new Set(tagData.images || [tagData.imageUrl].filter(Boolean));
                    more.forEach(url => existing.add(url));
                    tagData.images = Array.from(existing);
                    images.splice(0, images.length, ...tagData.images);
                }
            }

            currentIdx = (currentIdx + dir + images.length) % images.length;
            tagData.currentImageIndex = currentIdx;
            tagData.imageUrl = images[currentIdx];

            if (side) {
                const thumbImg = document.getElementById(`hlThumb_${side}`);
                const bgImg = document.getElementById(`hlBg_${side}`);
                const idxSpan = document.getElementById(`hlImgIdx_${side}`);
                const totalSpan = document.getElementById(`hlImgTotal_${side}`);
                if (thumbImg) thumbImg.src = images[currentIdx];
                if (bgImg) bgImg.src = images[currentIdx];
                if (idxSpan) idxSpan.textContent = (currentIdx + 1).toString();
                if (totalSpan) totalSpan.textContent = images.length.toString();
            }

            updateLightboxView();
        };

        const keyHandler = (e) => {
            if (window.safeScreen && window.safeScreen.isActive) return;
            if (e.key === 'ArrowLeft') {
                navigate(-1);
            } else if (e.key === 'ArrowRight' || e.key === ' ') {
                navigate(1);
            } else if (e.key === 'Escape') {
                closeLightbox();
            }
        };

        const closeLightbox = () => {
            window.removeEventListener('keydown', keyHandler);
            lightbox.remove();
        };

        window.addEventListener('keydown', keyHandler);
        lightbox.onclick = (e) => {
            if (e.target === lightbox || e.target.classList.contains('hl-lightbox-img-wrapper')) {
                closeLightbox();
            }
        };

        updateLightboxView();
        document.body.appendChild(lightbox);
    }

    formatTagName(tag) {
        return formatDisplayTagName(tag);
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
