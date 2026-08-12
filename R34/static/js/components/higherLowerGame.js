import { fetchTagInfo } from '../api.js';
import { icon } from '../icons.js';

const CHARACTER_TAGS = [
    'hatsune_miku', '2b_(nier:automata)', 'makima_(chainsaw_man)', 'yor_forger', 
    'raiden_shogun', 'hu_tao', 'ganyu_(genshin_impact)', 'yelan_(genshin_impact)', 
    'furina_(genshin_impact)', 'keqing_(genshin_impact)', 'mona_(genshin_impact)', 
    'fischl_(genshin_impact)', 'clorinde_(genshin_impact)', 'navia_(genshin_impact)', 
    'kafka_(honkai:_star_rail)', 'firefly_(honkai:_star_rail)', 'march_7th', 
    'robin_(honkai:_star_rail)', 'rem_(re:zero)', 'ram_(re:zero)', 'emilia_(re:zero)', 
    'd.va', 'mercy_(overwatch)', 'tracer_(overwatch)', 'widowmaker', 'kiriko_(overwatch)', 
    'tifa_lockhart', 'aerith_gainsborough', 'ahri', 'jinx_(league_of_legends)', 
    'kaisa_(league_of_legends)', 'evelynn_(league_of_legends)', 'boa_hancock', 
    'nami_(one_piece)', 'nico_robin', 'tsuyu_asui', 'ochako_uraraka', 'mirko_(my_hero_academia)', 
    'asuka_langley_soryu', 'rei_ayanami', 'zero_two_(darling_in_the_franxx)', 
    'power_(chainsaw_man)', 'reze_(chainsaw_man)', 'marin_kitagawa', 'lucy_(cyberpunk)', 
    'rebecca_(cyberpunk)', 'frieren', 'fern_(frieren)', 'uzaki_hana', 'nagatoro_hayase', 
    'chika_fujiwara', 'kaguya_shinomiya', 'nezuko_kamado', 'mitsuri_kanroji', 
    'shinobu_kocho', 'houshou_marine', 'gawr_gura', 'usada_pekora', 'mori_calliope', 
    'shirakami_fubuki', 'hoshimachi_suisei', 'toki_(blue_archive)', 'hina_(blue_archive)', 
    'arisu_(blue_archive)', 'shiroko_(blue_archive)', 'asuna_(blue_archive)', 
    'karin_(blue_archive)', 'kurokami_fubuki', 'cammy', 'juri_han', 'chun-li', 
    'a2_(nier:automata)', 'artoria_pendragon', 'jalter', 'scathach_(fate)', 'astolfo', 
    'bb_(fate)', 'shuten_douji', 'tamamo_no_mae', 'rias_gremory', 'akeno_himejima', 
    'megumin', 'aqua_(konosuba)', 'esdeath', 'pyra_(xenoblade)', 'mythra_(xenoblade)', 
    'samus_aran', 'zelda', 'bayonetta'
];

const GENERAL_TAGS = [
    'hatsune_miku', 'genshin_impact', 'overwatch', 'blue_archive', 'fate/grand_order', 
    'nekomimi', 'honkai:_star_rail', 'pokemon', 'naruto', 'one_piece', 'chainsaw_man', 
    'spy_x_family', 'touhou', 'azur_lane', 'arknights', 'zenless_zone_zero', 'hololive', 
    'vtuber', 'bikini', 'thighhighs', 'cleavage', 'panties', 'maid', 'cat_ears', 
    'school_uniform', 'glasses', 'swimsuit', 'bunny_girl', 'stockings', 'long_hair', 
    'short_hair', 'blonde_hair', 'blue_eyes', 'red_hair', 'tail', 'wings', 'tattoo', 
    'large_breasts', 'medium_breasts', 'flat_chest', 'dress', 'kimono', 'demon', 'angel', 
    'vampire', 'elf', 'solo', 'high_heels', 'skirt', 'ribbon', 'gloves', 'choker', 
    'pigtails', 'navel', 'weapon', 'sword', 'barefoot', 'standing', 'sitting', 'lying', 
    'looking_at_viewer', 'open_mouth', 'blush', 'smile', 'fated_series', 'nier:_automata', 
    'dragon_ball', 'league_of_legends', 'honkai_impact_3rd', 'substitute', 'original',
    ...CHARACTER_TAGS
];

export class HigherLowerGame {
    constructor() {
        this.container = null;
        this.mode = 'menu'; // 'menu', 'solo', 'lobby', 'multiplayer'
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('r34_hl_highscore') || '0', 10);
        this.selectedCategory = localStorage.getItem('r34_hl_category') || 'all'; // 'all' or 'characters'
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

        window.addEventListener('beforeunload', () => {
            if (this.roomId) {
                this.leaveRoom();
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
        let container = this.container.querySelector('.hl-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'hl-toast-container';
            this.container.appendChild(container);
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
            toast.style.transform = 'translateY(-10px)';
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
            <div style="background: #1e1e24; border: 1px solid rgba(167, 139, 250, 0.3); border-radius: 20px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); color: #fff; font-family: inherit; display: flex; flex-direction: column; max-height: 80vh;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="font-size: 1.25rem; font-weight: 800; color: #a78bfa; display: flex; align-items: center; gap: 8px;">
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
                            <span>Код: <b style="color: #a78bfa; letter-spacing: 1px;">${r.code}</b></span>
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
        if (this.wsConnection) {
            this.wsConnection.close();
            this.wsConnection = null;
        }

        if (this.isHost) {
            this.connections.forEach(c => {
                if (c.dc && c.dc.readyState === 'open') {
                    c.dc.send(JSON.stringify({ type: 'ROOM_CLOSED' }));
                    c.dc.close();
                }
            });
            this.connections = [];
        } else if (this.hostConn && this.hostConn.readyState === 'open') {
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
    }

    renderSyncScreen(title = 'Синхронизация игроков...', desc = 'Ожидание подключения...') {
        if (!this.syncLogs) this.syncLogs = [];
        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('space', { size: 20 })}</div>
                    <h2 class="hl-app-title">Мультиплеер</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>
            <div class="hl-card">
                <div class="hl-sync-container" style="max-width: 520px; margin: 0 auto; width: 100%;">
                    <div class="hl-sync-icon hl-spin">
                        ${icon('refresh', { size: 32 })}
                    </div>
                    <h3 class="hl-sync-title">${this.escapeHtml(title)}</h3>
                    <p class="hl-sync-desc">${this.escapeHtml(desc)}</p>

                    <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px 16px; margin-top: 20px; text-align: left; max-height: 180px; overflow-y: auto; font-family: monospace; font-size: 0.8rem; color: #cbd5e1; width: 100%; box-sizing: border-box;" id="hlSyncLogBox">
                        ${this.syncLogs.map(l => `<div style="margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 2px;">${this.escapeHtml(l)}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
        document.getElementById('hlCloseBtn').addEventListener('click', async () => {
            await this.leaveRoom();
            this.renderMenu();
        });
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
        if (category === 'characters') {
            return CHARACTER_TAGS;
        }
        return GENERAL_TAGS;
    }

    // --- RENDER MENU ---
    renderMenu() {
        this.container.innerHTML = `
            <div class="hl-header">
                <div class="hl-title-group">
                    <div class="hl-logo-icon">${icon('flame', { size: 20 })}</div>
                    <h2 class="hl-app-title">Больше или Меньше</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-menu-container">
                    <span class="hl-hero-badge">Интерактивная Мини-Игра</span>
                    <h1 class="hl-menu-title">Угадай, у какого тега больше постов!</h1>
                    <p class="hl-menu-desc">
                        Вам даются два тега с обложками реальных артов из базы. Сравните их популярность и угадайте, у второго тега <b>БОЛЬШЕ</b> или <b>МЕНЬШЕ</b> постов, чем у первого!
                    </p>

                    <div class="hl-category-select-box">
                        <div style="font-size: 0.85rem; font-weight: 700; color: rgba(255,255,255,0.7); display: flex; align-items: center; gap: 6px;">
                            ${icon('tag', { size: 16 })} Выберите категорию тегов:
                        </div>
                        <div class="hl-category-pills">
                            <button class="hl-cat-pill ${this.selectedCategory === 'all' ? 'active' : ''}" id="hlCatAllBtn">
                                ${icon('sparkles', { size: 16 })} Все Теги (Общие)
                            </button>
                            <button class="hl-cat-pill ${this.selectedCategory === 'characters' ? 'active' : ''}" id="hlCatCharactersBtn">
                                ${icon('user', { size: 16 })} Только Персонажи
                            </button>
                        </div>
                        <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                            <input type="checkbox" id="hlSoloNoAiCheckbox" ${this.isNoAiMode ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #a78bfa; cursor: pointer;">
                            <label for="hlSoloNoAiCheckbox" style="font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.9); cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px;">
                                ${icon('noAi', { size: 14 })} Режим "Без ИИ"
                            </label>
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

                    <div style="display: flex; gap: 16px; margin-bottom: 6px;">
                        <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 12px 24px; border-radius: 14px; text-align: center;">
                            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">Твой лучший рекорд</div>
                            <div style="font-size: 1.6rem; font-weight: 900; color: #a78bfa;">${this.highScore}</div>
                        </div>
                    </div>

                    <div class="hl-menu-actions">
                        <button class="hl-btn-primary" id="hlStartSoloBtn">
                            ${icon('gamepad', { size: 18 })} Одиночный Режим
                        </button>
                        <button class="hl-btn-secondary" id="hlMultiplayerMenuBtn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; position: relative; margin-top: 6px;">
                            <span style="position: absolute; top: -10px; right: 12px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.5); pointer-events: none;">Бета</span>
                            <span id="hlKeyWarningTag" style="display: none; position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); background: #ef4444; color: #fff; font-size: 0.6rem; font-weight: 900; padding: 1px 6px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.3); pointer-events: none;">ТРЕБУЕТСЯ API</span>
                            ${icon('space', { size: 18 })} Онлайн с Друзьями
                        </button>

                        <!-- API KEY SECTION (Prominent) -->
                        <div style="margin-top: 20px; background: rgba(245, 158, 11, 0.1); border: 2px solid #f59e0b; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 20px rgba(245, 158, 11, 0.15);">
                            <div id="hlKeyInstructionsBtn" style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px; background: rgba(245, 158, 11, 0.25); border-radius: 12px; border: 1px dashed rgba(245, 158, 11, 0.5); transition: all 0.2s ease;" onmouseover="this.style.transform='scale(1.02)'; this.style.background='rgba(245, 158, 11, 0.35)'" onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(245, 158, 11, 0.25)'">
                                <div style="background: #f59e0b; color: #000; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.2rem; box-shadow: 0 0 15px rgba(245, 158, 11, 0.4);">!</div>
                                <div style="flex: 1;">
                                    <div style="font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #f59e0b;">Обязательно</div>
                                    <div style="font-size: 1.05rem; color: #fff; font-weight: 800; text-decoration: underline;">Как получить ключ API?</div>
                                </div>
                                ${icon('chevronRight', { size: 24, color: '#f59e0b' })}
                            </div>
                            
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <input type="password" id="hlMeteredKeyInput" class="hl-input" placeholder="Вставьте ваш Secret Key..." style="width: 100%; text-align: center; font-size: 0.9rem; background: rgba(0,0,0,0.5); border-color: rgba(245, 158, 11, 0.4); color: #fff; font-family: monospace;">
                                <button id="hlCheckMeteredKeyBtn" class="hl-btn-primary" style="width: 100%; font-size: 0.95rem; padding: 14px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; border: none; font-weight: 900; box-shadow: 0 4px 15px rgba(217, 119, 6, 0.3);">Проверить и сохранить ключ</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('hlStartSoloBtn').addEventListener('click', () => this.startSoloGame());
        
        const multiBtn = document.getElementById('hlMultiplayerMenuBtn');
        const keyInput = document.getElementById('hlMeteredKeyInput');
        
        const updateMultiBtnState = () => {
            const key = (localStorage.getItem('hlMeteredKey') || '').trim();
            const warningTag = document.getElementById('hlKeyWarningTag');
            
            if (!key) {
                multiBtn.style.opacity = '0.6';
                multiBtn.style.filter = 'grayscale(0.8)';
                multiBtn.style.cursor = 'help';
                if (warningTag) {
                    warningTag.style.display = 'block';
                    warningTag.innerText = 'ТРЕБУЕТСЯ API КЛЮЧ';
                }
            } else {
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
                this.showToast('⚠️ Сначала введите API ключ в блоке ниже', 'warning');
            }
        });

        multiBtn.addEventListener('click', () => {
            const key = (localStorage.getItem('hlMeteredKey') || '').trim();
            if (!key) {
                this.showToast('❌ Доступ запрещен: введите API ключ для работы мультиплеера', 'danger');
                return;
            }
            this.renderMultiplayerSetup();
        });
        
        document.getElementById('hlKeyInstructionsBtn').addEventListener('click', () => this.renderKeyInstructionsModal());

        keyInput.value = localStorage.getItem('hlMeteredKey') || '';
        updateMultiBtnState();

        keyInput.addEventListener('input', () => {
            localStorage.setItem('hlMeteredKey', keyInput.value.trim());
            updateMultiBtnState();
        });

        document.getElementById('hlCheckMeteredKeyBtn').addEventListener('click', async () => {
            const key = keyInput.value.trim();
            if (!key) { 
                this.showToast('⚠️ Сначала введите ключ', 'warning');
                updateMultiBtnState();
                return; 
            }
            
            localStorage.setItem('hlMeteredKey', key);
            updateMultiBtnState();

            try {
                // Test connection
                const url = `wss://rms.metered.ca/v1?key=${key}`;
                console.log(`>>> DEBUG: Testing connection to: ${url}`);
                const ws = new WebSocket(url);
                ws.onopen = () => { 
                    ws.close(); 
                    const btn = document.getElementById('hlCheckMeteredKeyBtn');
                    btn.style.borderColor = '#10b981';
                    btn.style.color = '#10b981';
                    btn.textContent = 'Ключ верный!';
                    setTimeout(() => {
                        btn.style.borderColor = '';
                        btn.style.color = '';
                        btn.textContent = 'Проверить';
                    }, 3000);
                };
                ws.onerror = (e) => { 
                    console.error('>>> DEBUG: WebSocket error event:', e);
                    alert('Ошибка подключения к Metered.ca. Проверьте консоль (F12).'); 
                };
            } catch(e) { console.error(e); alert('Ошибка: ' + e.message); }
        });

        const catAllBtn = document.getElementById('hlCatAllBtn');
        const catCharBtn = document.getElementById('hlCatCharactersBtn');
        if (catAllBtn && catCharBtn) {
            catAllBtn.addEventListener('click', () => {
                this.selectedCategory = 'all';
                localStorage.setItem('r34_hl_category', 'all');
                catAllBtn.classList.add('active');
                catCharBtn.classList.remove('active');
            });
            catCharBtn.addEventListener('click', () => {
                this.selectedCategory = 'characters';
                localStorage.setItem('r34_hl_category', 'characters');
                catCharBtn.classList.add('active');
                catAllBtn.classList.remove('active');
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
                    <div class="hl-logo-icon">${icon('space', { size: 20 })}</div>
                    <h2 class="hl-app-title">Онлайн Режим <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 6px;">БЕТА</span></h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-menu-container">
                    <h2 style="font-size: 1.8rem; font-weight: 800; color: #fff; margin: 0;">Мультиплеерные Комнаты</h2>
                    <p style="color: rgba(255,255,255,0.7); font-size: 0.95rem;">
                        Играй с друзьями вне зависимости от устройства. Создай комнату или введи 5-значный код для входа!
                    </p>

                    <div class="hl-form-box">
                        <div class="hl-form-field">
                            <label class="hl-form-label">Твое Имя / Никнейм:</label>
                            <input type="text" id="hlPlayerNameInput" class="hl-input" value="${this.escapeHtml(this.playerName)}" maxlength="20">
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <label class="hl-form-label">Присоединиться к комнате:</label>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="hlRoomCodeInput" class="hl-input" placeholder="5-значный код (напр. BFTZK)" maxlength="5" style="text-align: center; font-weight: bold; letter-spacing: 2px; text-transform: uppercase;">
                                <button class="hl-btn-primary" id="hlJoinRoomBtn" style="min-width: auto; padding: 10px 18px;">Войти</button>
                            </div>
                        </div>

                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 6px 0;">

                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <label class="hl-form-label">Создать новую комнату:</label>
                            
                            <div style="background: rgba(255,255,255,0.05); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                    <label class="hl-form-label" style="margin: 0;">Макс. игроков:</label>
                                    <span id="hlMaxPlayersVal" style="font-weight: 800; font-size: 1rem; color: #a78bfa;">6 игрок.</span>
                                </div>
                                <input type="range" id="hlMaxPlayersRange" min="2" max="15" value="6" style="width: 100%; accent-color: #a78bfa; cursor: pointer; height: 6px;">
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                <label class="hl-form-label" style="margin: 0;">Очков для победы:</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <select id="hlTargetScoreSelect" class="hl-input" style="flex: 1;">
                                        <option value="5">5 очков (Быстрая)</option>
                                        <option value="10" selected>10 очков (Стандарт)</option>
                                        <option value="15">15 очков (Долгая)</option>
                                        <option value="20">20 очков (Марафон)</option>
                                        <option value="custom">Свой вариант...</option>
                                    </select>
                                    <input type="number" id="hlTargetScoreCustom" class="hl-input" min="1" max="100" value="10" placeholder="1-100" style="display: none; width: 110px; text-align: center; font-weight: bold;">
                                </div>
                            </div>

                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); margin-top: 2px;">
                                <label for="hlNoAiCheckbox" style="font-size: 0.9rem; font-weight: 600; color: rgba(255,255,255,0.9); cursor: pointer; display: flex; align-items: center; gap: 8px; margin: 0;">
                                    ${icon('noAi', { size: 16 })} Режим "Без ИИ"
                                </label>
                                <input type="checkbox" id="hlNoAiCheckbox" style="width: 18px; height: 18px; accent-color: #a78bfa; cursor: pointer;">
                            </div>

                            <select id="hlRoomCategorySelect" class="hl-input" style="width: 100%;">
                                <option value="all" ${this.selectedCategory === 'all' ? 'selected' : ''}>Категория: Все теги (Общие + Персонажи)</option>
                                <option value="characters" ${this.selectedCategory === 'characters' ? 'selected' : ''}>Категория: Только Персонажи</option>
                            </select>
                            <button class="hl-btn-primary" id="hlCreateRoomBtn" style="width: 100%; margin-top: 6px;">
                                ${icon('sparkles', { size: 16 })} Создать Комнату
                            </button>
                        </div>
                    </div>

                    <button class="hl-btn-secondary" id="hlBackMenuBtn" style="min-width: 160px; padding: 10px 18px; margin-top: 10px;">
                        ← Назад
                    </button>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('hlBackMenuBtn').addEventListener('click', () => this.renderMenu());

        const nameInput = document.getElementById('hlPlayerNameInput');
        nameInput.addEventListener('change', () => {
            this.playerName = nameInput.value.trim() || 'Игрок';
            localStorage.setItem('r34_hl_player_name', this.playerName);
        });

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

            const cat = document.getElementById('hlRoomCategorySelect').value;
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

    // --- SOLO GAME LOGIC ---
    async startSoloGame() {
        this.score = 0;
        this.mode = 'solo';
        this.renderSoloGame();
        
        // Load initial pair
        this.leftTag = await this.getRandomTagData('', this.selectedCategory);
        this.rightTag = await this.getRandomTagData(this.leftTag.name, this.selectedCategory);
        this.renderSoloGame();
    }

    async getRandomTagData(excludeTagName = '', category = this.selectedCategory) {
        const pool = this.getTagPool(category);
        let attempts = 0;
        const isNoAi = (this.mode === 'multiplayer' || this.mode === 'lobby') ? !!(this.roomData && this.roomData.noAi) : !!this.isNoAiMode;

        while (attempts < 20) {
            attempts++;
            const idx = Math.floor(Math.random() * pool.length);
            const candidateTag = pool[idx];
            if (!candidateTag || candidateTag === excludeTagName) continue;

            const cacheKey = candidateTag + (isNoAi ? ':noai' : '');
            if (this.tagCache.has(cacheKey)) {
                const cached = this.tagCache.get(cacheKey);
                if (cached && cached.count > 0 && cached.imageUrl) {
                    return cached;
                }
            }

            try {
                const data = await fetchTagInfo(candidateTag, isNoAi);
                if (data && data.count > 0 && data.imageUrl) {
                    this.tagCache.set(cacheKey, data);
                    return data;
                }
            } catch (e) {
                console.error('Error fetching info for tag', candidateTag, e);
            }
        }

        return { name: 'hatsune_miku', count: 120000, imageUrl: null };
    }

    getRandomTagName(excludeTagName = '', category = 'all') {
        const pool = this.getTagPool(category);
        let attempts = 0;
        while (attempts < 100) {
            attempts++;
            const idx = Math.floor(Math.random() * pool.length);
            const candidateTag = pool[idx];
            if (candidateTag && candidateTag !== excludeTagName) {
                return candidateTag;
            }
        }
        return 'hatsune_miku';
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
                <div class="hl-card" style="text-align: center; padding: 60px;">
                    <div style="font-size: 1.2rem; color: #a78bfa; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        ${icon('hourglass', { size: 22 })} Загрузка изображений и подсчет постов...
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
                        <span class="hl-cat-badge">${this.selectedCategory === 'characters' ? `${icon('user', { size: 14 })} Только Персонажи` : `${icon('sparkles', { size: 14 })} Все Теги`}</span>
                        ${this.isNoAiMode ? `<span class="hl-cat-badge" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.35); color: #fbbf24; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">${icon('noAi', { size: 12 })} Без ИИ</span>` : ''}
                        <div class="hl-score-badge" style="font-size: 0.9rem; color: rgba(255,255,255,0.7);">Рекорд: ${this.highScore}</div>
                    </div>

                    <div class="hl-versus-grid">
                        <!-- Левая карточка (Известная) -->
                        <div class="hl-tag-card">
                            ${leftImg ? `<img src="${leftImg}" class="hl-card-bg" alt="" loading="lazy">` : ''}
                            <div class="hl-card-overlay"></div>
                            <div class="hl-card-content">
                                <span class="hl-tag-badge">Известный Тег</span>
                                ${leftImg ? `
                                    <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                        <img src="${leftImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                        <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                    </div>
                                ` : ''}
                                <div class="hl-tag-name">${this.formatTagName(this.leftTag.name)}</div>
                                <div class="hl-tag-count">${this.leftTag.count.toLocaleString()}</div>
                                <div class="hl-tag-sub">постов в галерее</div>
                            </div>
                        </div>

                        <!-- VS значок -->
                        <div class="hl-vs-circle">VS</div>

                        <!-- Правая карточка (Скрытая/Открытая) -->
                        <div class="hl-tag-card ${answerResult === 'correct' ? 'correct' : answerResult === 'wrong' ? 'wrong' : ''}" id="hlRightCard">
                            ${rightImg ? `<img src="${rightImg}" class="hl-card-bg" alt="" loading="lazy">` : ''}
                            <div class="hl-card-overlay"></div>
                            <div class="hl-card-content">
                                ${rightRevealed ? `
                                    <span class="hl-tag-badge" style="background: ${answerResult === 'correct' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; color: #fff; display: inline-flex; align-items: center; gap: 4px;">
                                        ${answerResult === 'correct' ? `${icon('check', { size: 16 })} ПРАВИЛЬНО!` : `${icon('x', { size: 16 })} НЕВЕРНО!`}
                                    </span>
                                    ${rightImg ? `
                                        <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                            <img src="${rightImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                            <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                        </div>
                                    ` : ''}
                                    <div class="hl-tag-name">${this.formatTagName(this.rightTag.name)}</div>
                                    <div class="hl-tag-count" style="color: ${answerResult === 'correct' ? '#10b981' : '#ef4444'};">
                                        ${this.rightTag.count.toLocaleString()}
                                    </div>
                                    <div class="hl-tag-sub">постов в галерее</div>
                                ` : `
                                    <span class="hl-tag-badge" style="background: rgba(244, 63, 94, 0.2); border-color: rgba(244, 63, 94, 0.4); color: #fca5a5;">Целевой Тег</span>
                                    ${rightImg ? `
                                        <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                            <img src="${rightImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                            <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                        </div>
                                    ` : ''}
                                    <div class="hl-tag-name">${this.formatTagName(this.rightTag.name)}</div>
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
        this.attachLightboxListeners();

        if (!rightRevealed) {
            document.getElementById('hlBtnHigher').addEventListener('click', () => this.handleSoloChoice('higher'));
            document.getElementById('hlBtnLower').addEventListener('click', () => this.handleSoloChoice('lower'));
        }
    }

    async handleSoloChoice(choice) {
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
                this.renderSoloGame();
            }, 2800);
        } else {
            setTimeout(() => {
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
                        <div style="font-size: 3rem; font-weight: 900; color: #a78bfa;">${this.score}</div>
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

    // --- SERVERLESS P2P MULTIPLAYER LOGIC ---
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
    async sendSignal(code, data) {
        if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
            console.log('>>> DEBUG: [Signaling] WebSocket not connected, queuing signal:', data);
            this.signalQueue.push({ code, data });
            return;
        }
        const channelName = `r34_v1_${code}`;
        console.log(`>>> DEBUG: [Signaling] Publishing to channel ${channelName}:`, data);
        this.wsConnection.send(JSON.stringify({ type: 'publish', channel: channelName, data: data }));
    }

    listenSignal(code, onMessage) {
        const key = this.getMeteredKey();
        if (!key) {
            console.error('>>> DEBUG: [Signaling] No Metered.ca API key set!');
            return;
        }
        
        const channelName = `r34_v1_${code}`;
        console.log(`>>> DEBUG: [Signaling] Connecting for channel ${channelName}`);
        
        if (this.wsConnection) {
            this.wsConnection.onclose = null;
            this.wsConnection.close();
        }

        const connect = () => {
            this.wsConnection = new WebSocket(`wss://rms.metered.ca/v1?key=${key}`);
            this.wsConnection.onopen = () => {
                console.log(`>>> DEBUG: [Signaling] WebSocket Socket Open. Waiting for "welcome" message...`);
            };
            this.wsConnection.onmessage = (event) => {
                console.log('>>> DEBUG: [Signaling] RAW MESSAGE:', event.data);
                try {
                    const msg = JSON.parse(event.data);
                    
                    if (msg.type === 'welcome') {
                        console.log(`>>> DEBUG: [Signaling] Received "welcome". Now subscribing to ${channelName}...`);
                        this.wsConnection.send(JSON.stringify({ type: 'subscribe', channel: channelName }));
                        
                        // Process queued signals
                        while (this.signalQueue.length > 0) {
                            const queued = this.signalQueue.shift();
                            const qChannel = `r34_v1_${queued.code}`;
                            console.log(`>>> DEBUG: [Signaling] Sending queued signal to ${qChannel}:`, queued.data);
                            this.wsConnection.send(JSON.stringify({ type: 'publish', channel: qChannel, data: queued.data }));
                        }
                    } else if (msg.type === 'message' && msg.channel === channelName) {
                        onMessage(msg.data);
                    }
                } catch (e) { console.error(e); }
            };
            this.wsConnection.onclose = () => {
                if (this.roomId === code) setTimeout(connect, 3000);
            };
        };
        connect();
    }

    async createRoom(maxPlayers, targetScore, category = 'all', noAi = false) {
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

        this.addSyncLog('Открытие сигналинга на ntfy.sh...');
        this.listenSignal(code, async (msg) => {
            if (msg.type === 'OFFER') {
                const clientPlayerId = msg.playerId;
                this.addSyncLog(`Получен OFFER от игрока ${clientPlayerId.substring(0, 6)}...`);
                if (this.roomData.status === 'playing') {
                    this.addSyncLog('Отклонено: игра уже идет');
                    await this.sendSignal(code, { type: 'ERROR', playerId: clientPlayerId, message: 'Игра уже началась!' });
                    return;
                }
                if (Object.keys(this.roomData.players).length >= this.roomData.maxPlayers && !this.roomData.players[clientPlayerId]) {
                    this.addSyncLog('Отклонено: комната заполнена');
                    await this.sendSignal(code, { type: 'ERROR', playerId: clientPlayerId, message: 'Комната заполнена!' });
                    return;
                }

                const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
                this.clientPeerConnections[clientPlayerId] = pc;
                this.addSyncLog('Создан RTCPeerConnection для клиента, инициализация STUN...');

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
                                this.addSyncLog(`Игрок ${data.player.name} присоединился`);
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
                            }
                        } catch (err) {}
                    };

                    dc.onclose = () => {
                        this.addSyncLog('DataChannel закрыт клиентом');
                        this.connections = this.connections.filter(c => c.dc !== dc);
                        delete this.clientPeerConnections[clientPlayerId];
                        if (this.roomData?.players[clientPlayerId]) {
                            const leftName = this.roomData.players[clientPlayerId].name || 'Игрок';
                            delete this.roomData.players[clientPlayerId];
                            
                            // Explicitly show toast on host side as well
                            this.showToast(`🚪 Игрок "${leftName}" покинул игру`, 'danger');
                            
                            this.broadcastRoomData();
                            this.handleRoomStateUpdate();

                            // Check if host is alone (only 1 player left in the room data)
                            if (Object.keys(this.roomData.players).length <= 1) {
                                setTimeout(() => {
                                    if (Object.keys(this.roomData.players).length <= 1) {
                                        this.showModalAlert('Сессия завершена', 'Все игроки покинули комнату. Сессия закрыта.', async () => {
                                            await this.leaveRoom();
                                            this.renderMenu();
                                        });
                                    }
                                }, 500);
                            }
                        }
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
                        setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); }, 1500);
                    }
                });

                this.addSyncLog('Отправка ANSWER клиенту через сигналинг...');
                await this.sendSignal(code, { type: 'ANSWER', playerId: clientPlayerId, answer: pc.localDescription });
            }
        });

        this.addSyncLog('Ожидание подключения игроков в лобби...');
        this.mode = 'lobby';
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

        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        this.pc = pc;
        this.addSyncLog('Создан RTCPeerConnection (клиент)');

        const dc = pc.createDataChannel('game');
        this.hostConn = dc;
        this.addSyncLog('Создан DataChannel для отправки сообщений хосту');

        dc.onopen = () => {
            this.addSyncLog('DataChannel с хостом открыт, отправка JOIN...');
            dc.send(JSON.stringify({
                type: 'JOIN',
                player: {
                    id: this.playerId,
                    name: this.playerName,
                    score: 0,
                    status: 'joined',
                    isHost: false,
                    lastAnswer: null,
                    lastResult: null
                }
            }));
        };

        dc.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.type === 'ROOM_STATE') {
                    const newRoomData = data.data;
                    
                    // Smart Merge: If we have already answered locally in the current round, 
                    // preserve that status even if the host's state is slightly behind
                    const currentRoundNum = this.roomData?.round || 0;
                    const newRoundNum = newRoomData.round || 0;
                    
                    if (currentRoundNum === newRoundNum && this.roomData?.players[this.playerId]) {
                        const localPlayer = this.roomData.players[this.playerId];
                        if (localPlayer.status === 'answered' && newRoomData.players[this.playerId]?.status === 'answering') {
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
                } else if (data.type === 'ERROR') {
                    this.addSyncLog(`Ошибка от хоста: ${data.message}`);
                    this.showModalAlert('Ошибка', data.message, async () => {
                        await this.leaveRoom();
                        this.renderMenu();
                    });
                } else if (data.type === 'ROOM_CLOSED') {
                    this.addSyncLog('Комната была закрыта создателем');
                    this.showModalAlert('Комната закрыта', '🛑 Комната была закрыта создателем', async () => {
                        await this.leaveRoom();
                        this.renderMenu();
                    });
                }
            } catch (err) {}
        };

        dc.onclose = () => {
            this.addSyncLog('DataChannel закрыт (потеря связи с хостом)');
            this.showModalAlert('Разрыв связи', '🛑 Соединение с хостом потеряно', async () => {
                await this.leaveRoom();
                this.renderMenu();
            });
        };

        let answered = false;
        this.listenSignal(cleanCode, async (msg) => {
            if (msg.type === 'ANSWER' && msg.playerId === this.playerId) {
                if (pc.signalingState === 'have-local-offer') {
                    answered = true;
                    this.addSyncLog('Получен ANSWER от хоста, применяем RemoteDescription...');
                    await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
                }
            } else if (msg.type === 'ERROR' && msg.playerId === this.playerId) {
                answered = true;
                this.addSyncLog(`Ошибка соединения: ${msg.message}`);
                alert(msg.message);
                this.leaveRoom();
                this.renderMenu();
            }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise(resolve => {
            if (pc.iceGatheringState === 'complete') resolve();
            else {
                const checkState = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); } };
                pc.addEventListener('icegatheringstatechange', checkState);
                setTimeout(() => { pc.removeEventListener('icegatheringstatechange', checkState); resolve(); }, 1500);
            }
        });

        this.addSyncLog('Создан WebRTC Offer, отправка через сигналинг...');
        await this.sendSignal(cleanCode, { type: 'OFFER', playerId: this.playerId, offer: pc.localDescription });

        setTimeout(() => {
            if (!answered && !this.isHost && this.roomId === cleanCode) {
                this.addSyncLog('Таймаут: хост не ответил на подключение');
                this.showModalAlert('Ошибка подключения', 'Комната не найдена или хост не в сети!', async () => {
                    await this.leaveRoom();
                    this.renderMenu();
                });
            }
        }, 8000);
    }

    broadcastRoomData() {
        if (!this.roomId || !this.roomData || !this.isHost) return;
        const msg = JSON.stringify({ type: 'ROOM_STATE', data: this.roomData });
        this.connections.forEach(c => {
            if (c.dc.readyState === 'open') {
                c.dc.send(msg);
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
            this.renderMultiplayerGameOver();
            return;
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
                    <h2 class="hl-app-title">Лобби Комнаты</h2>
                </div>
                <button class="hl-close-btn" id="hlCloseBtn">&times;</button>
            </div>

            <div class="hl-card">
                <div class="hl-menu-container">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <span class="hl-room-badge">
                            Код комнаты: <strong style="color: #fff; font-size: 1.2rem; letter-spacing: 2px;">${this.roomId}</strong>
                        </span>
                        <span class="hl-cat-badge">
                            ${this.roomData.category === 'characters' ? `${icon('user', { size: 14 })} Только Персонажи` : `${icon('sparkles', { size: 14 })} Все Теги`}
                        </span>
                        ${this.roomData.noAi ? `<span class="hl-cat-badge" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.35); color: #fbbf24; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">${icon('noAi', { size: 12 })} Без ИИ</span>` : ''}
                        <button class="hl-btn-secondary" id="hlCopyCodeBtn" style="padding: 6px 14px; font-size: 0.85rem; min-width: auto; gap: 6px;">
                            ${icon('clipboard', { size: 14 })} Скопировать
                        </button>
                    </div>

                    <div class="hl-leaderboard" style="max-width: 480px;">
                        <div style="font-size: 0.9rem; font-weight: 700; color: rgba(255,255,255,0.7); text-align: left; margin-bottom: 4px;">
                            Участники (${players.length}/${this.roomData.maxPlayers}):
                        </div>
                        ${players.map(p => `
                            <div class="hl-player-row">
                                <div class="hl-player-name">
                                    ${p.isHost ? icon('crown', { size: 16, className: 'hl-host-crown' }) : icon('user', { size: 16 })} ${this.escapeHtml(p.name)}
                                    ${p.id === this.playerId ? ' <small style="color: #a78bfa;">(Вы)</small>' : ''}
                                </div>
                                <div class="hl-player-status hl-status-done">Готов</div>
                            </div>
                        `).join('')}
                    </div>

                    ${isHost ? `
                        <button class="hl-btn-primary" id="hlStartMultiplayerGameBtn" style="width: 100%; max-width: 480px;">
                            ${icon('play', { size: 16 })} Начать Игру
                        </button>
                    ` : `
                        <div style="color: #c4b5fd; font-size: 0.95rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            ${icon('hourglass', { size: 16 })} Ожидание запуска игры создателем комнаты...
                        </div>
                    `}

                    <button class="hl-btn-secondary" id="hlLeaveRoomBtn" style="min-width: 140px; padding: 10px 16px;">
                        Выйти из комнаты
                    </button>
                </div>
            </div>
        `;

        document.getElementById('hlCloseBtn').addEventListener('click', () => this.close());
        document.getElementById('hlLeaveRoomBtn').addEventListener('click', async () => {
            await this.leaveRoom();
            this.renderMenu();
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
                        <small style="font-size: 0.85rem; color: #a78bfa; font-weight: 600;">(Цель: ${this.roomData.targetScore} очков)</small>
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
                                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mb-4"></div>
                                    <div style="font-size: 0.95rem; color: rgba(255,255,255,0.7); font-weight: 500;">Загрузка тега...</div>
                                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 4px;">подсчет постов и поиск арта</div>
                                </div>
                            ` : `
                                ${leftImg ? `<img src="${leftImg}" class="hl-card-bg" alt="" loading="lazy">` : ''}
                                <div class="hl-card-overlay"></div>
                                <div class="hl-card-content">
                                    <span class="hl-tag-badge">Известный Тег</span>
                                    ${leftImg ? `
                                        <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                            <img src="${leftImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                            <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                        </div>
                                    ` : ''}
                                    <div class="hl-tag-name">${this.formatTagName(leftTag.name)}</div>
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
                                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-500 mb-4"></div>
                                    <div style="font-size: 0.95rem; color: rgba(255,255,255,0.7); font-weight: 500;">Загрузка тега...</div>
                                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 4px;">подсчет постов и поиск арта</div>
                                </div>
                            ` : `
                                ${rightImg ? `<img src="${rightImg}" class="hl-card-bg" alt="" loading="lazy">` : ''}
                                <div class="hl-card-overlay"></div>
                                <div class="hl-card-content">
                                    ${isRevealed ? `
                                        <span class="hl-tag-badge" style="background: ${myResult === 'correct' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; color: #fff; display: inline-flex; align-items: center; gap: 4px;">
                                            ${myResult === 'correct' ? `${icon('check', { size: 16 })} ВЫ УГАДАЛИ! (+1)` : `${icon('x', { size: 16 })} ВЫ НЕ УГАДАЛИ`}
                                        </span>
                                        ${rightImg ? `
                                            <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                                <img src="${rightImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                                <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                            </div>
                                        ` : ''}
                                        <div class="hl-tag-name">${this.formatTagName(rightTag.name)}</div>
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
                                        <span class="hl-tag-badge" style="background: rgba(167, 139, 250, 0.2); border-color: rgba(167, 139, 250, 0.4); color: #c4b5fd;">Целевой Тег</span>
                                        ${rightImg ? `
                                            <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                                <img src="${rightImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                                <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                            </div>
                                        ` : ''}
                                        <div class="hl-tag-name">${this.formatTagName(rightTag.name)}</div>
                                        <div style="color: #6ee7b7; font-weight: 800; font-size: 1.05rem; margin: 16px 0; background: rgba(16, 185, 129, 0.2); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.3); display: inline-flex; align-items: center; gap: 6px;">
                                            ${icon('check', { size: 18 })} Выбор принят: ${myChoice === 'higher' ? 'БОЛЬШЕ' : 'МЕНЬШЕ'}
                                        </div>
                                        <div class="hl-tag-sub">Ожидаем ответы остальных участников...</div>
                                    ` : `
                                        <span class="hl-tag-badge" style="background: rgba(244, 63, 94, 0.2); border-color: rgba(244, 63, 94, 0.4); color: #fca5a5;">Целевой Тег</span>
                                        ${rightImg ? `
                                            <div class="hl-tag-img-container" title="Нажмите, чтобы открыть на весь экран">
                                                <img src="${rightImg}" class="hl-tag-thumb" alt="" loading="lazy">
                                                <div class="hl-img-zoom-hint">${icon('search', { size: 12 })} На весь экран</div>
                                            </div>
                                        ` : ''}
                                        <div class="hl-tag-name">${this.formatTagName(rightTag.name)}</div>
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
                        <div style="background: rgba(167, 139, 250, 0.15); border: 1px solid rgba(167, 139, 250, 0.3); color: #c4b5fd; padding: 10px 16px; border-radius: 12px; font-weight: 600; font-size: 0.9rem; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
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
        this.attachLightboxListeners();

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
            } else if (this.hostConn && this.hostConn.readyState === 'open') {
                console.log(`>>> DEBUG: [Client] Sending ANSWER ${choice} to host`);
                this.hostConn.send(JSON.stringify({
                    type: 'ANSWER',
                    playerId: this.playerId,
                    choice: choice
                }));
            } else {
                console.warn('>>> DEBUG: [Client] Cannot send answer, hostConn is not open:', this.hostConn?.readyState);
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
                const roomCat = this.roomData.category || 'all';
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
    attachLightboxListeners() {
        const containers = this.container.querySelectorAll('.hl-tag-img-container');
        containers.forEach(box => {
            const img = box.querySelector('img');
            if (img && img.src) {
                box.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openImageLightbox(img.src);
                });
            }
        });
    }

    openImageLightbox(src) {
        if (!src) return;
        const lightbox = document.createElement('div');
        lightbox.className = 'hl-lightbox';
        lightbox.innerHTML = `<img src="${src}" class="hl-lightbox-img" alt="Превью арта">`;
        lightbox.addEventListener('click', () => lightbox.remove());
        document.body.appendChild(lightbox);
    }

    formatTagName(tag) {
        return tag.replace(/_/g, ' ');
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
