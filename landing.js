/* Nativa FM 1.3.0 — instalação automática e assistida conforme o dispositivo. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const landing = $('installLanding');
  const app = $('appShell');
  const installButton = $('landingInstallButton');
  const installLabel = $('landingInstallLabel');
  const installHint = $('landingInstallHint');
  const assist = $('installAssist');
  const assistBadge = $('assistBadge');
  const assistTitle = $('assistTitle');
  const assistCopy = $('assistCopy');
  const assistSteps = $('assistSteps');
  const assistNote = $('assistNote');
  const assistRetry = $('assistRetryButton');
  const assistClose = $('assistCloseButton');

  let pendingPrompt = null;
  let installedInSession = false;

  const isStandalone = () =>
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;

  function applyDisplayGate() {
    const installedWindow = isStandalone();
    document.documentElement.dataset.pwaDisplay = installedWindow ? 'standalone' : 'browser';
    landing.hidden = installedWindow;
    app.hidden = !installedWindow;
    return installedWindow;
  }
  if (applyDisplayGate()) return;

  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const windows = /Windows/i.test(ua);
  const mac = /Macintosh|Mac OS X/i.test(ua) && !ios;
  const linux = /Linux/i.test(ua) && !android;
  const platform = ios ? 'ios' : android ? 'android' : windows ? 'windows' : mac ? 'mac' : linux ? 'linux' : 'other';

  const profile = {
    ios: {
      badge: 'IPHONE / IOS',
      title: 'Instale a Nativa FM no seu iPhone.',
      copy: 'No iPhone, a instalação é feita rapidamente pelo próprio Safari.',
      steps: [
        'Toque no botão compartilhar do Safari.',
        'Escolha “Adicionar à Tela de Início”.',
        'Confirme e abra a Nativa FM pelo novo ícone no seu aparelho.'
      ],
      note: 'Depois de instalada, a rádio abrirá como aplicativo, com acesso rápido e visual próprio.'
    },
    android: {
      badge: 'ANDROID',
      title: 'Instale a Nativa FM no seu Android.',
      copy: 'A instalação pode ser iniciada diretamente por este botão, quando o navegador permitir.',
      steps: [
        'Toque em “Instalar aplicativo”.',
        'Confirme a instalação na janela exibida pelo seu dispositivo.',
        'Abra a Nativa FM pelo ícone criado na tela inicial.'
      ],
      note: 'Se o navegador não abrir a confirmação automaticamente, ele mostrará a opção de instalar no próprio menu.'
    },
    windows: {
      badge: 'WINDOWS',
      title: 'Instale a Nativa FM no seu computador.',
      copy: 'No Windows, o aplicativo funciona muito bem em janela própria.',
      steps: [
        'Toque em “Instalar aplicativo”.',
        'Confirme a instalação na janela do navegador.',
        'Abra a Nativa FM pelo atalho criado no computador.'
      ],
      note: 'A experiência fica mais prática ao abrir a rádio em janela separada, como um app nativo.'
    },
    mac: {
      badge: 'MAC',
      title: 'Instale a Nativa FM no seu computador.',
      copy: 'Em navegadores compatíveis, a instalação pode ser iniciada diretamente por este botão.',
      steps: [
        'Toque em “Instalar aplicativo”.',
        'Confirme a instalação quando o navegador exibir a opção.',
        'Abra a Nativa FM pelo ícone criado no seu computador.'
      ],
      note: 'Se a instalação não aparecer automaticamente, use o recurso de instalar aplicativo do navegador.'
    },
    linux: {
      badge: 'LINUX',
      title: 'Instale a Nativa FM no seu computador.',
      copy: 'Em navegadores compatíveis, a instalação é simples e rápida.',
      steps: [
        'Toque em “Instalar aplicativo”.',
        'Confirme a instalação quando o navegador oferecer a opção.',
        'Abra a Nativa FM pelo ícone criado no sistema.'
      ],
      note: 'Em alguns navegadores, a opção de instalar aparece na barra de endereços ou no menu.'
    },
    other: {
      badge: 'SEU DISPOSITIVO',
      title: 'Instale a Nativa FM no seu dispositivo.',
      copy: 'Seu navegador pode oferecer a instalação automaticamente.',
      steps: [
        'Toque em “Instalar aplicativo”.',
        'Confirme a instalação se o navegador mostrar a opção.',
        'Se necessário, utilize a opção de instalar aplicativo ou adicionar à tela inicial do navegador.'
      ],
      note: 'Depois de instalado, abra a Nativa FM pelo novo ícone do aplicativo.'
    }
  };

  function showAssist(customProfile = profile[platform]) {
    const p = customProfile || profile.other;
    assistBadge.textContent = p.badge;
    assistTitle.textContent = p.title;
    assistCopy.textContent = p.copy;
    assistSteps.replaceChildren();
    p.steps.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      assistSteps.appendChild(li);
    });
    assistNote.textContent = p.note;
    assist.hidden = false;
    assistClose.focus({preventScroll:true});
  }
  function closeAssist() {
    assist.hidden = true;
    installButton.focus({preventScroll:true});
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pendingPrompt = event;
    if (!installedInSession) {
      installHint.textContent = 'Seu dispositivo está pronto para instalar o aplicativo.';
      installLabel.textContent = windows ? 'INSTALAR NO WINDOWS' : android ? 'INSTALAR NO ANDROID' : 'INSTALAR APLICATIVO';
    }
  });

  async function launchInstallFlow() {
    if (installedInSession) return;
    if (pendingPrompt) {
      const prompt = pendingPrompt;
      pendingPrompt = null;
      try {
        await prompt.prompt();
        const result = await prompt.userChoice;
        if (result?.outcome === 'accepted') {
          installHint.textContent = 'Instalação confirmada. Abra a Nativa FM pelo ícone do aplicativo.';
          return;
        }
        installHint.textContent = 'Você pode tentar novamente quando desejar.';
      } catch (_) {
        // segue para a ajuda abaixo
      }
    }
    showAssist();
  }

  installButton.addEventListener('click', launchInstallFlow);
  assistRetry.addEventListener('click', () => {
    assist.hidden = true;
    launchInstallFlow();
  });
  assistClose.addEventListener('click', closeAssist);
  assist.addEventListener('click', (event) => {
    if (event.target === assist) closeAssist();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !assist.hidden) closeAssist();
  });

  window.addEventListener('appinstalled', () => {
    installedInSession = true;
    pendingPrompt = null;
    installButton.disabled = true;
    installLabel.textContent = 'APLICATIVO INSTALADO';
    installHint.textContent = 'Agora abra a Nativa FM pelo ícone criado no seu dispositivo.';
    assist.hidden = true;
  });

  if (ios) {
    installHint.textContent = 'No iPhone, toque em instalar e siga as instruções rápidas para adicionar o app.';
    installLabel.textContent = 'INSTALAR NO IPHONE';
  } else if (windows) {
    installHint.textContent = 'No Windows, você pode instalar e abrir a Nativa FM em uma janela própria.';
    installLabel.textContent = 'INSTALAR NO WINDOWS';
  } else if (android) {
    installHint.textContent = 'No Android, a instalação pode acontecer com apenas um toque quando disponível.';
    installLabel.textContent = 'INSTALAR NO ANDROID';
  }

  const modeMedia = window.matchMedia && window.matchMedia('(display-mode: standalone)');
  if (modeMedia && modeMedia.addEventListener) {
    modeMedia.addEventListener('change', () => location.reload());
  }
})();
