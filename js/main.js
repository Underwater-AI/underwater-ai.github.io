/* ============================================================================
   UNDERWATER AI — ENTRY POINT
   Loads the page transition curtain, waits for assets, then reveals.
   Coordinates boot order across all modules.
   ============================================================================ */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // PROGRESS BAR — updates as 3D models load
  // ---------------------------------------------------------------------------
  const progressBar = document.getElementById('curtain-progress-bar');
  const progressText = document.getElementById('curtain-progress-text');
  const totalModels = 8; // fish, jellyfish, kelp, coral, seafloor, turtle, manta, submarine
  let loadedModels = 0;

  function updateProgress(pct, text) {
    if (progressBar) {
      progressBar.style.setProperty('--progress', pct + '%');
      // Update the ::after width via inline style on a real element
      const bar = progressBar.querySelector('span') || progressBar;
      bar.style.width = pct + '%';
    }
    if (progressText && text) progressText.textContent = text;
  }

  // Create the inner bar element for animation
  if (progressBar) {
    const inner = document.createElement('span');
    inner.style.cssText = 'display:block;height:100%;width:0%;background:linear-gradient(90deg,var(--c-cyan-400),var(--c-cyan-glow));border-radius:2px;transition:width 300ms ease;box-shadow:0 0 12px var(--c-cyan-400);';
    progressBar.innerHTML = '';
    progressBar.appendChild(inner);
  }

  function onModelLoaded(name) {
    loadedModels++;
    const pct = Math.min(100, Math.round((loadedModels / totalModels) * 100));
    updateProgress(pct, `Loading ${name}... (${loadedModels}/${totalModels})`);
    console.log(`[boot] Model loaded: ${name} (${loadedModels}/${totalModels})`);
    if (loadedModels >= totalModels) {
      updateProgress(100, 'Ready');
    }
  }

  // Listen for model load events
  window.addEventListener('underwater-model-loaded', (e) => {
    onModelLoaded(e.detail?.name || 'model');
  });

  // Fallback: poll for the ModelLoader state
  function pollModelLoader() {
    if (window.UnderwaterModelLoader) {
      const ml = window.UnderwaterModelLoader;
      ml.onProgress = (loaded, total) => {
        const names = ['fish', 'jellyfish', 'kelp', 'coral', 'seafloor', 'sea turtle', 'manta ray', 'submarine'];
        onModelLoaded(names[loaded - 1] || `model ${loaded}`);
      };
    }
  }
  // Check periodically until the scene script sets up ModelLoader
  const pollInterval = setInterval(() => {
    if (window.UnderwaterModelLoader) {
      clearInterval(pollInterval);
      pollModelLoader();
    }
  }, 200);
  // Stop polling after 10s regardless
  setTimeout(() => clearInterval(pollInterval), 10000);

  // ---------------------------------------------------------------------------
  // CURTAIN
  // ---------------------------------------------------------------------------
  function bootCurtain() {
    const curtain = document.querySelector('.curtain');
    if (!curtain) return;
    if (prefersReducedMotion) {
      curtain.style.display = 'none';
      return;
    }
    // Start with progress at 0
    updateProgress(0, 'Initializing 3D scene...');

    requestAnimationFrame(() => {
      const start = document.readyState === 'complete' ? 150 : 350;
      setTimeout(() => {
        // Wait until at least 1 model loads or 3s timeout, then reveal
        const revealCurtain = () => {
          curtain.classList.add('is-closing');
          setTimeout(() => {
            if (curtain.parentNode) curtain.remove();
          }, 800);
        };

        // Reveal after either: all models loaded, 3s timeout, or page load
        let revealed = false;
        function safe() { if (!revealed) { revealed = true; revealCurtain(); } }

        setTimeout(safe, 3000); // max wait 3s
        window.addEventListener('load', () => setTimeout(safe, 500));

        if (window.UnderwaterModelLoader) {
          window.UnderwaterModelLoader.onProgress = (loaded, total) => {
            const names = ['fish', 'jellyfish', 'kelp', 'coral', 'seafloor', 'sea turtle', 'manta ray', 'submarine'];
            onModelLoaded(names[loaded - 1] || `model ${loaded}`);
            if (loaded >= total) setTimeout(safe, 200);
          };
        }
      }, start);
    });
  }

  function start() {
    bootCurtain();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Expose tiny diagnostics
  window.__underwaterAI = {
    ready: false,
    bootTime: Date.now(),
  };
  window.addEventListener('load', () => {
    window.__underwaterAI.ready = true;
    window.__underwaterAI.bootMs = Date.now() - window.__underwaterAI.bootTime;
  });

  // Soft error reporting
  window.addEventListener('error', (e) => {
    console.error('[underwater-ai]', e.message, e.filename, e.lineno);
  });
})();
