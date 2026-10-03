/**
 * Tutorial / Onboarding Modal controller
 */

export function checkAndRemoveModalOpenClass() {
    const activeModal = document.querySelector('#settings-modal.open, #tutorial-modal.open, .puzzle-overlay, .puzzle-completed-modal, .puzzle-stats-modal');
    if (!activeModal) {
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
    }
}

export function initTutorialModal() {
    const tutorialModal = document.getElementById('tutorial-modal');
    const openTutorialBtn = document.getElementById('openTutorialBtn');
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
