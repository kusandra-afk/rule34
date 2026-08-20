/**
 * Tutorial / Onboarding Modal controller
 */

export function checkAndRemoveModalOpenClass() {
    const activeModal = document.querySelector('#settings-modal.open, #tutorial-modal.open, .puzzle-overlay, .puzzle-completed-modal, .puzzle-stats-modal, .tag-modal[style*="display: flex"], .tag-modal[style*="display:flex"]');
    if (!activeModal) {
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
    }
}

export function initTutorialModal() {
    const tutorialModal = document.getElementById('tutorial-modal');
    const openTutorialBtn = document.getElementById('openTutorialBtn');
    const tutorialCloseBtn = document.getElementById('tutorial-close-btn');
    const tutorialGotItBtn = document.getElementById('tutorialGotItBtn');

    function showTutorial() {
        if (tutorialModal) {
            document.body.classList.add('modal-open');
            document.documentElement.classList.add('modal-open');
            tutorialModal.classList.add('open');
        }
    }

    function closeTutorial() {
        if (tutorialModal) {
            tutorialModal.classList.remove('open');
            localStorage.setItem('r34_onboarding_shown', 'true');
            checkAndRemoveModalOpenClass();
        }
    }

    if (openTutorialBtn) openTutorialBtn.addEventListener('click', showTutorial);
    if (tutorialCloseBtn) tutorialCloseBtn.addEventListener('click', closeTutorial);
    if (tutorialGotItBtn) tutorialGotItBtn.addEventListener('click', closeTutorial);

    if (tutorialModal) {
        tutorialModal.addEventListener('click', (e) => {
            if (e.target === tutorialModal) {
                closeTutorial();
            }
        });
    }

    // Auto-show on first visit
    if (localStorage.getItem('r34_onboarding_shown') !== 'true') {
        setTimeout(() => {
            showTutorial();
        }, 500);
    }

    return { showTutorial, closeTutorial };
}
