/**
 * Утилиты для безопасной работы с localStorage с защитой от QuotaExceededError
 */

export const StorageManager = {
    /**
     * Безопасное сохранение данных в localStorage
     * @param {string} key 
     * @param {string} value 
     */
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            if (this.isQuotaExceeded(e)) {
                console.warn('LocalStorage quota exceeded. Attempting cleanup...', key);
                this.cleanup();
                try {
                    // Повторная попытка после очистки
                    localStorage.setItem(key, value);
                } catch (retryError) {
                    console.error('LocalStorage still full after cleanup.', retryError);
                }
            } else {
                console.error('LocalStorage setItem error:', e);
            }
        }
    },

    /**
     * Проверка, является ли ошибка переполнением квоты
     */
    isQuotaExceeded(e) {
        return e instanceof DOMException && (
            e.code === 22 || 
            e.code === 1014 || 
            e.name === 'QuotaExceededError' || 
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        );
    },

    /**
     * Очистка старых данных (LRU - Least Recently Used)
     * Удаляет старые позиции видео, данные о длительности и кеш API
     */
    cleanup() {
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            if (key.startsWith('r34_video_position_ts_') || 
                key.startsWith('r34_duration_') || 
                key.startsWith('api_cache_')) {
                
                let timestamp = 0;
                if (key.startsWith('r34_video_position_ts_')) {
                    timestamp = parseInt(localStorage.getItem(key), 10) || 0;
                } else if (key.startsWith('api_cache_')) {
                    // Для кеша API пытаемся найти метку времени внутри или используем 0
                    timestamp = 0; // В идеале кеш должен иметь свою метку, но пока удаляем как старое
                } else {
                    const id = key.replace('r34_duration_', '').replace('r34_video_position_', '');
                    const tsKey = `r34_video_position_ts_${id}`;
                    timestamp = parseInt(localStorage.getItem(tsKey), 10) || 0;
                }
                items.push({ key, timestamp });
            }
        }

        // Сортируем: сначала самые старые (timestamp 0 тоже в начале)
        items.sort((a, b) => a.timestamp - b.timestamp);

        // Удаляем 40% самых старых записей или хотя бы 50 штук, если их много
        const toDeleteCount = Math.max(Math.min(50, items.length), Math.floor(items.length * 0.4));
        
        for (let i = 0; i < Math.min(toDeleteCount, items.length); i++) {
            const item = items[i];
            localStorage.removeItem(item.key);
            
            // Удаляем связанные ключи
            const id = item.key.replace('r34_video_position_ts_', '')
                             .replace('r34_duration_', '')
                             .replace('r34_video_position_', '')
                             .replace('api_cache_', '');
            
            localStorage.removeItem(`r34_video_position_${id}`);
            localStorage.removeItem(`r34_video_position_ts_${id}`);
            localStorage.removeItem(`r34_duration_${id}`);
        }
        
        // Если место всё ещё нужно (критическая ситуация), удаляем ВЕСЬ кеш API
        if (items.length > 0 && toDeleteCount > 0) {
            console.log(`Cleaned up ${toDeleteCount} items from localStorage`);
        }
    },

    /**
     * Принудительное ограничение количества записей определенного типа
     * @param {string} prefix 
     * @param {number} limit 
     */
    limitEntries(prefix, limit = 100) {
        const entries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                entries.push(key);
            }
        }

        if (entries.length > limit) {
            // Если TS нет, удаляем просто первые попавшиеся до лимита
            // В идеале тут тоже нужна сортировка по времени, если префикс позволяет
            const toRemove = entries.length - limit;
            for (let i = 0; i < toRemove; i++) {
                localStorage.removeItem(entries[i]);
            }
        }
    }
};
