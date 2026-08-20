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
                    <input type="text" id="gameMeteredKeyInput" class="game-choice-input" placeholder="Вставьте ваш API Key (pk_live_...)" autocomplete="off" spellcheck="false">
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
                <span class="game-choice-btn-icon disabled">⚖️</span>
                <div style="text-align: left;">
                    <div class="game-choice-btn-text game-choice-btn-text-muted">Больше / Меньше</div>
                    <div class="game-choice-btn-sub">Классическая игра на сравнение популярности тегов</div>
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
                                <b>Регистрация:</b> Перейдите на сайт в окно регистрации по ссылке <a href="https://dashboard.metered.ca/signup" target="_blank" class="instr-modal-link">dashboard.metered.ca/signup</a>. Введите ник, почту и пароль, остальное заполнять <b>не обязательно</b>.
                            </li>
                            <li class="instr-modal-li">
                                <b>Создание приложения:</b> Далее вас попросит создать новое приложение. В поле ввода домена (Domain) вводите <b>что угодно</b> (любое слово на английском) и нажимайте <b>Create App</b>.
                            </li>
                            <li class="instr-modal-li">
                                <b>Активация чата:</b> После этого на левой панели найдите вкладку <b>Realtime Messaging</b> и перейдите в неё. Там выберите пункт <b>Real-time chat</b> и нажмите кнопку <b>Enable Realtime Messaging</b>.
                            </li>
                            <li class="instr-modal-li">
                                <b>Генерация ключа:</b> После этого нажмите на правую кнопку <b>Create key</b>. В открывшемся окне в поле <b>Key type</b> обязательно выберите <b>Publishable key</b>, затем промотайте в самый низ и нажмите кнопку <b>Create key</b>.
                            </li>
                            <li class="instr-modal-li">
                                <b>Копирование:</b> После этого копируйте полученный <b>API Key</b> (он выглядит как <code class="instr-modal-code">pk_live_..........</code>).
                            </li>
                            <li class="instr-modal-li">
                                <b>Запуск игры:</b> Вставляйте этот ключ в поле ввода на главном экране игры, нажимайте <b>Проверить</b>, и если пишет, что ключ верный — можете начинать играть!
                            </li>
                        </ol>
                    </div>

                    <div class="instr-modal-warning">
                        <p class="instr-modal-warning-p">💡 <b>Важное упоминание:</b> У каждого игрока в идеале должен быть зарегистрирован свой ключ, но можно сделать и так, что кто-то один создаст его и просто даст код ключа остальным игрокам — он будет работать у всех!</p>
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
            alert('⚠️ Вы вставили API-ключ от Rule34! Требуется ключ Metered.ca (нач. на "pk_live_").');
            return;
        }

        if (!key.startsWith('pk_') && !key.startsWith('sk_')) {
            alert('⚠️ Введённый ключ не похож на ключ Metered.ca.');
            return;
        }

        const originalText = checkBtn.textContent;
        checkBtn.textContent = 'Проверка...';
        checkBtn.disabled = true;

        try {
            const ws = new WebSocket(`wss://rms.metered.ca/v1?key=${key}`);
            let success = false;
            ws.onopen = () => {
                success = true;
                ws.close();
                localStorage.setItem('gameMeteredKey', key);
                localStorage.setItem('hlMeteredKey', key);
                checkBtn.textContent = '✅ Сохранено!';
                checkBtn.style.background = '#10b981';
                setTimeout(() => {
                    checkBtn.textContent = originalText;
                    checkBtn.style.background = '';
                    checkBtn.disabled = false;
                }, 3000);
            };
            ws.onerror = () => {
                if (success) return;
                checkBtn.disabled = false;
                checkBtn.textContent = originalText;
                alert('❌ Ошибка: Не удалось подключиться. Проверьте правильность ключа.');
            };
            setTimeout(() => {
                if (!success && checkBtn.disabled) {
                    checkBtn.disabled = false;
                    checkBtn.textContent = originalText;
                }
            }, 7000);
        } catch (e) {
            checkBtn.disabled = false;
            checkBtn.textContent = originalText;
        }
    };
}
