// Скачивание медиа из галереи.
//
// Ссылка идёт через собственный /proxy: файлы лежат на api-cdn.rule34.xxx, а
// браузер игнорирует атрибут download для чужого origin — вместо сохранения
// открылась бы вкладка с картинкой. Через прокси адрес свой, download
// работает, а сервер стримит файл, не держа его целиком в памяти.

export function buildDownloadName(post) {
    const cleanUrl = String((post && post.file_url) || '').split('?')[0];
    const match = cleanUrl.match(/\.[a-z0-9]{2,5}$/i);
    const ext = match ? match[0] : '.jpg';
    return `rule34_${post.id}${ext}`;
}

export function downloadMedia(post) {
    if (!post || !post.file_url) return false;

    const link = document.createElement('a');
    link.href = `/proxy?url=${encodeURIComponent(post.file_url)}`;
    link.download = buildDownloadName(post);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
}
