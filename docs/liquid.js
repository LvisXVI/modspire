/* Liquid Glass page runtime: launch animation, reveal-on-scroll, pointer light,
   mobile menu, showcase tabs and latest-release lookup. No dependencies. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  doc.classList.remove('js-off');

  // ----- Launch animation -----
  // Plays on a fresh visit. Navigating between the sibling project pages uses
  // the cross-document view transition instead, so the intro is skipped there.
  const intro = document.getElementById('lg-intro');
  const fromSibling = (() => {
    try { return document.referrer && new URL(document.referrer).origin === location.origin; }
    catch { return false; }
  })();
  const ready = () => doc.classList.add('ready');
  if (!intro || reduced || fromSibling) {
    intro?.remove();
    ready();
  } else {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      intro.classList.add('out');
      setTimeout(ready, 260);
      setTimeout(() => intro.remove(), 900);
    };
    const word = intro.querySelector('.intro-word');
    if (word) word.innerHTML = [...word.textContent].map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
    const minTime = new Promise(r => setTimeout(r, 1750));
    const loaded = new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, {once: true})));
    Promise.all([minTime, Promise.race([loaded, new Promise(r => setTimeout(r, 2600))])]).then(finish);
    intro.addEventListener('click', finish);
    addEventListener('keydown', finish, {once: true});
  }

  // ----- Reveal on scroll -----
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, {rootMargin: '0px 0px -8% 0px', threshold: .08});
    revealTargets.forEach(el => io.observe(el));
  } else revealTargets.forEach(el => el.classList.add('is-in'));

  // ----- Pointer light on glass + scroll parallax -----
  addEventListener('pointermove', e => {
    const el = e.target.closest?.('.glass');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, {passive: true});
  if (!reduced) {
    let ticking = false;
    addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        doc.style.setProperty('--scroll', Math.min(1, scrollY / (doc.scrollHeight - innerHeight || 1)).toFixed(4));
        ticking = false;
      });
    }, {passive: true});
  }

  // ----- Mobile menu -----
  const nav = document.querySelector('.lg-nav');
  const menu = nav?.querySelector('.menu-btn');
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => {
    nav.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false');
  }));

  // Close the mobile navigation without leaving keyboard focus hidden.
  nav?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      nav.classList.remove('open');
      menu?.setAttribute('aria-expanded', 'false');
      menu?.focus();
    }
  });

  // ----- Active section in nav -----
  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  if (navLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(navLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const so = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        navLinks.forEach(a => a.removeAttribute('aria-current'));
        map.get(e.target.id)?.setAttribute('aria-current', 'true');
      }
    }, {rootMargin: '-45% 0px -50% 0px'});
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) so.observe(s); });
  }

  // ----- Showcase tabs (keyboard accessible, auto-advance until touched) -----
  document.querySelectorAll('[data-showcase]').forEach(root => {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const img = root.querySelector('.stage img');
    const caption = root.querySelector('[data-caption]');
    let index = Math.max(0, tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    let timer = null;
    const apply = (i, animate = false) => {
      index = (i + tabs.length) % tabs.length;
      tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === index)); t.tabIndex = n === index ? 0 : -1; });
      const t = tabs[index];
      const swap = () => {
        img.src = t.dataset.src; img.alt = t.dataset.alt || '';
        if (caption) caption.textContent = t.dataset.caption || '';
      };
      if (animate && document.startViewTransition && !reduced) {
        doc.classList.add('vt-local');
        document.startViewTransition(swap).finished.finally(() => doc.classList.remove('vt-local'));
      }
      else { swap(); img.classList.remove('swap-in'); void img.offsetWidth; img.classList.add('swap-in'); }
    };
    const stop = () => { clearInterval(timer); timer = null; root.classList.remove('autoplay'); };
    tabs.forEach((t, n) => {
      t.addEventListener('click', () => { stop(); apply(n, true); });
      t.addEventListener('keydown', e => {
        const k = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1}[e.key];
        if (k) { e.preventDefault(); stop(); apply(index + k, true); tabs[index].focus(); }
      });
    });
    tabs.forEach(t => { const pre = new Image(); pre.src = t.dataset.src; });
    if (!reduced) {
      root.classList.add('autoplay');
      const restartBar = () => { root.classList.remove('autoplay'); void root.offsetWidth; root.classList.add('autoplay'); };
      timer = setInterval(() => { apply(index + 1); restartBar(); }, 7000);
      root.addEventListener('pointerenter', stop, {once: true});
    }
  });

  // ----- Latest release (fills [data-release-*] elements) -----
  const repo = document.body.dataset.repo;
  const pattern = document.body.dataset.asset ? new RegExp(document.body.dataset.asset, 'i') : null;
  if (repo && document.querySelector('[data-release-version],[data-release-download]')) {
    fetch(`https://api.github.com/repos/${repo}/releases/latest`, {headers: {Accept: 'application/vnd.github+json'}})
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(rel => {
        const asset = pattern ? rel.assets.find(a => pattern.test(a.name)) : rel.assets[0];
        const mb = asset ? `${(asset.size / 1048576).toFixed(0)} MB` : '';
        const date = new Intl.DateTimeFormat(doc.lang || 'en', {dateStyle: 'medium'}).format(new Date(rel.published_at));
        document.querySelectorAll('[data-release-version]').forEach(el => { el.textContent = rel.tag_name.replace(/^v/, ''); });
        document.querySelectorAll('[data-release-size]').forEach(el => { if (mb) el.textContent = mb; });
        document.querySelectorAll('[data-release-date]').forEach(el => { el.textContent = date; });
        document.querySelectorAll('[data-release-name]').forEach(el => { if (asset) el.textContent = asset.name; });
        if (asset) document.querySelectorAll('[data-release-download]').forEach(el => { el.href = asset.browser_download_url; });
      })
      .catch(() => { /* static fallbacks in the markup stay in place */ });
  }
})();
