// ============================================
// evolve studio — Interactions + Parallax v2
// ============================================

// --- Nav scroll effect ---
const nav = document.querySelector('.nav');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 40) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
  lastScroll = scrollY;
});

// --- Mobile menu ---
const menuBtn = document.querySelector('.mobile-menu-btn');
const mobileMenu = document.querySelector('.mobile-menu');

menuBtn.addEventListener('click', () => {
  menuBtn.classList.toggle('active');
  mobileMenu.classList.toggle('show');

  if (mobileMenu.classList.contains('show')) {
    requestAnimationFrame(() => mobileMenu.classList.add('open'));
  } else {
    mobileMenu.classList.remove('open');
  }
});

mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    menuBtn.classList.remove('active');
    mobileMenu.classList.remove('show', 'open');
  });
});

// --- Scroll Reveal Observer ---
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -60px 0px'
});

document.querySelectorAll('.anim-reveal, .anim-slide-right, .anim-slide-left, .anim-scale').forEach(el => {
  revealObserver.observe(el);
});

// --- Staggered reveals for grid items ---
const staggerObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const children = entry.target.querySelectorAll('.anim-reveal, .glass-card');
      children.forEach((child, i) => {
        child.style.transitionDelay = `${i * 0.1}s`;
        child.classList.add('visible');
      });
      staggerObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px'
});

document.querySelectorAll('.features-grid, .results-grid, .pricing-grid, .steps-timeline, .faq-list, .about-grid').forEach(grid => {
  staggerObserver.observe(grid);
});

// ============================================
// PARALLAX SCROLLING ENGINE v2
// Clean, aligned, no drift between siblings
// ============================================
const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.innerWidth < 768;

if (!isReducedMotion && !isMobile) {

  const wh = window.innerHeight;
  let scrollY = 0;
  let ticking = false;

  // Helper: get element's distance from viewport center as -1 to 1
  function getViewportProgress(el) {
    const rect = el.getBoundingClientRect();
    const elCenter = rect.top + rect.height / 2;
    // -1 when element center is at top of viewport, 0 at center, +1 at bottom
    return (elCenter - wh / 2) / (wh / 2);
  }

  // Helper: clamp
  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  // Helper: check if element is near viewport
  function isNear(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > -300 && rect.top < wh + 300;
  }

  // ------------------------------------------------
  // Register parallax layers
  // Each layer: { el, update(scrollY, wh) }
  // ------------------------------------------------
  const layers = [];

  // --- Background orbs: slow drift tied to scroll ---
  document.querySelectorAll('.orb').forEach((orb, i) => {
    const speed = 0.02 + i * 0.01;
    layers.push({
      el: orb,
      update() {
        const y = scrollY * speed;
        orb.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    });
  });

  // --- Hero content: uniform fade-out + lift on scroll ---
  const heroEls = [
    { sel: '.hero-eyebrow', speed: -0.12 },
    { sel: '.hero h1', speed: -0.1 },
    { sel: '.hero-sub', speed: -0.08 },
    { sel: '.hero-actions', speed: -0.06 },
    { sel: '.hero-proof', speed: -0.04 }
  ];

  heroEls.forEach(({ sel, speed }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    layers.push({
      el,
      update() {
        const y = scrollY * speed;
        // Fade from 1 to 0 between scroll 0 and 700
        const opacity = clamp(1 - scrollY / 700, 0, 1);
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        el.style.opacity = opacity;
      }
    });
  });

  // --- Float cards in hero: gentle drift ---
  document.querySelectorAll('.float-card').forEach((card, i) => {
    const speed = -0.06 - i * 0.02;
    layers.push({
      el: card,
      update() {
        const y = scrollY * speed;
        const opacity = clamp(1 - scrollY / 600, 0, 1);
        card.style.transform = `translate3d(0, ${y}px, 0)`;
        card.style.opacity = opacity;
      }
    });
  });

  // --- Section-level parallax: uniform for all children ---
  // Each section shifts as a whole so nothing inside drifts apart
  function addSectionParallax(selector, speed) {
    const el = document.querySelector(selector);
    if (!el) return;
    layers.push({
      el,
      update() {
        if (!isNear(el)) return;
        const progress = getViewportProgress(el);
        const y = progress * speed;
        el.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    });
  }

  // Section headers get a subtle lift as they enter
  document.querySelectorAll('.section-header').forEach(header => {
    layers.push({
      el: header,
      update() {
        if (!isNear(header)) return;
        const progress = getViewportProgress(header);
        const y = progress * 20;
        header.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    });
  });

  // Problem stats card
  addSectionParallax('.problem-stats', 25);

  // Steps: uniform shift for the whole timeline, not individual dots
  addSectionParallax('.steps-timeline', 15);

  // Features: the entire grid moves as one unit
  addSectionParallax('.features-grid', 18);

  // Results grid
  addSectionParallax('.results-grid', 18);

  // Portfolio card
  addSectionParallax('.portfolio-grid', 15);

  // Pricing: the entire grid moves together (no individual card drift)
  addSectionParallax('.pricing-grid', 20);

  // About grid
  addSectionParallax('.about-grid', 15);
  addSectionParallax('.about-why', 12);

  // CTA
  addSectionParallax('.cta-glass', 18);

  // --- Gradient text shimmer tied to scroll position ---
  document.querySelectorAll('.gradient-text').forEach(el => {
    layers.push({
      el,
      update() {
        if (!isNear(el)) return;
        const rect = el.getBoundingClientRect();
        const progress = (rect.top / wh) * 100;
        el.style.backgroundPosition = `${progress}% 50%`;
      }
    });
  });

  // --- Main scroll handler ---
  function updateParallax() {
    scrollY = window.scrollY;
    layers.forEach(layer => layer.update());
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }, { passive: true });

  // Initial
  updateParallax();

  // --- Dynamic marquee speed ---
  const marqueeContent = document.querySelector('.marquee-content');
  if (marqueeContent) {
    window.addEventListener('scroll', () => {
      const scrollSpeed = Math.abs(window.scrollY - lastScroll);
      const duration = Math.max(10, 30 - scrollSpeed * 0.5);
      marqueeContent.style.animationDuration = `${duration}s`;
    }, { passive: true });
  }

} // end parallax block


// --- Glass card tilt on mouse (does NOT use transform, uses a wrapper approach) ---
document.querySelectorAll('.glass-card').forEach(card => {
  // Skip cards inside pricing grid to avoid jank
  if (card.closest('.pricing-grid') || card.closest('.faq-list')) return;

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -2;
    const rotateY = ((x - centerX) / centerX) * 2;

    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    card.style.setProperty('--shine-x', `${(x / rect.width) * 100}%`);
    card.style.setProperty('--shine-y', `${(y / rect.height) * 100}%`);
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    card.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => {
      card.style.transition = '';
    }, 500);
  });
});

// --- Counter animation for stat numbers ---
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el = entry.target;
      const text = el.textContent.trim();

      const match = text.match(/^([+$]?)(\d+)(.*)$/);
      if (match) {
        const prefix = match[1];
        const num = parseInt(match[2]);
        const suffix = match[3];
        el.textContent = prefix + '0' + suffix;

        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = Math.round(num * eased);
          el.textContent = prefix + current + suffix;
          if (progress < 1) requestAnimationFrame(update);
        }

        requestAnimationFrame(update);
      }

      counterObserver.unobserve(el);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.problem-stat-number, .result-metric').forEach(el => {
  counterObserver.observe(el);
});

// --- FAQ Accordion ---
document.querySelectorAll('.faq-item').forEach(item => {
  const question = item.querySelector('.faq-question');
  question.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(other => other.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// --- Smooth scroll for anchor links ---
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const navHeight = nav.offsetHeight;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// --- Form submission with real backend ---
const form = document.getElementById('contact-form');
if (form) {
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(spinStyle);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = form.querySelector('button[type="submit"]');
    const originalHTML = btn.innerHTML;

    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      </svg>
      Sending...
    `;
    btn.style.opacity = '0.8';
    btn.disabled = true;

    const data = {
      name: document.getElementById('name').value,
      business: document.getElementById('business').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      link: document.getElementById('link').value
    };

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (res.ok && result.success) {
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          Mockup requested!
        `;
        btn.style.background = 'linear-gradient(135deg, #2563eb, #38bdf8)';
        btn.style.color = 'white';
        btn.style.opacity = '1';
        form.reset();
        createConfetti();
      } else {
        btn.innerHTML = result.error || 'Something went wrong. Try again.';
        btn.style.background = 'rgba(239, 68, 68, 0.15)';
        btn.style.color = '#f87171';
        btn.style.opacity = '1';
      }
    } catch (err) {
      btn.innerHTML = 'Network error. Please try again.';
      btn.style.background = 'rgba(239, 68, 68, 0.15)';
      btn.style.color = '#f87171';
      btn.style.opacity = '1';
    }

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      btn.style.color = '';
      btn.disabled = false;
    }, 4000);
  });
}

// --- Confetti effect ---
function createConfetti() {
  const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#38bdf8', '#34d399', '#f59e0b'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  for (let i = 0; i < 60; i++) {
    const confetti = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const size = Math.random() * 8 + 4;
    const rotation = Math.random() * 360;

    confetti.style.cssText = `
      position: absolute;
      top: -10px;
      left: ${left}%;
      width: ${size}px;
      height: ${size * 0.6}px;
      background: ${color};
      border-radius: 2px;
      animation: confettiFall ${2 + Math.random()}s ease-in ${delay}s forwards;
      transform: rotate(${rotation}deg);
    `;

    container.appendChild(confetti);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes confettiFall {
      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(${720 + Math.random() * 360}deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => container.remove(), 4000);
}

// --- Magnetic hover for CTAs ---
document.querySelectorAll('.btn-primary, .nav-cta').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
    btn.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
    setTimeout(() => btn.style.transition = '', 400);
  });
});

// --- Text reveal animation for hero ---
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.querySelectorAll('.hero .anim-reveal').forEach(el => {
      el.classList.add('visible');
    });
  }, 200);
});
