/**
 * pwa.js — registers the service worker and exposes an install prompt hook.
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.querySelectorAll('[data-install-app]').forEach(btn => btn.style.display = 'inline-flex');
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-install-app]');
  if (!btn || !deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  btn.style.display = 'none';
});

window.addEventListener('online', () => toast?.('اتصال الإنترنت متاح الآن'));
window.addEventListener('offline', () => toast?.('أنت الآن غير متصل — يمكنك متابعة القراءة'));
