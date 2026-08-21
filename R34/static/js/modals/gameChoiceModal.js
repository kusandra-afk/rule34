/**
 * Game Choice Modal & Metered.ca API Key configuration
 */

import { icon } from '../icons.js';

export function openGameChoiceModal(onStartPuzzle) {
    const existing = document.getElementById('game-choice-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'game-choice-modal';
    modal.className = 'game-choice-modal-overlay';

    const modalContent = document.createElement('div');
    modalContent.className = 'game-choice-modal-content';

    modalContent.innerHTML = `
        <button id="closeGameChoiceBtn" class="game-choice-close-btn">&times;</button>
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🎮</div>
        <h2 class="game-choice-title">Выбор Игры</h2>
        <p class="game-choice-subtitle">Выберите во что хотите сыграть:</p>
        
        <div class="custom-scroll game-choice-scroll">
            
            <!-- Доступно сейчас -->
            <div class="game-choice-section-title">Доступно сейчас</div>
            
            <!-- API KEY SECTION (Metered.ca) -->
            <div class="game-choice-api-box">
                <div id="gameKeyInstructionsBtn" class="game-choice-inst-btn">
                    <div class="game-choice-inst-icon">!</div>
                    <div class="game-choice-inst-info">
                        <div class="game-choice-inst-tag">Обязательно для онлайн-игр</div>
                        <div class="game-choice-inst-link">Как получить ключ Metered.ca?</div>
                    </div>
                    ${icon('chevronRight', { size: 20, color: '#f59e0b' })}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <input type="text" id="gameMeteredKeyInput" class="game-choice-input" placeholder="имяПриложения.apiKey" autocomplete="off" spellcheck="false">
                    <button id="gameCheckMeteredKeyBtn" class="game-choice-check-btn">Проверить и сохранить ключ</button>
                </div>
            </div>

            <button id="selectPuzzleBtn" class="game-choice-btn">
                <span class="game-choice-btn-icon">🧩</span>
                <div style="text-align: left;">
                    <div class="game-choice-btn-text">Пазл</div>
                    <div class="game-choice-btn-sub">Соберите картинку из элементов</div>
                </div>
            </button>

            <button id="selectGuessBtn" class="game-choice-btn">
                <span class="game-choice-btn-icon">⚖️</span>
                <div style="text-align: left;">
                    <div class="game-choice-btn-text">Больше / Меньше <span style="font-size: 0.65em; background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; padding: 2px 8px; border-radius: 8px; font-weight: 800; vertical-align: middle; margin-left: 4px;">В разработке</span></div>
                    <div class="game-choice-btn-sub">Угадай, у какого персонажа больше постов</div>
                </div>
            </button>

            <!-- Другие игры -->
            <div class="game-choice-section-title muted">Новые игры (планируется)</div>

            <button disabled class="game-choice-btn-disabled">
                <span class="game-choice-btn-icon disabled">❓</span>
                <div style="text-align: left;">
                    <div class="game-choice-btn-text game-choice-btn-text-muted">Угадай тег / Персонажа</div>
                    <div class="game-choice-btn-sub">Викторина на знание тегов наперегонки</div>
                </div>
            </button>

            <button disabled class="game-choice-btn-disabled">
                <span class="game-choice-btn-icon disabled">🔍</span>
                <div style="text-align: left;">
                    <div class="game-choice-btn-text game-choice-btn-text-muted">Детектив: Найди фрагмент</div>
                    <div class="game-choice-btn-sub">Игра на внимательность наперегонки</div>
                </div>
            </button>

            <button disabled class="game-choice-btn-disabled">
                <span class="game-choice-btn-icon disabled">🎴</span>
                <div style="text-align: left;">
                    <div class="game-choice-btn-text game-choice-btn-text-muted">Рейтинг / Драфт артов</div>
                    <div class="game-choice-btn-sub">Совместный выбор лучших артов</div>
                </div>
            </button>

        </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease-out';
        modalContent.style.animation = 'slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('#closeGameChoiceBtn').onclick = closeModal;
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    modal.querySelector('#selectPuzzleBtn').onclick = () => {
        closeModal();
        if (typeof onStartPuzzle === 'function') {
            onStartPuzzle();
        } else if (typeof window.startPuzzleGame === 'function') {
            window.startPuzzleGame();
        } else if (typeof window.openPuzzleMenu === 'function') {
            window.openPuzzleMenu();
        } else {
            console.error('[GameChoiceModal] Puzzle launcher function not found on window.');
        }
    };

    modal.querySelector('#selectGuessBtn').onclick = () => {
        closeModal();
        if (typeof window.startGuessGame === 'function') {
            window.startGuessGame();
        } else {
            console.error('[GameChoiceModal] Guess game launcher function not found on window.');
        }
    };

    // --- Metered.ca Key Logic ---
    const keyInput = modal.querySelector('#gameMeteredKeyInput');
    const checkBtn = modal.querySelector('#gameCheckMeteredKeyBtn');
    const instrBtn = modal.querySelector('#gameKeyInstructionsBtn');

    keyInput.value = localStorage.getItem('gameMeteredKey') || localStorage.getItem('hlMeteredKey') || '';

    instrBtn.onclick = () => {
        const overlay = document.createElement('div');
        overlay.className = 'instr-modal-overlay';
        overlay.innerHTML = `
            <div class="instr-modal-box">
                <div class="instr-modal-header">
                    <div class="instr-modal-header-left">
                        <div class="instr-modal-icon">!</div>
                        <h2 class="instr-modal-title">Инструкция (API Ключ)</h2>
                    </div>
                    <button id="closeInstrBtn" class="instr-modal-close">&times;</button>
                </div>
                
                <div class="instr-modal-body custom-scroll">
                    <p class="instr-modal-body-p">Для работы мультиплеера необходимо выполнить следующие шаги:</p>
                    
                    <div class="instr-modal-steps-box">
                        <ol class="instr-modal-ol">
                            <li class="instr-modal-li">
                                <b>Регистрация:</b> Перейдите по ссылке <a href="https://dashboard.metered.ca/signup?tool=turnserver" target="_blank" class="instr-modal-link">dashboard.metered.ca/signup?tool=turnserver</a> — это регистрация именно в TURN-сервере (не в чате). Введите ник, почту и пароль, остальное заполнять <b>не обязательно</b>.
                            </li>
                            <li class="instr-modal-li">
                                <b>TURN Credentials:</b> В личном кабинете откройте раздел <b>TURN Credentials</b> и нажмите <b>Add Credential</b> — появится строка с готовыми <b>Username</b> и <b>Password</b>.
                            </li>
                            <li class="instr-modal-li">
                                <b>Запуск игры:</b> В поле ввода на главном экране игры вставляйте <b>Username</b>, точку, и сразу за ней <b>Password</b> без пробелов — например <code class="instr-modal-code">865d628f128429b0eef16fe6.ZIkbOwetcPHjrqR4</code>. Нажимайте <b>Проверить</b>, и если пишет, что ключ верный — можете начинать играть!
                            </li>
                        </ol>
                    </div>

                    <div class="instr-modal-warning">
                        <p class="instr-modal-warning-p">💡 <b>Важное упоминание:</b> У каждого игрока в идеале должен быть зарегистрирован свой ключ, но можно сделать и так, что кто-то один создаст его и просто даст код ключа остальным игрокам — он будет работать у всех! Бесплатного тарифа (20 ГБ TURN-трафика в месяц) с запасом хватает для игры с друзьями.</p>
                    </div>

                    <div class="instr-modal-footer-note">
                        ${icon('lightbulb', { size: 14 })}
                        <span>Ключ сохраняется в памяти вашего браузера, поэтому вводить его повторно при следующем заходе не потребуется.</span>
                    </div>
                </div>

                <div class="instr-modal-footer">
                    <button id="okInstrBtn" class="instr-modal-ok-btn">Понятно</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.style.opacity = '1', 10);
        
        const closeOverlay = () => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        };
        overlay.querySelector('#closeInstrBtn').onclick = closeOverlay;
        const okBtn = overlay.querySelector('#okInstrBtn');
        if (okBtn) okBtn.onclick = closeOverlay;
        overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };
    };

    checkBtn.onclick = async () => {
        const key = keyInput.value.trim();
        if (!key) return;

        if (/^[0-9a-fA-F]{32,120}$/.test(key)) {
            alert('⚠️ Вы вставили API-ключ от Rule34! Требуется пара Username.Password из Metered TURN Credentials.');
            return;
        }

        const dotIdx = key.indexOf('.');
        if (dotIdx === -1 || dotIdx === 0 || dotIdx === key.length - 1) {
            alert('⚠️ Неверный формат. Нужно "Username.Password" — из таблицы TURN Credentials, через точку, без пробелов.');
            return;
        }

        const username = key.slice(0, dotIdx);
        const credential = key.slice(dotIdx + 1);

        const originalText = checkBtn.textContent;
        checkBtn.textContent = 'Проверка...';
        checkBtn.disabled = true;

        // Настоящей REST-проверки для статичной пары username/credential нет —
        // проверяем по-честному: пробуем реально собрать ICE-кандидат типа
        // "relay" через TURN с этими данными (если сервер их не принял,
        // relay-кандидат просто не появится).
        try {
            const ok = await new Promise((resolve) => {
                const pc = new RTCPeerConnection({
                    iceServers: [{ urls: 'turn:global.relay.metered.ca:80', username, credential }]
                });
                let done = false;
                const finish = (result) => {
                    if (done) return;
                    done = true;
                    try { pc.close(); } catch (e) {}
                    resolve(result);
                };
                pc.onicecandidate = (e) => {
                    if (e.candidate && e.candidate.type === 'relay') finish(true);
                };
                pc.createDataChannel('test');
                pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => finish(false));
                setTimeout(() => finish(false), 7000);
            });

            if (ok) {
                localStorage.setItem('gameMeteredKey', key);
                localStorage.setItem('hlMeteredKey', key);
                checkBtn.textContent = '✅ Сохранено!';
                checkBtn.style.background = '#10b981';
                setTimeout(() => {
                    checkBtn.textContent = originalText;
                    checkBtn.style.background = '';
                    checkBtn.disabled = false;
                }, 3000);
            } else {
                checkBtn.disabled = false;
                checkBtn.textContent = originalText;
                alert('❌ Не удалось получить TURN-соединение с этими данными. Проверьте Username/Password в TURN Credentials.');
            }
        } catch (e) {
            checkBtn.disabled = false;
            checkBtn.textContent = originalText;
            alert('❌ Не удалось подключиться к Metered.ca. Проверьте интернет-соединение.');
        }
    };
}
