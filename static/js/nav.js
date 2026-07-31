const BREAKPOINT_QUERY = '(max-width: 768px)';
const CLOSE_ANIMATION_MS = 250; // must match --duration-standard in theme-effects.css

const toggle = document.getElementById('site-nav-toggle');
const panel = document.getElementById('site-nav-panel');
const scrim = document.getElementById('site-nav-scrim');
const main = document.querySelector('main');

let isOpen = false;
let closeTimeoutId = null;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    closeMenu();
  }
}

function openMenu() {
  if (isOpen) return;
  isOpen = true;
  clearTimeout(closeTimeoutId);

  panel.classList.add('is-visible');
  scrim.classList.add('is-visible');
  void panel.offsetHeight; // force reflow so the opacity/transform transition runs from the closed state

  panel.classList.add('is-open');
  scrim.classList.add('is-open');

  toggle.setAttribute('aria-expanded', 'true');
  main.inert = true;
  document.body.style.overflow = 'hidden';

  const firstLink = panel.querySelector('a');
  if (firstLink) firstLink.focus();

  document.addEventListener('keydown', handleKeydown);
}

function closeMenu({ returnFocus = true } = {}) {
  if (!isOpen) return;
  isOpen = false;

  panel.classList.remove('is-open');
  scrim.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', handleKeydown);

  const delay = prefersReducedMotion() ? 0 : CLOSE_ANIMATION_MS;
  clearTimeout(closeTimeoutId);
  closeTimeoutId = setTimeout(() => {
    panel.classList.remove('is-visible');
    scrim.classList.remove('is-visible');
    main.inert = false;
    document.body.style.overflow = '';
  }, delay);

  if (returnFocus) toggle.focus();
}

toggle.addEventListener('click', () => {
  if (isOpen) {
    closeMenu();
  } else {
    openMenu();
  }
});

scrim.addEventListener('click', () => {
  closeMenu();
});

const breakpointQuery = window.matchMedia(BREAKPOINT_QUERY);
breakpointQuery.addEventListener('change', (event) => {
  if (!event.matches && isOpen) {
    closeMenu({ returnFocus: false });
  }
});
