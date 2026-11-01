// ============================================================
// RIPPLE EFFECT — Material Design стиль клика
// Добавляет волновой эффект при нажатии на кнопки и карточки
// ============================================================

export class RippleEffect {
  static init() {
    // Инициализация ripple для всех кнопок
    const rippleTargets = document.querySelectorAll(
      '.r34-btn-primary, .r34-btn-secondary, .r34-btn-danger, ' +
      '.modal-btn, .keep-btn, .confirm-btn, .app-mode-btn, ' +
      '.settings-tab-btn, .duration-preset-btn, .r34-search-arrow-btn, ' +
      '.r34-tag-mode-btn, .r34-settings-btn, .video-btn, .sound-btn, ' +
      '.like-btn, .fullscreen-btn, .scroll-to-top-btn'
    );

    rippleTargets.forEach(el => {
      el.classList.add('ripple-container');
      el.addEventListener('click', (e) => RippleEffect.createRipple(e, el));
    });
  }

  static createRipple(event, element) {
    // Удаляем старые ripple эффекты
    const oldRipples = element.querySelectorAll('.ripple-effect');
    oldRipples.forEach(r => r.remove());

    const ripple = document.createElement('span');
    ripple.classList.add('ripple-effect');

    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;

    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

    element.appendChild(ripple);

    // Удаляем после анимации
    ripple.addEventListener('animationend', () => {
      ripple.remove();
    });

    // Fallback на таймаут
    setTimeout(() => {
      if (ripple.parentNode) ripple.remove();
    }, 700);
  }
}

// ============================================================
// SCROLL TO TOP — Плавная кнопка возврата наверх
// ============================================================

export class ScrollToTop {
  static btn = null;
  static visible = false;

  static init() {
    // Создаём кнопку если её нет
    if (!document.querySelector('.scroll-to-top-btn')) {
      this.btn = document.createElement('button');
      this.btn.className = 'scroll-to-top-btn hidden';
      this.btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
      this.btn.title = 'Наверх';
      document.body.appendChild(this.btn);

      this.btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } else {
      this.btn = document.querySelector('.scroll-to-top-btn');
    }

    // Слушаем скролл с debounce
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          this.updateVisibility();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    this.updateVisibility();
  }

  static updateVisibility() {
    const scrollY = window.scrollY || window.pageYOffset;
    if (scrollY > 400 && !this.visible) {
      this.visible = true;
      this.btn?.classList.remove('hidden');
    } else if (scrollY <= 400 && this.visible) {
      this.visible = false;
      this.btn?.classList.add('hidden');
    }
  }
}

// ============================================================
// SMOOTH ENTRANCE — Анимация появления элементов при скролле
// ============================================================

export class SmoothEntrance {
  static observer = null;

  static init() {
    // Проверяем prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('entrance-visible');
          this.observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '50px'
    });

    // Наблюдаем за карточками и элементами
    const targets = document.querySelectorAll('.media-container, .tag, .suggestion-item');
    targets.forEach(el => this.observer.observe(el));
  }
}

// ============================================================
// TAG ANIMATIONS — Плавное появление/исчезновение тегов
// ============================================================

export class TagAnimations {
  static init() {
    // Наблюдаем за изменениями в active-tags контейнере
    const activeTags = document.getElementById('activeTags');
    if (!activeTags) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList?.contains('tag')) {
            // Новый тег — анимация появления
            node.style.animation = 'none';
            node.offsetHeight; // trigger reflow
            node.style.animation = '';
          }
        });

        mutation.removedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList?.contains('tag')) {
            // Удаляемый тег — анимация исчезновения
            node.style.transition = 'all 0.2s ease';
            node.style.opacity = '0';
            node.style.transform = 'scale(0.5)';
            setTimeout(() => node.remove(), 200);
          }
        });
      });
    });

    observer.observe(activeTags, { childList: true });
  }
}

// ============================================================
// INIT — Запуск всех эффектов
// ============================================================

export function initEffects() {
  RippleEffect.init();
  ScrollToTop.init();
  
  // SmoothEntrance инициализируется после загрузки контента
  setTimeout(() => SmoothEntrance.init(), 500);
  
  TagAnimations.init();
}
