import { SafeScreen } from '../components/safeScreen.js';

export function initSafeScreen() {
    window.safeScreen = new SafeScreen();

    const safeScreenTestBtn = document.getElementById('safeScreenTestBtn');
    const safeScreenUploadBtn = document.getElementById('safeScreenUploadBtn');
    const safeScreenFileInput = document.getElementById('safeScreenFileInput');
    const safeScreenUploadStatus = document.getElementById('safeScreenUploadStatus');
    const safeScreenHotkeyDisplay = document.getElementById('safeScreenHotkeyDisplay');
    const safeScreenChangeHotkeyBtn = document.getElementById('safeScreenChangeHotkeyBtn');
    const safeScreenFileList = document.getElementById('safeScreenFileList');

    const checkMobileSafeScreen = () => {
        const safeBlock = document.getElementById('safeScreenSettingsBlock');
        if (!safeBlock) return;
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || ('ontouchstart' in window && window.innerWidth <= 900)
            || window.innerWidth <= 768;
        if (isMobile) {
            safeBlock.classList.add('mobile-disabled');
        } else {
            safeBlock.classList.remove('mobile-disabled');
        }
    };
    checkMobileSafeScreen();
    window.addEventListener('resize', checkMobileSafeScreen);

    if (safeScreenHotkeyDisplay) {
        safeScreenHotkeyDisplay.textContent = window.safeScreen.formatHotkey();
    }

    if (safeScreenChangeHotkeyBtn) {
        safeScreenChangeHotkeyBtn.onclick = () => {
            window.safeScreen.startHotkeyRecording(safeScreenChangeHotkeyBtn, safeScreenHotkeyDisplay);
        };
    }

    if (safeScreenFileList) {
        window.safeScreen.renderFileListContainer(safeScreenFileList);
    }

    if (safeScreenTestBtn) {
        safeScreenTestBtn.onclick = () => {
            window.safeScreen.trigger();
        };
    }

    if (safeScreenUploadBtn && safeScreenFileInput) {
        safeScreenUploadBtn.onclick = () => {
            safeScreenFileInput.click();
        };

        safeScreenFileInput.onchange = async () => {
            if (safeScreenFileInput.files && safeScreenFileInput.files.length > 0) {
                if (safeScreenUploadStatus) {
                    safeScreenUploadStatus.style.color = '#ff8a00';
                    safeScreenUploadStatus.textContent = 'Загрузка...';
                }
                const count = await window.safeScreen.uploadFiles(safeScreenFileInput);
                if (safeScreenUploadStatus) {
                    safeScreenUploadStatus.style.color = '#2ecc71';
                    safeScreenUploadStatus.textContent = `Загружено: ${count}`;
                    setTimeout(() => {
                        safeScreenUploadStatus.textContent = '';
                    }, 4000);
                }
                safeScreenFileInput.value = '';
                if (safeScreenFileList) {
                    window.safeScreen.renderFileListContainer(safeScreenFileList);
                }
            }
        };
    }
}
