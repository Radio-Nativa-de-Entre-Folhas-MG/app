/* Nativa FM 1.4.0 — instalação inteligente, sem menus, sem pop-ups desnecessários. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const landing = $('installLanding');
  const app = $('appShell');
  const installButton = $('landingInstallButton');
  const installLabel = $('landingInstallLabel');
  const installHint = $('landingInstallHint');
  let deferredPrompt = null;
  let installedInThisSession = false;

  const isStandalone = () =>
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    navigator.standalone === true;

  const standalone = isStandalone();
  document.documentElement.dataset.pwaDisplay = standalone ? 'standalone' : 'browser';
  landing.hidden = standalone;
  app.hidden = !standalone;
  if (standalone) return;

  // Registre o SW também na página de instalação. Anteriormente o registro
  // ocorria só dentro do player, bloqueado até que o app fosse instalado.
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js?v=1.9.4').catch(() => {});
    });
  }

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
  const isLinux = /Linux/i.test(ua) && !isAndroid;

  const hints = {
    ios: 'No iPhone, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois, abra pelo ícone da Nativa FM.',
    android: 'No Chrome, toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.',
    windows: 'No Chrome ou Edge, clique no ícone de instalação na barra de endereços ou use o menu do navegador.',
    mac: 'No Safari, escolha Arquivo → Adicionar ao Dock. Em outros navegadores, use a opção Instalar aplicativo.',
    linux: 'Abra o menu do Chrome ou Edge e escolha “Instalar aplicativo”, quando disponível.',
    other: 'Use a opção “Instalar aplicativo” ou “Adicionar à tela inicial” do seu navegador.'
  };
  const platform = isIOS ? 'ios' : isAndroid ? 'android' : isWindows ? 'windows' : isMac ? 'mac' : isLinux ? 'linux' : 'other';

  function hint(message) {
    installHint.textContent = message;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (!installedInThisSession) hint('Pronto para instalar. Toque no botão para confirmar.');
  });

  installButton.addEventListener('click', async () => {
    if (installedInThisSession) return;
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      try {
        await prompt.prompt();
        const result = await prompt.userChoice;
        if (result?.outcome === 'accepted') {
          hint('Instalação autorizada! Abra a Nativa FM pelo novo ícone.');
          return;
        }
        hint('Instalação não concluída. ' + hints[platform]);
        return;
      } catch (_) {
        // Quando não há prompt nativo, oriente sem modal ou outro botão.
      }
    }
    hint(hints[platform]);
  });

  window.addEventListener('appinstalled', () => {
    installedInThisSession = true;
    deferredPrompt = null;
    installButton.disabled = true;
    installLabel.textContent = 'APLICATIVO INSTALADO';
    hint('Instalação concluída! Abra pelo ícone da Nativa FM.');
  });

  if (window.matchMedia) {
    const mode = window.matchMedia('(display-mode: standalone)');
    mode.addEventListener?.('change', () => location.reload());
  }
})();
