/* Visual effects: floating water bubbles, drifting blobs, waves, collapsible docs. */
(function () {
  const layer = document.createElement('div');
  layer.id = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  const wave = (cls, c) => `<svg class="fx-waves ${cls}" viewBox="0 0 1440 120" preserveAspectRatio="none"><path fill="${c}" d="M0,60 C120,100 240,20 360,60 C480,100 600,20 720,60 C840,100 960,20 1080,60 C1200,100 1320,20 1440,60 L1440,120 L0,120 Z"/></svg>`;
  layer.innerHTML = '<div class="fx-blob b1"></div><div class="fx-blob b2"></div><div class="fx-blob b3"></div>' +
    '<canvas id="fx-bubbles"></canvas>' + wave('w1', 'rgba(45,212,191,.35)') + wave('w2', 'rgba(14,165,233,.30)');
  document.body.prepend(layer);

  const cv = document.getElementById('fx-bubbles');
  const ctx = cv.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, bubbles = [], raf = null;

  function size() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
  function make(initial) {
    return { x: Math.random() * W, y: initial ? Math.random() * H : H + 20,
      r: 3 + Math.random() * 12, v: .25 + Math.random() * .7, sway: Math.random() * Math.PI * 2, a: .15 + Math.random() * .25 };
  }
  function init() { size(); bubbles = Array.from({ length: innerWidth < 760 ? 18 : 36 }, () => make(true)); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    bubbles.forEach((b, i) => {
      b.y -= b.v; b.sway += .015; b.x += Math.sin(b.sway) * .4;
      if (b.y < -20) bubbles[i] = make(false);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283);
      ctx.fillStyle = `rgba(20,184,166,${b.a * .35})`; ctx.fill();
      ctx.strokeStyle = `rgba(13,148,136,${b.a})`; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x - b.r * .3, b.y - b.r * .3, b.r * .25, 0, 6.283);
      ctx.fillStyle = `rgba(255,255,255,${b.a + .2})`; ctx.fill();
    });
    raf = requestAnimationFrame(draw);
  }
  init();
  addEventListener('resize', size);
  if (!reduce) {
    draw();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; } else if (!raf) draw();
    });
  }

  // Assumptions card: collapsed by default, tap header to expand
  function setupDocs() {
    document.querySelectorAll('.doc-card').forEach(c => {
      c.classList.add('collapsed');
      const hd = c.querySelector('.card-header');
      if (hd) hd.addEventListener('click', () => c.classList.toggle('collapsed'));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDocs); else setupDocs();
})();
