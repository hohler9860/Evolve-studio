// Evolve Studio — landing.js
// Theme toggle, cursor glow, form submission. Small + dependency-free.

(() => {
  const root = document.documentElement;

  // ----- Theme (persisted) -----
  const stored = localStorage.getItem('evolve-theme');
  if (stored === 'light' || stored === 'dark') root.setAttribute('data-theme', stored);

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('evolve-theme', next);
      // update meta theme-color so iOS Safari status bar matches
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#0a0a0a' : '#fafafa');
    });
  }

  // ----- Cursor glow (desktop only) -----
  const glow = document.getElementById('cursorGlow');
  if (glow && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    let raf = null, x = 0, y = 0;
    window.addEventListener('mousemove', (e) => {
      x = e.clientX; y = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          glow.style.left = x + 'px';
          glow.style.top = y + 'px';
          raf = null;
        });
      }
    }, { passive: true });
  }

  // ----- Mobile menu (simple toggle) -----
  const menuBtn = document.getElementById('menuBtn');
  const navLinks = document.querySelector('.nav-links');
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      menuBtn.classList.toggle('open', open);
      if (open) {
        navLinks.style.display = 'flex';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '100%';
        navLinks.style.left = '0';
        navLinks.style.right = '0';
        navLinks.style.flexDirection = 'column';
        navLinks.style.background = 'var(--bg)';
        navLinks.style.borderTop = '1px solid var(--border)';
        navLinks.style.padding = '20px var(--gutter)';
        navLinks.style.gap = '14px';
      } else {
        navLinks.removeAttribute('style');
      }
    });
    // close on link click
    navLinks.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('open');
        menuBtn.classList.remove('open');
        navLinks.removeAttribute('style');
      }
    });
  }

  // ----- Reveal on scroll for sections (gentle) -----
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }) : null;
  if (io) {
    document.querySelectorAll('.section, .marquee, .work-card, .service, .price-card').forEach(el => io.observe(el));
  }

  // ----- Contact form -> /api/leads -----
  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const originalHTML = btn.innerHTML;
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.8s linear infinite">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        Sending…
      `;

      const data = {
        name: document.getElementById('name').value,
        business: document.getElementById('business').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        link: document.getElementById('link').value,
      };

      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success !== false) {
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Sent. Henry will reply within 24 hrs.
          `;
          btn.style.opacity = '1';
          form.reset();
        } else {
          btn.innerHTML = json.error || 'Something went wrong. Try again.';
          btn.style.opacity = '1';
          btn.disabled = false;
          setTimeout(() => { btn.innerHTML = originalHTML; }, 4000);
        }
      } catch (err) {
        btn.innerHTML = 'Network error. Please try again.';
        btn.style.opacity = '1';
        btn.disabled = false;
        setTimeout(() => { btn.innerHTML = originalHTML; }, 4000);
      }
    });
  }

  // ----- spin keyframes injection (for in-form spinner) -----
  const style = document.createElement('style');
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
})();
