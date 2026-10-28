// Living mood / sleep shapes: one animation loop draws the canvases that are on screen and stops when none
// are. Small shapes run at ~30 fps to save battery; with "reduce motion" every shape stays still.
import { drawMood } from './mood.js';
import { drawSleep } from './sleep.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const onScreen = new Set();
const io = new IntersectionObserver((list) => {
  for (const e of list) {
    if (e.isIntersecting) onScreen.add(e.target);
    else onScreen.delete(e.target);
  }
  start();
});
let frame = 0;
let last = 0;

/** Level shown: `canvas.level` (set live by the editors, may be fractional) or the data attribute; 0 = none. */
function draw(cv, tm) {
  const mood = 'mood' in cv.dataset;
  const level = cv.level ?? Number(mood ? cv.dataset.mood : cv.dataset.sleep);
  if (mood) drawMood(cv, level || 4, { faded: !level, tm });
  else drawSleep(cv, level || 3, { faded: !level, tm });
}

function tick(now) {
  frame = 0;
  for (const cv of onScreen) {
    if (!cv.isConnected) {
      onScreen.delete(cv);
      io.unobserve(cv);
    }
  }
  if (!onScreen.size) return;
  const editing = [...onScreen].some((cv) => cv.level != null);
  if (editing || now - last >= 32) {
    last = now;
    for (const cv of onScreen) draw(cv, now / 1000);
  }
  frame = requestAnimationFrame(tick);
}

function start() {
  if (!frame && onScreen.size && !reduced.matches) frame = requestAnimationFrame(tick);
}

/** Paint every canvas[data-mood] / canvas[data-sleep] in root now, then keep the visible ones alive. */
export function animateShapes(root) {
  for (const cv of root.querySelectorAll('canvas[data-mood], canvas[data-sleep]')) {
    draw(cv, 0);
    if (!reduced.matches) io.observe(cv);
  }
}

/** Immediate redraw after a level change (the loop is off when motion is reduced). */
export function redraw(cv) {
  draw(cv, reduced.matches ? 0 : performance.now() / 1000);
}
