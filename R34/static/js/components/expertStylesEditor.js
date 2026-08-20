/**
 * Expert CSS Variables Editor & Adaptive Contrast Engine
 */

import { icon } from '../icons.js';

// Helper to parse any CSS color (HEX, RGB, HSL, var(...), named, gradients)
export function parseColor(colorStr) {
    if (!colorStr) return { r: 12, g: 13, b: 18, a: 1 };
    colorStr = String(colorStr).trim();

    // Resolve CSS vars var(--name, fallback) up to 5 levels deep
    let depth = 0;
    while (colorStr.includes('var(') && depth < 5) {
        colorStr = colorStr.replace(/var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (match, vName, fallback) => {
            const val = getComputedStyle(document.documentElement).getPropertyValue(vName).trim();
            return val || fallback || '';
        });
        depth++;
    }

    // If gradient, take the last color
    if (colorStr.includes('gradient')) {
        const matches = colorStr.match(/#(?:[0-9a-fA-F]{3}){1,2}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d\.]+\s*)?\)|hsla?\([^)]+\)/g);
        if (matches && matches.length > 0) {
            colorStr = matches[matches.length - 1];
        } else {
            return { r: 12, g: 13, b: 18, a: 1 };
        }
    }

    // Direct parsing via dummy DOM element
    try {
        const dummy = document.createElement('div');
        dummy.style.color = colorStr;
        document.body.appendChild(dummy);
        const computed = getComputedStyle(dummy).color;
        document.body.removeChild(dummy);

        if (computed) {
            const parts = computed.match(/[\d\.]+/g);
            if (parts && parts.length >= 3) {
                const r = parseFloat(parts[0]);
                const g = parseFloat(parts[1]);
                const b = parseFloat(parts[2]);
                const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
                return { r, g, b, a };
            }
        }
    } catch (e) {
        // fallback
    }

    // Fallback HEX
    if (colorStr.startsWith('#')) {
        const hex = colorStr.replace('#', '');
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: 1
            };
        } else if (hex.length >= 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16),
                a: 1
            };
        }
    }

    return { r: 12, g: 13, b: 18, a: 1 };
}

// Relative luminance (WCAG standard)
export function getLuminance(r, g, b) {
    const a = [r, g, b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Compute contrast for surface
export function getContrastForSurface(surfaceColorStr, baseBgColorStr) {
    const parsedSurface = parseColor(surfaceColorStr);
    let finalR = parsedSurface.r;
    let finalG = parsedSurface.g;
    let finalB = parsedSurface.b;

    if (parsedSurface.a < 0.95) {
        const baseBg = parseColor(baseBgColorStr || '#06070c');
        const a = parsedSurface.a;
        finalR = Math.round(parsedSurface.r * a + baseBg.r * (1 - a));
        finalG = Math.round(parsedSurface.g * a + baseBg.g * (1 - a));
        finalB = Math.round(parsedSurface.b * a + baseBg.b * (1 - a));
    }

    const lum = getLuminance(finalR, finalG, finalB);
    const contrastWithWhite = (1.0 + 0.05) / (lum + 0.05);
    const contrastWithDark = (lum + 0.05) / (0.005 + 0.05);
    const yiq = (finalR * 299 + finalG * 587 + finalB * 114) / 1000;
    const prefersDark = (contrastWithDark > contrastWithWhite) || (yiq >= 130);

    if (prefersDark) {
        return {
            main: '#0a0b10',
            muted: 'rgba(10, 11, 16, 0.72)',
            border: 'rgba(10, 11, 16, 0.18)',
            isLight: true
        };
    } else {
        return {
            main: '#ffffff',
            muted: 'rgba(255, 255, 255, 0.72)',
            border: 'rgba(255, 255, 255, 0.18)',
            isLight: false
        };
    }
}

export function getContrastYIQ(color) {
    const darkBg = getComputedStyle(document.documentElement).getPropertyValue('--dark').trim() || '#06070c';
    return getContrastForSurface(color, darkBg).main;
}

// Recalculate adaptive colors for all interface elements
export function recalculateAllAdaptiveText() {
    const root = document.documentElement;
    const style = getComputedStyle(root);

    const darkVal = style.getPropertyValue('--dark').trim() || '#06070c';
    const bodyBgVal = style.getPropertyValue('--body-bg').trim() || darkVal;
    const accentVal = style.getPropertyValue('--accent').trim() || '#ff3b6b';
    const btnPrimaryBg = style.getPropertyValue('--btn-primary-bg').trim() || accentVal;
    const btnSecondaryBg = style.getPropertyValue('--btn-secondary-bg').trim() || 'rgba(255, 255, 255, 0.08)';
    const modalBgVal = style.getPropertyValue('--modal-bg').trim() || 'rgba(4, 5, 9, 0.72)';
    const tagBgVal = style.getPropertyValue('--tag-bg').trim() || 'rgba(255, 255, 255, 0.05)';
    const suggestionBgVal = style.getPropertyValue('--suggestion-bg').trim() || 'rgba(13, 15, 22, 0.94)';
    const glassBgVal = style.getPropertyValue('--glass-bg').trim() || 'rgba(255, 255, 255, 0.05)';

    // 1. Main page text
    const pageText = getContrastForSurface(bodyBgVal, darkVal);
    root.style.setProperty('--adaptive-text-main', pageText.main);
    root.style.setProperty('--adaptive-text-muted', pageText.muted);

    // 2. Primary buttons
    const primaryBtnText = getContrastForSurface(btnPrimaryBg, darkVal);
    root.style.setProperty('--btn-primary-color', primaryBtnText.main);

    // 3. Secondary buttons
    const secondaryBtnText = getContrastForSurface(btnSecondaryBg, darkVal);
    root.style.setProperty('--btn-secondary-color', secondaryBtnText.main);

    // 4. Media cards
    const cardText = getContrastForSurface(glassBgVal, darkVal);
    root.style.setProperty('--card-text-color', cardText.main);
    root.style.setProperty('--card-text-muted', cardText.muted);

    // 5. Modals
    const modalText = getContrastForSurface(modalBgVal, darkVal);
    root.style.setProperty('--modal-text-color', modalText.main);
    root.style.setProperty('--modal-text-muted', modalText.muted);

    if (modalText.isLight) {
        root.style.setProperty('--modal-control-bg', 'rgba(10, 11, 16, 0.06)');
        root.style.setProperty('--modal-control-border', 'rgba(10, 11, 16, 0.15)');
        root.style.setProperty('--modal-control-hover-bg', 'rgba(10, 11, 16, 0.09)');
        root.style.setProperty('--modal-control-hover-border', 'rgba(10, 11, 16, 0.28)');
        root.style.setProperty('--modal-placeholder-color', 'rgba(10, 11, 16, 0.45)');
        root.style.setProperty('--modal-border', 'rgba(10, 11, 16, 0.12)');
    } else {
        root.style.setProperty('--modal-control-bg', 'rgba(255, 255, 255, 0.055)');
        root.style.setProperty('--modal-control-border', 'rgba(255, 255, 255, 0.12)');
        root.style.setProperty('--modal-control-hover-bg', 'rgba(255, 255, 255, 0.095)');
        root.style.setProperty('--modal-control-hover-border', 'rgba(255, 255, 255, 0.24)');
        root.style.setProperty('--modal-placeholder-color', 'rgba(255, 255, 255, 0.35)');
        root.style.setProperty('--modal-border', 'rgba(255, 255, 255, 0.10)');
    }

    // 6. Tags
    const tagText = getContrastForSurface(tagBgVal, darkVal);
    root.style.setProperty('--tag-text-color', tagText.main);

    // 7. Suggestions dropdown
    const suggestionText = getContrastForSurface(suggestionBgVal, darkVal);
    root.style.setProperty('--suggestion-text-color', suggestionText.main);
}

export const defaultVariables = {
    '--accent': { 
        val: '#ff3b6b', 
        desc: 'Главный акцентный цвет',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Основной акцент сайта</div>Главный цвет интерфейса. Влияет на активные кнопки, обводки элементов, переключатели вкладок и индикаторы.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#ff3b6b</code>, <code>#6366f1</code>, <code>#10b981</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:14px; background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.06); border-radius:8px; display:flex; gap:12px; align-items:center; justify-content:center; flex-wrap:wrap;"><button style="background:var(--accent); color:var(--btn-primary-color, #fff); border:none; padding:8px 20px; border-radius:var(--button-radius, 8px); font-weight:bold; font-size:0.75rem; box-shadow:0 4px 14px var(--accent-glow); cursor:pointer; transition:all 0.3s;" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">Текст адаптируется</button></div>' 
    },
    '--btn-primary-bg': { 
        val: 'var(--accent)', 
        desc: 'Фон главных кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Фон основных кнопок</div>Цвет заливки главных кнопок интерфейса. Может быть цветом или градиентом.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>var(--accent)</code>, <code>#fff</code>, <code>linear-gradient(...)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-primary-bg); color:var(--btn-primary-color, #fff); border:none; padding:10px 24px; border-radius:var(--button-radius, 12px); font-weight:bold; font-size:0.75rem; cursor:pointer; transition:all 0.3s;">Авто-контраст текста</button></div>' 
    },
    '--btn-secondary-bg': { 
        val: 'var(--glass-bg-strong)', 
        desc: 'Фон вторичных кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Фон вторичных кнопок</div>Фоновый цвет для второстепенных кнопок и элементов управления.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>var(--glass-bg-strong)</code>, <code>rgba(255,255,255,0.05)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-secondary-bg); color:var(--btn-secondary-color, var(--light)); border:1px solid var(--glass-border); padding:10px 24px; border-radius:var(--button-radius, 12px); font-weight:bold; font-size:0.75rem; cursor:pointer;">Вторичный текст</button></div>' 
    },
    '--button-radius': { 
        val: '8px', 
        desc: 'Скругление углов кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('roundedCorner', { size: 16 }) + ' Скругление кнопок</div>Радиус скругления углов всех кнопок в приложении.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0px</code> (квадратные), <code>8px</code> (умеренные), <code>24px</code> (круглые)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; display:flex; justify-content:center;"><button style="padding:10px 20px; background:var(--accent); color:#fff; border:none; border-radius:var(--button-radius); font-size:0.7rem; font-weight:bold; transition:border-radius 0.3s;">Кнопка</button></div>' 
    },
    '--input-radius': { 
        val: '8px', 
        desc: 'Скругление полей ввода',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('roundedCorner', { size: 16 }) + ' Скругление инпутов</div>Радиус скругления углов полей поиска и числовых полей в настройках.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0px</code>, <code>8px</code>, <code>12px</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; display:flex; justify-content:center;"><input type="text" placeholder="Поле ввода..." style="padding:8px 12px; background:var(--glass-bg); color:#fff; border:1px solid var(--glass-border); border-radius:var(--input-radius); font-size:0.7rem; outline:none; transition:border-radius 0.3s; width:180px;"></div>' 
    },
    '--transition-speed': { 
        val: '0.2s', 
        desc: 'Общая скорость анимаций',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('zap', { size: 16 }) + ' Скорость анимаций</div>Базовое время всех переходов и плавных изменений в интерфейсе.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0.1s</code> (быстро), <code>0.3s</code> (плавно), <code>0.6s</code> (медленно)<br><br><b>' + icon('eye', { size: 14 }) + ' Тест скорости:</b><br><div style="margin-top:10px; display:flex; justify-content:center;"><button style="padding:8px 20px; background:var(--accent); color:#fff; border:none; border-radius:8px; cursor:pointer; transition:all var(--transition-speed, 0.2s) var(--ease);" onmouseover="this.style.transform=\'scale(1.15)\'; this.style.filter=\'brightness(1.2)\';" onmouseout="this.style.transform=\'scale(1)\'; this.style.filter=\'none\';">Наведи для теста</button></div>' 
    },
    '--accent-alt': { 
        val: '#ff5e8c', 
        desc: 'Дополнительный акцентный цвет (градиенты)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('rainbow', { size: 16 }) + ' Дополнительный акцент (Градиенты)</div>Используется в паре с основным акцентом для плавных градиентов на плашках, кнопках и карточках.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#ff5e8c</code>, <code>#a855f7</code>, <code>#3b82f6</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример градиента:</b><br><div style="margin-top:10px; height:38px; background:linear-gradient(135deg, var(--accent) 0%, var(--accent-alt) 100%); background-size:200% 200%; animation:liveMovingGradient 4s ease infinite; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.75rem; font-weight:bold; letter-spacing:0.5px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">Плавный анимированный градиент</div>' 
    },
    '--accent-glow': { 
        val: 'rgba(255, 59, 107, 0.4)', 
        desc: 'Цвет неонового свечения (тени)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('sparkles', { size: 16 }) + ' Неоновое свечение (Тень)</div>Определяет цвет и прозрачность мягкого неонового ореола вокруг акцентных элементов.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>rgba(255, 59, 107, 0.4)</code>, <code>transparent</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живое мерцающее свечение:</b><br><div style="margin-top:10px; padding:16px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center; border:1px solid rgba(255,255,255,0.05);"><span style="padding:10px 22px; background:var(--accent); color:#fff; border-radius:8px; font-weight:bold; font-size:0.75rem; animation:livePulseGlow 2s infinite ease-in-out;">Живое пульсирующее свечение</span></div>' 
    },
    '--dark': { 
        val: '#0a0b10', 
        desc: 'Тёмный цвет фона карточек и подложек',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('filledSquare', { size: 16 }) + ' Тёмный фон карточек</div>Основной цвет заливки карточек галереи, подложек и контейнеров.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#0a0b10</code> (глубокий), <code>#12131a</code> (графит), <code>#181824</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример подложки:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:var(--light); font-size:0.75rem; text-align:center; box-shadow:0 8px 24px rgba(0,0,0,0.5); transition:background 0.3s;"><div style="font-weight:bold; margin-bottom:4px;">Фон подложки карточки</div><div style="opacity:0.6; font-size:0.7rem;">Заливка адаптируется под тему</div></div>' 
    },
    '--light': { 
        val: '#f6f7fb', 
        desc: 'Светлый цвет текста и иконок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('filledCircle', { size: 16 }) + ' Светлый цвет текста</div>Основной цвет заголовков, основного текста и иконок интерфейса.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#ffffff</code> (белый), <code>#f6f7fb</code> (мягкий), <code>#e2e8f0</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример текста:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08); text-align:center;"><span style="color:var(--light); font-size:0.85rem; font-weight:700; letter-spacing:0.3px; transition:color 0.3s;">Заголовок и основные тексты интерфейса</span></div>' 
    },
    '--body-bg': { 
        val: 'radial-gradient(circle at top center, #1c1828 0%, #0c0d12 100%)', 
        desc: 'Глобальный фон всего сайта',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('galaxy', { size: 16 }) + ' Глобальный фон страницы</div>Заливка главного заднего плана всего сайта. Поддерживает цвета, градиенты и фоновые картинки.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>#0c0d12</code>, <code>radial-gradient(...)</code>, <code>linear-gradient(...)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой мини-экран:</b><br><div style="margin-top:10px; padding:18px; background:var(--body-bg); border:1px solid rgba(255,255,255,0.15); border-radius:10px; text-align:center; color:var(--light); font-size:0.75rem; box-shadow:inset 0 0 20px rgba(0,0,0,0.5); transition:background 0.3s;"><span style="background:rgba(0,0,0,0.5); backdrop-filter:blur(6px); padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); font-weight:bold;">Задний фон страницы</span></div>' 
    },
    '--modal-bg': { 
        val: 'rgba(10, 11, 16, 0.88)', 
        desc: 'Фон раскрывающихся окон (модалки)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('window', { size: 16 }) + ' Фон модальных окон</div>Заливка всплывающих окон (настройки, просмотр полноэкранных постов, профиль).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(10, 11, 16, 0.9)</code>, <code>#0e0f15</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое модальное окно:</b><br><div style="margin-top:10px; padding:18px; background:linear-gradient(135deg, #2b1028, #101c2b); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:40px; height:40px; background:var(--accent); border-radius:50%; top:5px; left:20px; filter:blur(10px); animation:liveOrbs 4s ease-in-out infinite;"></div><div style="position:relative; background:var(--modal-bg); border:1px solid rgba(255,255,255,0.12); padding:12px 16px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; backdrop-filter:blur(8px); box-shadow:0 10px 30px rgba(0,0,0,0.6); transition:background 0.3s;">Всплывающее окно над фоном</div></div>' 
    },
    '--error': { 
        val: '#ff4b4b', 
        desc: 'Цвет ошибок и предупреждений',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ban', { size: 16 }) + ' Цвет ошибок и предупреждений</div>Выделение сообщений об ошибках, сбоях сети и неудачных результатах поиска.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>#ff4b4b</code>, <code>#ef4444</code>, <code>#f43f5e</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой сигнал ошибки:</b><br><div style="margin-top:10px; padding:10px 14px; background:rgba(255,75,75,0.08); border:1px solid rgba(255,75,75,0.3); border-radius:8px; display:flex; align-items:center; gap:8px; color:var(--error); font-size:0.75rem; font-weight:bold; transition:color 0.3s;"><span style="font-size:1rem; animation:pulse 1.5s infinite;">' + icon('warning', { size: 16 }) + '</span> <span>Ошибка: Посты по запросу не найдены</span></div>' 
    },
    '--success': { 
        val: '#30ff97', 
        desc: 'Цвет успешных действий',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('check', { size: 16 }) + ' Цвет успешных действий</div>Используется для подсвечивания активных включающих тегов и успешных операций.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>#30ff97</code>, <code>#10b981</code>, <code>#22c55e</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой успешный статус:</b><br><div style="margin-top:10px; padding:10px 14px; background:rgba(48,255,151,0.08); border:1px solid rgba(48,255,151,0.3); border-radius:8px; display:flex; align-items:center; gap:8px; color:var(--success); font-size:0.75rem; font-weight:bold; transition:color 0.3s;">' + icon('check', { size: 16 }) + ' <span>+ включенный_тег (активно)</span></div>' 
    },
    '--tag-bg': { 
        val: 'rgba(255, 255, 255, 0.04)', 
        desc: 'Фон неактивных тегов (кнопок)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('tag', { size: 16 }) + ' Фон неактивных тегов</div>Цвет плашек тегов в поиске, на карточках галереи и в панели подсказок.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.05)</code>, <code>#1d1f2a</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живые теги:</b><br><div style="margin-top:10px; padding:10px; background:var(--dark); border-radius:8px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;"><span style="background:var(--tag-bg); border:1px solid rgba(255,255,255,0.08); color:var(--light); padding:5px 12px; border-radius:6px; font-size:0.72rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\'" onmouseout="this.style.background=\'var(--tag-bg)\'">#solo</span><span style="background:var(--tag-bg); border:1px solid rgba(255,255,255,0.08); color:var(--light); padding:5px 12px; border-radius:6px; font-size:0.72rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background=\'rgba(255,255,255,0.15)\'" onmouseout="this.style.background=\'var(--tag-bg)\'">#1girl</span></div>' 
    },
    '--suggestion-bg': { 
        val: 'rgba(18, 19, 26, 0.98)', 
        desc: 'Фон списка автодополнения поиска',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('search', { size: 16 }) + ' Выпадающий список поиска</div>Заливка выпадающего меню автодополнения тегов при вводе в поиск.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(18, 19, 26, 0.98)</code>, <code>#12131a</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое выпадающее меню:</b><br><div style="margin-top:10px; background:var(--suggestion-bg); border:1px solid rgba(255,255,255,0.12); padding:8px 12px; border-radius:8px; color:var(--light); font-size:0.72rem; box-shadow:0 8px 20px rgba(0,0,0,0.5); transition:background 0.3s;"><div style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.06); font-weight:bold; color:var(--accent); border-radius:4px; cursor:pointer;">' + icon('search', { size: 14 }) + ' 1girl <span style="opacity:0.5; font-weight:normal;">(1 420 000)</span></div><div style="padding:6px 8px; opacity:0.85; border-radius:4px; cursor:pointer;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'transparent\'">' + icon('search', { size: 14 }) + ' solo <span style="opacity:0.5;">(980 000)</span></div></div>' 
    },
    '--glass': { 
        val: 'rgba(18, 19, 26, 0.5)', 
        desc: 'Фон "стеклянных" элементов (общий)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Эффект матового стекла</div>Используется для стильных полупрозрачных панелей с эффектом размытия фона.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(18, 19, 26, 0.5)</code>, <code>rgba(255, 255, 255, 0.05)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое анимированное стекло:</b><br><div style="margin-top:10px; padding:20px; background:linear-gradient(135deg, #1c1828, #3b1d3d); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:50px; height:50px; background:var(--accent); border-radius:50%; top:10px; left:20px; filter:blur(12px); animation:liveOrbs 3s ease-in-out infinite alternate;"></div><div style="position:relative; background:var(--glass); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.15); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; transition:background 0.3s;">Матовое стекло над движущимся фоном</div></div>' 
    },
    '--glass-bg': { 
        val: 'rgba(255, 255, 255, 0.045)', 
        desc: 'Фон слабых стеклянных элементов',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Слабое стекло (Фон)</div>Слабая заливка для элементов интерфейса, например для кнопок-иконок и полей ввода.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.05)</code>, <code>rgba(0, 0, 0, 0.2)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="background:var(--glass-bg); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок со слабым фоном</div></div>' 
    },
    '--glass-bg-strong': { 
        val: 'rgba(255, 255, 255, 0.08)', 
        desc: 'Фон сильных стеклянных элементов',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Сильное стекло (Фон)</div>Более плотная заливка для вторичных кнопок и активных элементов меню.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.1)</code>, <code>rgba(0, 0, 0, 0.4)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="background:var(--glass-bg-strong); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок с сильным фоном</div></div>' 
    },
    '--glass-border': { 
        val: 'rgba(255, 255, 255, 0.09)', 
        desc: 'Рамка стеклянных элементов (слабая)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Рамка стекла</div>Цвет стандартных рамок для стеклянных карточек, полей ввода и панелей.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.1)</code>, <code>rgba(0, 0, 0, 0.3)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="border:1px solid var(--glass-border); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок со стандартной рамкой</div></div>' 
    },
    '--glass-border-strong': { 
        val: 'rgba(255, 255, 255, 0.18)', 
        desc: 'Рамка стеклянных элементов (сильная)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Выраженная рамка стекла</div>Цвет рамок для более выделяющихся элементов (например, модальных окон).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.2)</code>, <code>rgba(0, 0, 0, 0.5)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px;"><div style="border:1px solid var(--glass-border-strong); padding:12px; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem;">Блок с сильной рамкой</div></div>' 
    },
    '--header-bg': { 
        val: 'rgba(18, 19, 26, 0.45)', 
        desc: 'Фоновый цвет верхней шапки',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('pin', { size: 16 }) + ' Шапка сайта</div>Цвет зафиксированной верхней панели поиска и фильтров.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(18, 19, 26, 0.45)</code>, <code>transparent</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример шапки:</b><br><div style="margin-top:10px; padding:10px 14px; background:var(--header-bg); border:1px solid rgba(255,255,255,0.1); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; transition:background 0.3s;">Закрепленная панель навигации</div>' 
    },
    '--header-backdrop-filter': { 
        val: 'blur(24px) saturate(1.2)', 
        desc: 'Эффект фильтрации под шапкой (размытие)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('swirl', { size: 16 }) + ' Размытие под шапкой</div>Эффект размытия контента, который проплывает под закрепленной шапкой при скролле.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>blur(24px) saturate(1.2)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой движущийся текст под фильтром:</b><br><div style="margin-top:10px; height:50px; position:relative; overflow:hidden; border-radius:8px; background:#08090d; border:1px solid rgba(255,255,255,0.08);"><div style="position:absolute; width:100%; top:0; animation:liveScrollContent 5s linear infinite; display:flex; flex-direction:column; gap:6px; padding:6px; color:var(--accent); font-weight:bold; font-size:0.75rem;"><div>• Карточка с артом #1042</div><div>• Текст запроса "cute cat girl"</div><div>• Карточка с артом #1043</div><div>• Текст запроса "genshin impact"</div></div><div style="position:absolute; inset:0; background:rgba(18, 19, 26, 0.4); backdrop-filter:var(--header-backdrop-filter); -webkit-backdrop-filter:var(--header-backdrop-filter); display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.72rem; font-weight:bold; pointer-events:none; border:1px solid rgba(255,255,255,0.15); border-radius:8px;">Фильтр шапки (Размытие текста снизу)</div></div>' 
    },
    '--media-radius': { 
        val: '20px', 
        desc: 'Скругление углов у карточек и фото',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Скругление карточек и фото</div>Радиус закругления углов у всех обложек, фото и видео в галерее.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0px</code> (квадрат), <code>12px</code> (умеренное), <code>24px</code> (округлое)<br><br><b>' + icon('eye', { size: 16 }) + ' Живой меняющийся угол:</b><br><div style="margin-top:10px; display:flex; justify-content:center; align-items:center;"><div style="width:64px; height:64px; background:linear-gradient(135deg, var(--accent), var(--accent-alt)); border-radius:var(--media-radius); display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.7rem; font-weight:bold; box-shadow:0 4px 16px var(--accent-glow); transition:border-radius 0.3s ease;">Card</div></div>' 
    },
    '--media-gap': { 
        val: '24px', 
        desc: 'Отступы между карточками в галерее',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Отступы между карточками</div>Интервал по горизонтали и вертикали между блоками сетки галереи.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>12px</code> (плотно), <code>24px</code> (базово), <code>36px</code> (просторно)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой интерактивный отступ:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; display:flex; gap:var(--media-gap); justify-content:center; align-items:center; transition:gap 0.3s ease;"><div style="width:30px; height:30px; background:var(--accent); border-radius:6px; flex-shrink:0;"></div><div style="width:30px; height:30px; background:var(--accent); border-radius:6px; flex-shrink:0;"></div><div style="width:30px; height:30px; background:var(--accent); border-radius:6px; flex-shrink:0;"></div></div>' 
    },
    '--grid-col-width': { 
        val: '300px', 
        desc: 'Плотность сетки (минимальная ширина карточки)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Ширина колонок галереи</div>Минимальная ширина карточки. Чем меньше число, тем больше колонок помещается в ряд.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>220px</code> (много мелких), <code>320px</code> (крупные)<br><br><b>' + icon('eye', { size: 16 }) + ' Живая динамическая колонка:</b><br><div style="margin-top:10px; width:var(--grid-col-width); max-width:100%; height:32px; background:linear-gradient(90deg, var(--accent), var(--accent-alt)); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.72rem; font-weight:bold; margin:0 auto; transition:width 0.3s ease; box-shadow:0 4px 12px rgba(0,0,0,0.3);">Ширина колонки</div>' 
    },
    '--site-font': { 
        val: "'Inter', -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif", 
        desc: 'Шрифт для всего сайта',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('type', { size: 16 }) + ' Шрифт интерфейса</div>Системный или кастомный шрифт для всего приложения.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>"Inter", sans-serif</code>, <code>"Courier New", monospace</code>, <code>"Georgia", serif</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой пример шрифта:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08); text-align:center; font-family:var(--site-font); color:var(--light); font-size:0.85rem; font-weight:600; transition:font-family 0.2s;">Быстрый коричневый лис прыгает через ленивую собаку</div>' 
    },
    '--base-font-size': { 
        val: '16px', 
        desc: 'Базовый размер шрифта (масштабирование)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Базовый размер шрифта</div>Масштабирует пропорции текста и интерфейса во всем приложении.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>14px</code> (компактно), <code>16px</code> (стандарт), <code>18px</code> (крупно)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой масштабируемый текст:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08); text-align:center;"><span style="font-size:var(--base-font-size); color:var(--light); font-weight:600; transition:font-size 0.2s;">Динамический базовый текст</span></div>' 
    },
    '--hover-transform': { 
        val: 'translateY(-6px)', 
        desc: 'Анимация карточки при наведении мыши',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('wand', { size: 16 }) + ' Анимация при наведении мыши</div>Трансформация карточки при наведении курсора (подъем вверх, увеличение или поворот).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>translateY(-6px)</code>, <code>scale(1.03)</code>, <code>rotate(2deg)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая трансформация:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border:1px solid var(--accent); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; box-shadow:0 6px 20px rgba(0,0,0,0.4); cursor:pointer; transition:transform 0.3s var(--ease);" onmouseover="this.style.transform=\'var(--hover-transform)\'" onmouseout="this.style.transform=\'none\'">Наведи на меня</div>' 
    },
    '--hover-border-color': { 
        val: 'rgba(255, 59, 107, 0.35)', 
        desc: 'Цвет рамки карточки при наведении',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Цвет рамки при наведении</div>Цвет подсветки границ карточки при подведении курсора.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 59, 107, 0.8)</code>, <code>#ff3b6b</code>, <code>#00f0ff</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая подсветка рамки:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border:2px solid transparent; border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; cursor:pointer; transition:border-color 0.3s ease;" onmouseover="this.style.borderColor=\'var(--hover-border-color)\'" onmouseout="this.style.borderColor=\'transparent\'">Наведи на меня</div>' 
    },
    '--hover-box-shadow': { 
        val: '0 15px 40px rgba(255, 59, 107, 0.15), 0 0 0 1px rgba(255, 59, 107, 0.35)', 
        desc: 'Тень или свечение карточки при наведении',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('box', { size: 16 }) + ' Тень карточки при наведении</div>Объем и свечение тени, отбрасываемой карточкой при наведении.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0 15px 40px rgba(255,59,107,0.3)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая тень карточки:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; cursor:pointer; transition:box-shadow 0.3s ease;" onmouseover="this.style.boxShadow=\'var(--hover-box-shadow)\'" onmouseout="this.style.boxShadow=\'none\'">Наведи на меня</div>' 
    },
    '--container-max-width': { 
        val: '900px', 
        desc: 'Ширина центрального блока поиска',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Ширина поисковой панели</div>Ограничение максимальной ширины блока поиска по центру экрана.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>800px</code>, <code>1000px</code>, <code>100%</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая ширина поиска:</b><br><div style="margin-top:10px; width:100%; display:flex; justify-content:center; padding:6px; background:#08090d; border-radius:8px;"><div style="width:var(--container-max-width); max-width:100%; height:22px; background:var(--accent); border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.65rem; font-weight:bold; transition:width 0.3s ease;">Поисковый блок</div></div>' 
    },
    '--gallery-max-width': { 
        val: '1400px', 
        desc: 'Ширина сетки с картинками',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Максимальная ширина галереи</div>Ограничение растягивания сетки галереи на широкоформатных экранах (4K/QHD).<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>1200px</code>, <code>1600px</code>, <code>100%</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живая ширина сетки:</b><br><div style="margin-top:10px; width:100%; display:flex; justify-content:center; padding:6px; background:#08090d; border-radius:8px;"><div style="width:var(--gallery-max-width); max-width:100%; height:22px; background:linear-gradient(90deg, var(--accent), var(--accent-alt)); border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.65rem; font-weight:bold; transition:width 0.3s ease;">Контейнер галереи</div></div>' 
    },
    '--card-bg-opacity': { 
        val: '0.85', 
        desc: 'Непрозрачность подложки под картинкой',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('eye', { size: 16 }) + ' Непрозрачность карточки</div>Степень прозрачности фона подложки карточек.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0.5</code> (полупрозрачная), <code>1.0</code> (сплошная)<br><br><b>' + icon('eye', { size: 16 }) + ' Живая прозрачность над фоном:</b><br><div style="margin-top:10px; background:repeating-linear-gradient(45deg, #1d1828, #1d1828 10px, #ff3b6b 10px, #ff3b6b 20px); padding:12px; border-radius:8px;"><div style="background: rgb(10 11 16 / var(--card-bg-opacity, 0.85)); padding:12px; border-radius:6px; color:#fff; text-align:center; font-size:0.75rem; font-weight:bold; transition:background 0.3s;">Карточка над контрастным фоном</div></div>' 
    },
    '--card-bg-blur': { 
        val: '0px', 
        desc: 'Эффект размытия фона под карточкой',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('fog', { size: 16 }) + ' Размытие фона под карточкой</div>Матовый эффект размытия (backdrop-filter) под карточкой.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0px</code>, <code>8px</code>, <code>16px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живое размытие фона:</b><br><div style="margin-top:10px; padding:16px; background:linear-gradient(135deg, #2b1028, #101c2b); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:45px; height:45px; background:#ff3b6b; border-radius:50%; top:8px; left:30px;"></div><div style="position:relative; background:rgba(10,11,16,0.45); backdrop-filter:blur(var(--card-bg-blur, 0px)); -webkit-backdrop-filter:blur(var(--card-bg-blur, 0px)); padding:12px; border-radius:8px; color:#fff; text-align:center; font-size:0.75rem; font-weight:bold; border:1px solid rgba(255,255,255,0.15); transition:backdrop-filter 0.3s;">Матовое размытие над фоновым объектом</div></div>' 
    },
    '--card-border-width': { 
        val: '1px', 
        desc: 'Толщина рамки вокруг карточек',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Толщина рамки карточки</div>Толщина контура вокруг карточки в спокойном состоянии.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0px</code> (без рамки), <code>1px</code> (тонкая), <code>2px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой контур:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border:var(--card-border-width) solid var(--accent); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; font-weight:bold; transition:border-width 0.2s;">Карточка с изменяемой толщиной рамки</div>' 
    },
    '--card-border-color': { 
        val: 'rgba(255, 255, 255, 0.06)', 
        desc: 'Цвет рамки вокруг карточек (в покое)',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Цвет рамки карточки</div>Цвет обводки карточек в покое.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255, 255, 255, 0.1)</code>, <code>#333</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой цвет обводки:</b><br><div style="margin-top:10px; padding:12px; background:var(--dark); border:2px solid var(--card-border-color); border-radius:8px; text-align:center; color:var(--light); font-size:0.75rem; transition:border-color 0.3s;">Обводка в спокойном состоянии</div>' 
    },
    '--card-transition-speed': { 
        val: '0.3s', 
        desc: 'Скорость анимаций карточки',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('clock', { size: 16 }) + ' Скорость анимаций карточек</div>Время плавного перехода всех эффектов при наведении и клике.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>0.15s</code> (быстро), <code>0.3s</code> (базово), <code>0.8s</code> (медленно)<br><br><b>' + icon('eye', { size: 16 }) + ' Живой анимированный тестер скорости:</b><br><div style="margin-top:10px; padding:12px; background:#08090d; border-radius:8px; border:1px solid rgba(255,255,255,0.08); overflow:hidden; position:relative; text-align:center;"><div style="display:inline-block; padding:8px 18px; background:var(--accent); color:#fff; border-radius:8px; font-weight:bold; font-size:0.75rem; transition:all var(--card-transition-speed, 0.3s) ease-in-out; cursor:pointer;" onmouseover="this.style.transform=\'scale(1.2)\'" onmouseout="this.style.transform=\'scale(1)\'">Тест плавности (наведите мышь)</div></div>' 
    },
    '--card-tags-display': { 
        val: 'flex', 
        desc: 'Отображение тегов внутри карточек',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('tag', { size: 16 }) + ' Показывать теги на карточках</div>Переключение отображения строчки мини-тегов под карточкой.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>flex</code> (показывать), <code>none</code> (скрыть)<br><br><b>' + icon('eye', { size: 16 }) + ' Живой переключатель тегов:</b><br><div style="margin-top:10px; padding:10px; background:var(--dark); border-radius:8px; border:1px solid rgba(255,255,255,0.08);"><div style="font-size:0.7rem; color:#aaa; margin-bottom:6px; text-align:center;">Миниатюра карточки</div><div style="display:var(--card-tags-display, flex); gap:6px; justify-content:center;"><span style="background:var(--tag-bg); padding:3px 8px; border-radius:4px; font-size:10px; color:#fff; border:1px solid rgba(255,255,255,0.1);">#tag_1</span><span style="background:var(--tag-bg); padding:3px 8px; border-radius:4px; font-size:10px; color:#fff; border:1px solid rgba(255,255,255,0.1);">#tag_2</span></div></div>' 
    },
    '--tag-font-size': { 
        val: '11px', 
        desc: 'Размер текста тегов на карточках',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('type', { size: 16 }) + ' Размер шрифта тегов</div>Размер шрифта плашек тегов на галерейных карточках.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>10px</code>, <code>11px</code>, <code>14px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой размер шрифта тега:</b><br><div style="margin-top:10px; text-align:center;"><span style="background:var(--tag-bg); padding:4px 12px; border-radius:6px; font-size:var(--tag-font-size); color:#fff; border:1px solid rgba(255,255,255,0.15); font-weight:bold; transition:font-size 0.2s;">#размер_тега</span></div>' 
    },
    '--scrollbar-width': { 
        val: '8px', 
        desc: 'Ширина (толщина) полосы прокрутки',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Толщина ползунка скролла</div>Ширина встроенного кастомного скроллбара браузера.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>4px</code> (ультратонкий), <code>8px</code> (базовый), <code>12px</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой скроллбар (попробуйте прокрутить блок справа):</b><br><div style="margin-top:10px; display:flex; gap:12px; align-items:center; justify-content:center;"><div style="width:var(--scrollbar-width); height:45px; background:var(--accent); border-radius:4px; box-shadow:0 0 10px var(--accent-glow); transition:width 0.2s;"></div><div class="expert-scrollbar-demo" style="height:45px; width:120px; overflow-y:scroll; background:#08090d; padding:6px; border-radius:6px; font-size:0.65rem; color:#aaa; border:1px solid rgba(255,255,255,0.1);">Строка 1<br>Строка 2<br>Строка 3<br>Строка 4<br>Строка 5</div></div>' 
    },
    '--scrollbar-thumb-color': { 
        val: 'rgba(255, 255, 255, 0.16)', 
        desc: 'Цвет ползунка прокрутки',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Цвет ползунка скролла</div>Цвет бегунка полосы прокрутки.<br><br><b>' + icon('lightbulb', { size: 16 }) + ' Значения:</b> <code>rgba(255,255,255,0.2)</code>, <code>var(--accent)</code><br><br><b>' + icon('eye', { size: 16 }) + ' Живой цвет скроллбара:</b><br><div style="margin-top:10px; display:flex; gap:12px; align-items:center; justify-content:center;"><div style="width:8px; height:45px; background:var(--scrollbar-thumb-color); border-radius:4px; border:1px solid rgba(255,255,255,0.1); transition:background 0.3s;"></div><div class="expert-scrollbar-demo" style="height:45px; width:120px; overflow-y:scroll; background:#08090d; padding:6px; border-radius:6px; font-size:0.65rem; color:#aaa; border:1px solid rgba(255,255,255,0.1);">Прокрутите блок<br>Строка 2<br>Строка 3<br>Строка 4<br>Строка 5</div></div>' 
    },
    '--card-shadow': { 
        val: '0 8px 24px rgba(0,0,0,0.4)', 
        desc: 'Тень карточек',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('shadow', { size: 16 }) + ' Тень карточек</div>Эффект тени под карточками для создания глубины.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>none</code>, <code>0 4px 12px rgba(0,0,0,0.3)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:14px; background:var(--dark); border-radius:8px; display:flex; justify-content:center; align-items:center; border:1px solid rgba(255,255,255,0.05);"><div style="padding:12px 20px; background:var(--card-bg); border-radius:8px; color:var(--light); font-size:0.75rem; box-shadow:var(--card-shadow); transition:box-shadow 0.3s;">Карточка с тенью</div></div>' 
    },
    '--glass-blur': { 
        val: '28px', 
        desc: 'Сила размытия стекла',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('blur', { size: 16 }) + ' Сила размытия стекла</div>Интенсивность эффекта размытия для стеклянных элементов (модальные окна, панели).<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0px</code> (без размытия), <code>10px</code> (умеренное), <code>28px</code> (сильное)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:20px; background:linear-gradient(135deg, #ff3b6b, #9b51e0); border-radius:8px; position:relative; overflow:hidden;"><div style="position:relative; background:rgba(10, 11, 16, 0.4); backdrop-filter:blur(var(--glass-blur, 28px)); -webkit-backdrop-filter:blur(var(--glass-blur, 28px)); padding:12px; border-radius:8px; text-align:center; color:#fff; font-size:0.75rem; font-weight:bold; border:1px solid rgba(255,255,255,0.2); transition:backdrop-filter 0.3s;">Стеклянная панель</div></div>' 
    },
    '--gradient-opacity': { 
        val: '0.5', 
        desc: 'Прозрачность градиентов',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('palette', { size: 16 }) + ' Прозрачность градиентов</div>Общая прозрачность градиентных фонов и элементов (например, подсветка активных пунктов).<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>0</code> (полностью прозрачно), <code>0.5</code> (полупрозрачно), <code>1</code> (непрозрачно)<br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример:</b><br><div style="margin-top:10px; padding:16px; background:#08090d; border-radius:8px; display:flex; justify-content:center; align-items:center;"><div style="width:100%; height:40px; background:linear-gradient(90deg, var(--accent), transparent); opacity:var(--gradient-opacity, 0.5); border-radius:6px; transition:opacity 0.3s;"></div></div>' 
    },
    '--btn-primary-backdrop-filter': { 
        val: 'none', 
        desc: 'Эффект стекла для активных кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Эффект матового стекла (Главные кнопки)</div>Применяет эффект размытия к фону за кнопкой. Для работы эффекта фон кнопки (--btn-primary-bg) должен быть полупрозрачным.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>blur(10px)</code>, <code>blur(16px) saturate(1.5)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой эффект стекла:</b><br><div style="margin-top:10px; padding:16px; background:linear-gradient(135deg, #1c1828, #3b1d3d); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:50px; height:50px; background:var(--accent); border-radius:50%; top:10px; left:30%; animation:liveOrbs 3s ease-in-out infinite alternate;"></div><div style="position:relative; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-primary-bg, rgba(255,255,255,0.1)); color:var(--btn-primary-color, #fff); border:var(--btn-primary-border, 1px solid rgba(255,255,255,0.2)); backdrop-filter:var(--btn-primary-backdrop-filter, blur(10px)); -webkit-backdrop-filter:var(--btn-primary-backdrop-filter, blur(10px)); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem;">Стеклянная кнопка</button></div></div>' 
    },
    '--btn-primary-border': { 
        val: 'none', 
        desc: 'Рамка активных кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Рамка активных кнопок</div>Позволяет добавить обводку для главных кнопок. Особенно полезно при создании стеклянных элементов.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>none</code>, <code>1px solid rgba(255, 255, 255, 0.2)</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример рамки:</b><br><div style="margin-top:10px; padding:12px; border-radius:8px; display:flex; justify-content:center; align-items:center; background:#08090d;"><button style="background:var(--btn-primary-bg); color:var(--btn-primary-color, #fff); border:var(--btn-primary-border, 1px solid rgba(255, 255, 255, 0.3)); backdrop-filter:var(--btn-primary-backdrop-filter, none); -webkit-backdrop-filter:var(--btn-primary-backdrop-filter, none); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem; cursor:pointer;">Кнопка с рамкой</button></div>' 
    },
    '--btn-secondary-backdrop-filter': { 
        val: 'none', 
        desc: 'Эффект стекла для вторичных кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('glass', { size: 16 }) + ' Эффект матового стекла (Вторичные)</div>Размытие фона под второстепенными кнопками.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>blur(10px)</code>, <code>blur(20px) saturate(1.2)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой эффект стекла:</b><br><div style="margin-top:10px; padding:16px; background:linear-gradient(135deg, #1c1828, #3b1d3d); border-radius:10px; position:relative; overflow:hidden;"><div style="position:absolute; width:50px; height:50px; background:var(--accent); border-radius:50%; top:10px; left:30%; animation:liveOrbs 3s ease-in-out infinite alternate;"></div><div style="position:relative; display:flex; justify-content:center; align-items:center;"><button style="background:var(--btn-secondary-bg, rgba(255,255,255,0.05)); color:var(--btn-secondary-color, var(--light)); border:var(--btn-secondary-border, 1px solid rgba(255,255,255,0.1)); backdrop-filter:var(--btn-secondary-backdrop-filter, blur(10px)); -webkit-backdrop-filter:var(--btn-secondary-backdrop-filter, blur(10px)); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem;">Вторичное стекло</button></div></div>' 
    },
    '--btn-secondary-border': { 
        val: '1px solid var(--glass-border)', 
        desc: 'Рамка вторичных кнопок',
        help: '<div style="font-weight:700; color:var(--accent); font-size:0.8rem; margin-bottom:6px; display:flex; align-items:center; gap:6px;">' + icon('ruler', { size: 16 }) + ' Рамка вторичных кнопок</div>Обводка второстепенных кнопок. По умолчанию используется системный цвет стеклянных границ.<br><br><b>' + icon('lightbulb', { size: 14 }) + ' Значения:</b> <code>1px solid var(--glass-border)</code>, <code>1px solid rgba(255, 255, 255, 0.2)</code>, <code>none</code><br><br><b>' + icon('eye', { size: 14 }) + ' Живой пример рамки:</b><br><div style="margin-top:10px; padding:12px; border-radius:8px; display:flex; justify-content:center; align-items:center; background:#08090d;"><button style="background:var(--btn-secondary-bg); color:var(--btn-secondary-color, var(--light)); border:var(--btn-secondary-border, 1px solid rgba(255,255,255,0.2)); backdrop-filter:var(--btn-secondary-backdrop-filter, none); -webkit-backdrop-filter:var(--btn-secondary-backdrop-filter, none); padding:10px 24px; border-radius:12px; font-weight:bold; font-size:0.75rem; cursor:pointer;">Кнопка с рамкой</button></div>' 
    }
};

const categoryMap = {
    '--accent': 'colors',
    '--btn-primary-bg': 'colors',
    '--btn-secondary-bg': 'colors',
    '--accent-alt': 'colors',
    '--accent-glow': 'colors',
    '--dark': 'colors',
    '--light': 'colors',
    '--body-bg': 'colors',
    '--modal-bg': 'colors',
    '--error': 'colors',
    '--success': 'colors',
    '--tag-bg': 'colors',
    '--suggestion-bg': 'colors',
    '--glass': 'colors',
    '--glass-bg': 'colors',
    '--glass-bg-strong': 'colors',
    '--glass-border': 'colors',
    '--glass-border-strong': 'colors',
    '--header-bg': 'colors',
    '--hover-border-color': 'colors',
    '--scrollbar-thumb-color': 'colors',
    '--btn-primary-border': 'colors',
    '--btn-secondary-border': 'colors',

    '--media-radius': 'layout',
    '--media-gap': 'layout',
    '--grid-col-width': 'layout',
    '--container-max-width': 'layout',
    '--gallery-max-width': 'layout',
    '--button-radius': 'layout',
    '--input-radius': 'layout',
    '--card-bg-opacity': 'layout',
    '--card-bg-blur': 'layout',
    '--card-border-width': 'layout',
    '--card-border-color': 'layout',
    '--card-tags-display': 'layout',

    '--site-font': 'typography',
    '--base-font-size': 'typography',
    '--tag-font-size': 'typography',

    '--transition-speed': 'effects',
    '--header-backdrop-filter': 'effects',
    '--hover-transform': 'effects',
    '--hover-box-shadow': 'effects',
    '--card-transition-speed': 'effects',
    '--card-shadow': 'effects',
    '--glass-blur': 'effects',
    '--gradient-opacity': 'effects',
    '--scrollbar-width': 'effects',
    '--btn-primary-backdrop-filter': 'effects',
    '--btn-secondary-backdrop-filter': 'effects'
};

function getVariableGenerators(name) {
    const map = {
        '--accent': [
            { name: 'Coolors', url: 'https://coolors.co' },
            { name: 'Realtime Colors', url: 'https://www.realtimecolors.com' }
        ],
        '--btn-primary-bg': [
            { name: 'CSS Gradient', url: 'https://cssgradient.io' },
            { name: 'Coolors', url: 'https://coolors.co' }
        ],
        '--btn-secondary-bg': [
            { name: 'Realtime Colors', url: 'https://www.realtimecolors.com' },
            { name: 'CSS Gradient', url: 'https://cssgradient.io' }
        ],
        '--transition-speed': [
            { name: 'Cubic Bezier', url: 'https://cubic-bezier.com' },
            { name: 'Animista', url: 'https://animista.net' }
        ],
        '--accent-alt': [
            { name: 'CSS Gradient', url: 'https://cssgradient.io' },
            { name: 'uiGradients', url: 'https://uigradients.com' }
        ],
        '--accent-glow': [
            { name: 'Brumm Shadows', url: 'https://shadows.brumm.af' }
        ],
        '--dark': [
            { name: 'Realtime Colors', url: 'https://www.realtimecolors.com' },
            { name: 'Color Hunt', url: 'https://colorhunt.co' }
        ],
        '--light': [
            { name: 'WebAIM Contrast', url: 'https://webaim.org/resources/contrastchecker/' }
        ],
        '--body-bg': [
            { name: 'CSS Gradient', url: 'https://cssgradient.io' },
            { name: 'Hypercolor', url: 'https://hypercolor.dev' }
        ],
        '--site-font': [
            { name: 'Google Fonts', url: 'https://fonts.google.com' },
            { name: 'Fontpair', url: 'https://www.fontpair.co' }
        ],
        '--base-font-size': [
            { name: 'Type Scale', url: 'https://type-scale.com' }
        ],
        '--tag-font-size': [
            { name: 'Type Scale', url: 'https://type-scale.com' }
        ],
        '--hover-transform': [
            { name: 'Animista', url: 'https://animista.net' },
            { name: 'Cubic Bezier', url: 'https://cubic-bezier.com' }
        ],
        '--hover-box-shadow': [
            { name: 'Brumm Shadows', url: 'https://shadows.brumm.af' }
        ],
        '--card-shadow': [
            { name: 'Brumm Shadows', url: 'https://shadows.brumm.af' }
        ],
        '--card-transition-speed': [
            { name: 'Cubic Bezier', url: 'https://cubic-bezier.com' },
            { name: 'Animista', url: 'https://animista.net' }
        ],
        '--glass-blur': [
            { name: 'CSS Generators', url: 'https://css-generators.com' },
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--glass': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--glass-bg': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--glass-bg-strong': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--glass-border': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--glass-border-strong': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--header-bg': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--modal-bg': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--tag-bg': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--suggestion-bg': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--card-bg-blur': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--header-backdrop-filter': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--btn-primary-backdrop-filter': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ],
        '--btn-secondary-backdrop-filter': [
            { name: 'Glassmorphism', url: 'https://css.glass' }
        ]
    };
    return map[name] || [];
}

const MDN_BASE = 'https://developer.mozilla.org/en-US/docs/Web/CSS/';

function getVariableDocs(name) {
    const map = {
        '--site-font': [{ name: 'MDN: font-family', url: MDN_BASE + 'font-family' }],
        '--base-font-size': [{ name: 'MDN: font-size', url: MDN_BASE + 'font-size' }],
        '--tag-font-size': [{ name: 'MDN: font-size', url: MDN_BASE + 'font-size' }],
        '--button-radius': [{ name: 'MDN: border-radius', url: MDN_BASE + 'border-radius' }],
        '--input-radius': [{ name: 'MDN: border-radius', url: MDN_BASE + 'border-radius' }],
        '--media-radius': [{ name: 'MDN: border-radius', url: MDN_BASE + 'border-radius' }],
        '--hover-transform': [{ name: 'MDN: transform', url: MDN_BASE + 'transform' }],
        '--hover-box-shadow': [{ name: 'MDN: box-shadow', url: MDN_BASE + 'box-shadow' }],
        '--card-shadow': [{ name: 'MDN: box-shadow', url: MDN_BASE + 'box-shadow' }],
        '--transition-speed': [{ name: 'MDN: transition', url: MDN_BASE + 'transition' }],
        '--card-transition-speed': [{ name: 'MDN: transition', url: MDN_BASE + 'transition' }],
        '--glass-blur': [{ name: 'MDN: backdrop-filter', url: MDN_BASE + 'backdrop-filter' }],
        '--card-bg-blur': [{ name: 'MDN: backdrop-filter', url: MDN_BASE + 'backdrop-filter' }],
        '--header-backdrop-filter': [{ name: 'MDN: backdrop-filter', url: MDN_BASE + 'backdrop-filter' }],
        '--btn-primary-backdrop-filter': [{ name: 'MDN: backdrop-filter', url: MDN_BASE + 'backdrop-filter' }],
        '--btn-secondary-backdrop-filter': [{ name: 'MDN: backdrop-filter', url: MDN_BASE + 'backdrop-filter' }],
        '--body-bg': [{ name: 'MDN: radial-gradient()', url: MDN_BASE + 'gradient/radial-gradient' }],
        '--media-gap': [{ name: 'MDN: gap', url: MDN_BASE + 'gap' }],
        '--grid-col-width': [{ name: 'MDN: grid-template-columns', url: MDN_BASE + 'grid-template-columns' }],
        '--accent-glow': [{ name: 'MDN: box-shadow', url: MDN_BASE + 'box-shadow' }]
    };
    return map[name] || [];
}

export class ExpertStylesEditor {
    constructor(options = {}) {
        this.applyAdaptiveText = options.applyAdaptiveText || ((varName, val) => recalculateAllAdaptiveText());
        this.toggleBtn = document.getElementById('toggleExpertBtn');
        this.container = document.getElementById('expertSettingsContainer');
        this.variablesList = document.getElementById('expertVariablesList');
        this.initialized = false;
    }

    init() {
        if (!this.toggleBtn || !this.container || !this.variablesList) return;
        if (this.initialized) return;
        this.initialized = true;

        this.toggleBtn.addEventListener('click', () => {
            const isHidden = this.container.style.display === 'none';
            this.container.style.display = isHidden ? 'block' : 'none';
            this.toggleBtn.textContent = isHidden ? 'Свернуть' : 'Развернуть';
            
            if (isHidden && this.variablesList.children.length === 0) {
                this.renderEditor();
            }
        });

        // Initial application of saved values
        Object.keys(defaultVariables).forEach(varName => {
            const savedValue = localStorage.getItem('r34_expert_' + varName);
            const activeVal = savedValue || defaultVariables[varName].val;
            
            if (savedValue) {
                document.documentElement.style.setProperty(varName, savedValue);
            }

            this.applyAdaptiveText(varName, activeVal);
        });
    }

    renderEditor() {
        this.variablesList.innerHTML = '';

        if (!document.getElementById('expert-live-styles')) {
            const style = document.createElement('style');
            style.id = 'expert-live-styles';
            style.textContent = `
                @keyframes livePulseGlow {
                    0%, 100% { box-shadow: 0 0 10px var(--accent-glow), 0 0 20px var(--accent-glow); transform: scale(1); }
                    50% { box-shadow: 0 0 28px var(--accent-glow), 0 0 50px var(--accent-glow); transform: scale(1.03); }
                }
                @keyframes liveMovingGradient {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                .expert-scrollbar-demo::-webkit-scrollbar {
                    width: var(--scrollbar-width, 8px);
                    height: var(--scrollbar-width, 8px);
                }
                .expert-scrollbar-demo::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 4px;
                }
                .expert-scrollbar-demo::-webkit-scrollbar-thumb {
                    background: var(--scrollbar-thumb-color, rgba(255, 255, 255, 0.2));
                    border-radius: 4px;
                }
            `;
            document.head.appendChild(style);
        }

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'expert-controls-bar';

        // Top row
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'expert-search-input';
        searchInput.style.flex = '1';
        searchInput.style.minWidth = '200px';
        searchInput.placeholder = 'Поиск переменной (напр. accent, radius, font)...';

        const resetBtn = document.createElement('button');
        resetBtn.className = 'expert-reset-btn';
        resetBtn.innerHTML = 'Сбросить все настройки';
        resetBtn.title = 'Сбросить все экспертные переменные к значениям по умолчанию';
        resetBtn.addEventListener('click', async () => {
            const confirmed = window.showConfirmModal ? await window.showConfirmModal('Сбросить настройки', 'Сбросить все экспертные настройки стиля к значениям по умолчанию?') : confirm('Сбросить все настройки?');
            if (confirmed) {
                Object.keys(defaultVariables).forEach(varName => {
                    localStorage.removeItem('r34_expert_' + varName);
                    document.documentElement.style.removeProperty(varName);
                    this.applyAdaptiveText(varName, defaultVariables[varName].val);
                });
                this.renderEditor();
            }
        });

        const copyBtn = document.createElement('button');
        copyBtn.className = 'expert-preset-btn';
        copyBtn.innerHTML = icon('copy', { size: 12 }) + ' Скопировать как CSS';
        copyBtn.title = 'Скопировать текущие переопределения переменных как CSS-код';
        copyBtn.addEventListener('click', async () => {
            const overrides = Object.keys(defaultVariables)
                .map(varName => {
                    const saved = localStorage.getItem('r34_expert_' + varName);
                    return saved ? `  ${varName}: ${saved};` : null;
                })
                .filter(Boolean);

            const cssText = overrides.length > 0
                ? `:root {\n${overrides.join('\n')}\n}`
                : '';

            const original = copyBtn.innerHTML;
            if (!cssText) {
                copyBtn.innerHTML = 'Нет изменённых переменных';
            } else {
                try {
                    await navigator.clipboard.writeText(cssText);
                    copyBtn.innerHTML = icon('check', { size: 12 }) + ' Скопировано!';
                } catch (e) {
                    copyBtn.innerHTML = 'Не удалось скопировать';
                }
            }
            setTimeout(() => { copyBtn.innerHTML = original; }, 1800);
        });

        topRow.appendChild(searchInput);
        topRow.appendChild(copyBtn);
        topRow.appendChild(resetBtn);
        controlsDiv.appendChild(topRow);

        // Presets row
        const presetsRow = document.createElement('div');
        presetsRow.style.cssText = 'display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.75rem; color: rgba(255,255,255,0.6);';
        presetsRow.innerHTML = '<span style="font-weight: bold; margin-right: 4px; color: var(--accent);">Пресеты:</span>';

        const presets = [
            {
                name: 'Стандарт (Розовый)',
                vars: { '--accent': '#ff3b6b', '--accent-alt': '#ff5e8c', '--body-bg': 'radial-gradient(circle at top center, #1c1828 0%, #0c0d12 100%)', '--dark': '#0a0b10', '--light': '#f6f7fb' }
            },
            {
                name: 'Киберпанк (Неон)',
                vars: { '--accent': '#00f0ff', '--accent-alt': '#ff007f', '--body-bg': 'radial-gradient(circle at top center, #0d0221 0%, #05010d 100%)', '--dark': '#0a0518', '--light': '#e0f7fc', '--accent-glow': 'rgba(0, 240, 255, 0.5)' }
            },
            {
                name: 'Изумрудный',
                vars: { '--accent': '#10b981', '--accent-alt': '#059669', '--body-bg': 'radial-gradient(circle at top center, #062016 0%, #020b07 100%)', '--dark': '#03140e', '--light': '#ecfdf5', '--accent-glow': 'rgba(16, 185, 129, 0.4)' }
            },
            {
                name: 'Светлая тема',
                vars: { '--accent': '#6366f1', '--accent-alt': '#4f46e5', '--body-bg': '#f8fafc', '--dark': '#ffffff', '--light': '#0f172a', '--tag-bg': 'rgba(0,0,0,0.05)', '--glass-bg': 'rgba(255,255,255,0.8)', '--card-border-color': 'rgba(0,0,0,0.1)', '--accent-glow': 'rgba(99, 102, 241, 0.25)' }
            }
        ];

        presets.forEach(preset => {
            const pBtn = document.createElement('button');
            pBtn.className = 'expert-preset-btn';
            pBtn.textContent = preset.name;
            pBtn.addEventListener('click', () => {
                Object.entries(preset.vars).forEach(([key, val]) => {
                    localStorage.setItem('r34_expert_' + key, val);
                    document.documentElement.style.setProperty(key, val);
                    this.applyAdaptiveText(key, val);
                });
                this.renderEditor();
            });
            presetsRow.appendChild(pBtn);
        });
        controlsDiv.appendChild(presetsRow);

        // Categories row
        const categories = [
            { id: 'all', name: 'Все переменные' },
            { id: 'colors', name: 'Цвета & Темы' },
            { id: 'layout', name: 'Сетка & Карточки' },
            { id: 'typography', name: 'Шрифты & Текст' },
            { id: 'effects', name: 'Эффекты & Анимация' }
        ];

        let activeCategory = 'all';
        let searchQuery = '';

        const categoryBar = document.createElement('div');
        categoryBar.className = 'expert-pills-row';

        const categoryBtns = {};

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'expert-pill';
            btn.classList.toggle('active', cat.id === activeCategory);
            btn.textContent = cat.name;

            btn.addEventListener('click', () => {
                activeCategory = cat.id;
                Object.keys(categoryBtns).forEach(k => {
                    categoryBtns[k].classList.toggle('active', k === activeCategory);
                });
                renderVariables();
            });

            categoryBtns[cat.id] = btn;
            categoryBar.appendChild(btn);
        });

        controlsDiv.appendChild(categoryBar);
        this.variablesList.appendChild(controlsDiv);

        // Tools block
        const toolsBlock = document.createElement('div');
        toolsBlock.className = 'expert-tools-block';
        toolsBlock.style.cssText = 'background: rgba(18, 22, 34, 0.85); border: 1px solid rgba(255, 255, 255, 0.12); border-left: 4px solid var(--accent); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; backdrop-filter: blur(12px); box-shadow: 0 4px 16px rgba(0,0,0,0.3);';

        const toolLinkStyle = 'display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; color: var(--adaptive-text-main, #fff); text-decoration: none; font-size: 0.73rem; font-weight: 600; transition: all var(--transition-speed, 0.2s) var(--ease);';
        const toolLinkHover = "this.style.borderColor='var(--accent)'; this.style.background='rgba(255,255,255,0.12)';";
        const toolLinkOut = "this.style.borderColor='rgba(255,255,255,0.12)'; this.style.background='rgba(255,255,255,0.06)';";
        const toolLink = (url, iconName, label) =>
            `<a href="${url}" target="_blank" rel="noopener noreferrer" style="${toolLinkStyle}" onmouseover="${toolLinkHover}" onmouseout="${toolLinkOut}">${icon(iconName, { size: 14 })} ${label}</a>`;

        toolsBlock.innerHTML = `
            <div style="font-weight: bold; font-size: 0.82rem; color: var(--adaptive-text-main, #fff); margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
                <span style="color: var(--accent); display: inline-flex;">${icon('globe', { size: 16 })}</span>
                <span>Генераторы стилей & Онлайн-ресурсы</span>
            </div>
            <div style="font-size: 0.73rem; color: var(--adaptive-text-muted, rgba(255,255,255,0.65)); margin-bottom: 10px; line-height: 1.4;">
                Инструменты для подбора идеальных палитр, градиентов, эффекта стекла, теней и шрифтов:
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${toolLink('https://coolors.co', 'palette', 'Coolors (Палитры)')}
                ${toolLink('https://www.realtimecolors.com', 'eye', 'Realtime Colors')}
                ${toolLink('https://cssgradient.io', 'rainbow', 'CSS Gradient')}
                ${toolLink('https://css.glass', 'glass', 'Glassmorphism')}
                ${toolLink('https://css-generators.com', 'sparkles', 'CSS Generators')}
                ${toolLink('https://shadows.brumm.af', 'box', 'Brumm Box Shadow')}
                ${toolLink('https://fonts.google.com', 'type', 'Google Fonts')}
                ${toolLink('https://webaim.org/resources/contrastchecker/', 'contrast', 'WebAIM Contrast')}
                ${toolLink('https://uiverse.io', 'wand', 'Uiverse.io (UI)')}
            </div>
        `;
        this.variablesList.appendChild(toolsBlock);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
        this.variablesList.appendChild(listContainer);

        const renderVariables = () => {
            listContainer.innerHTML = '';
            let count = 0;

            Object.keys(defaultVariables).forEach(varName => {
                const savedValue = localStorage.getItem('r34_expert_' + varName);
                const itemCat = categoryMap[varName] || 'colors';

                if (activeCategory !== 'all' && itemCat !== activeCategory) {
                    return;
                }

                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const desc = (defaultVariables[varName].desc || '').toLowerCase();
                    if (!varName.toLowerCase().includes(q) && !desc.includes(q)) {
                        return;
                    }
                }

                count++;

                if (savedValue) {
                    document.documentElement.style.setProperty(varName, savedValue);
                }

                const row = document.createElement('div');
                row.className = 'expert-card-row';

                const labelContainer = document.createElement('div');
                labelContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

                const labelRow = document.createElement('div');
                labelRow.className = 'expert-card-top';

                const label = document.createElement('label');
                label.className = 'expert-var-name';
                label.textContent = varName;

                const infoBtn = document.createElement('button');
                infoBtn.className = 'expert-info-btn';
                infoBtn.textContent = 'Пример и справка';
                infoBtn.title = 'Показать примеры и описание';

                labelRow.appendChild(label);
                labelRow.appendChild(infoBtn);

                const desc = document.createElement('div');
                desc.className = 'expert-var-desc';
                desc.textContent = defaultVariables[varName].desc;

                const docs = getVariableDocs(varName);
                const gens = getVariableGenerators(varName);
                let genContainer = null;
                if ((docs && docs.length > 0) || (gens && gens.length > 0)) {
                    genContainer = document.createElement('div');
                    genContainer.className = 'expert-links-container';

                    const genTitle = document.createElement('span');
                    genTitle.style.cssText = 'font-size: 0.68rem; font-weight: 700; color: var(--accent); display: inline-flex; align-items: center; gap: 4px;';
                    genTitle.innerHTML = icon('link', { size: 12 }) + ' Документация и источники:';
                    genContainer.appendChild(genTitle);

                    const linksRow = document.createElement('div');
                    linksRow.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap;';

                    (docs || []).forEach(d => {
                        const link = document.createElement('a');
                        link.href = d.url;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.className = 'expert-link-item expert-link-docs';
                        link.innerHTML = icon('book', { size: 12 }) + ' ' + d.name;
                        linksRow.appendChild(link);
                    });

                    (gens || []).forEach(g => {
                        const link = document.createElement('a');
                        link.href = g.url;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.className = 'expert-link-item expert-link-tools';
                        link.innerHTML = icon('wand', { size: 12 }) + ' ' + g.name;
                        linksRow.appendChild(link);
                    });

                    genContainer.appendChild(linksRow);
                }

                const helpBox = document.createElement('div');
                helpBox.className = 'expert-help-panel';
                helpBox.innerHTML = defaultVariables[varName].help;

                infoBtn.addEventListener('click', () => {
                    const isHidden = helpBox.style.display === 'none' || !helpBox.style.display;
                    helpBox.style.display = isHidden ? 'block' : 'none';
                    infoBtn.classList.toggle('active', isHidden);
                });

                labelContainer.appendChild(labelRow);
                labelContainer.appendChild(desc);
                if (genContainer) {
                    labelContainer.appendChild(genContainer);
                }
                labelContainer.appendChild(helpBox);

                const inputWrapper = document.createElement('div');
                inputWrapper.style.cssText = 'display: flex; gap: 8px; align-items: center;';

                const currentVal = savedValue || defaultVariables[varName].val;
                const isHexColor = /^#([0-9a-f]{3}){1,2}$/i.test(currentVal.trim());

                if (isHexColor) {
                    const colorPicker = document.createElement('input');
                    colorPicker.type = 'color';
                    let hex = currentVal.trim();
                    if (hex.length === 4) {
                        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
                    }
                    colorPicker.value = hex;
                    colorPicker.style.cssText = 'width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer; background: none; padding: 0;';
                    
                    colorPicker.addEventListener('input', (e) => {
                        const val = e.target.value;
                        input.value = val;
                        document.documentElement.style.setProperty(varName, val);
                        this.applyAdaptiveText(varName, val);
                        localStorage.setItem('r34_expert_' + varName, val);
                    });

                    inputWrapper.appendChild(colorPicker);
                }

                const input = document.createElement('input');
                input.type = 'text';
                input.value = savedValue || defaultVariables[varName].val;
                input.placeholder = defaultVariables[varName].val;
                input.style.cssText = 'flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--adaptive-text-main, #fff); padding: 8px 10px; font-size: 0.78rem; font-family: monospace; outline: none; transition: border-color var(--transition-speed, 0.2s) var(--ease);';
                
                input.addEventListener('focus', () => { input.style.borderColor = 'var(--accent)'; });
                input.addEventListener('blur', () => { input.style.borderColor = 'rgba(255,255,255,0.1)'; });

                input.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    const activeVal = val || defaultVariables[varName].val;
                    document.documentElement.style.setProperty(varName, activeVal);

                    this.applyAdaptiveText(varName, activeVal);

                    if (val && val !== defaultVariables[varName].val) {
                        localStorage.setItem('r34_expert_' + varName, val);
                    } else {
                        localStorage.removeItem('r34_expert_' + varName);
                    }
                });

                inputWrapper.appendChild(input);
                row.appendChild(labelContainer);
                row.appendChild(inputWrapper);
                listContainer.appendChild(row);
            });

            if (count === 0) {
                listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5); font-size: 0.8rem;">Переменные не найдены</div>';
            }
        };

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderVariables();
        });

        renderVariables();
    }
}
