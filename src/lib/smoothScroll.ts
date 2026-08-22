/**
 * Inertial wheel scrolling for the long-form pages.
 *
 * What this is
 * ------------
 * A ~90-line replacement for Lenis. It intercepts the wheel, keeps its own
 * target scroll position, and eases the document toward it on rAF, so a wheel
 * notch glides to a stop instead of jumping 100px and freezing. That glide is
 * what people mean when they ask for scrolling to feel premium; `scroll-behavior:
 * smooth` does not do it, because that property never sees the wheel.
 *
 * Where it runs, and where it deliberately does not
 * -------------------------------------------------
 * Marketing pages only. The console is excluded on purpose, and not from
 * caution — easing is actively wrong there:
 *
 *   - it is a fixed-height shell whose scrolling happens in nested containers,
 *     not on the document, so there is nothing here to ease;
 *   - the plant view owns the wheel for camera zoom, and an interceptor that
 *     calls `preventDefault` would eat it;
 *   - dense tables are read by position. A row you are trying to land on
 *     should stop when the wheel stops.
 *
 * When it switches itself off
 * ---------------------------
 *   - `prefers-reduced-motion: reduce` — eased scrolling is exactly the kind of
 *     large-field motion that setting exists to suppress;
 *   - coarse pointers — touch already has momentum, and layering a second
 *     easing on top of the platform's is what makes hijacked pages feel like
 *     they are underwater;
 *   - any wheel event over a nested scroll container, so a scrollable panel
 *     inside a page still scrolls itself natively;
 *   - `ctrl`/`meta` held, which is browser zoom, not scrolling.
 *
 * Tuning
 * ------
 * `LERP` is the fraction of the remaining distance covered per 60fps frame.
 * Higher is tighter and more responsive; lower is floatier. 0.16 is
 * deliberately toward the responsive end — the common failure of these
 * libraries is a trackpad that feels laggy, and a trackpad already sends a
 * stream of small deltas that a slow lerp turns to soup. If it still feels too
 * loose on your hardware, raise it; at 1 the easing is off entirely and this
 * behaves like a native scroller.
 */

const LERP = 0.16;
/** Below this many pixels from target, snap and stop the loop. */
const EPSILON = 0.4;
/** Wheel deltas arrive in lines or pages on some platforms; normalise to px. */
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 800;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/** Pixels of wheel movement, whatever unit the platform reported it in. */
function deltaPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT;
  if (event.deltaMode === 2) return event.deltaY * PAGE_HEIGHT;
  return event.deltaY;
}

/**
 * Walks up from the wheel's target looking for something that scrolls itself.
 *
 * Without this, a scrollable panel inside a marketing page would have its wheel
 * stolen by the document scroller and become unusable — the classic bug in
 * every hand-rolled version of this.
 */
function hasOwnScroller(start: EventTarget | null, root: HTMLElement): boolean {
  let node = start instanceof Element ? start : null;
  // Stop at `body`, not just at `html`. `body` carries `overflow-x: hidden`
  // (global.css clips the page horizontally there), and a box with one axis
  // hidden and the other visible computes the visible axis to `auto` — so
  // `getComputedStyle(body).overflowY` reads "auto" on every marketing page.
  // The used value is still `visible`, because the root propagates body's
  // overflow to the viewport, but `getComputedStyle` reports the computed
  // value and this walk cannot see the difference. Left in, `body` matched on
  // the first step of every wheel event, the function returned true every
  // time, and the eased scrolling below never ran once.
  while (node && node !== root && node !== document.body) {
    const style = window.getComputedStyle(node);
    const scrollsY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollsY && node.scrollHeight > node.clientHeight + 1) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Starts inertial wheel scrolling on the document.
 *
 * Returns a teardown function. Safe to call on the server (it no-ops) and safe
 * to call twice — the second call's teardown removes the second listener set.
 */
export function startSmoothScroll(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (prefersReducedMotion() || isCoarsePointer()) return () => {};

  const root = document.documentElement;
  let target = window.scrollY;
  let frame = 0;
  let animating = false;
  let last = 0;
  /** Where the page was on the previous frame, for the stall check in `tick`. */
  let previous = Number.NaN;

  const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);

  /**
   * The easing below drives the page with one `scrollTo` per frame, and
   * global.css sets `scroll-behavior: smooth` on the root so that anchor jumps
   * ease. Those two cannot both be true at once: under `smooth`, every
   * `scrollTo` starts a fresh ~300ms browser animation, and a call on the next
   * frame aborts it and starts another before it has travelled a pixel. The
   * page ends up crawling, or not moving at all.
   *
   * So the root's scroll behaviour is suspended for exactly as long as a wheel
   * run lasts — two style writes per gesture — and restored the moment it
   * settles, which leaves anchors and `scrollIntoView` eased as intended.
   */
  const suspendCssEasing = () => {
    root.style.scrollBehavior = 'auto';
  };
  const restoreCssEasing = () => {
    root.style.scrollBehavior = '';
  };

  const tick = (now: number) => {
    const current = window.scrollY;
    const distance = target - current;

    // Two ways a run ends, and the second one is not optional.
    //
    //   1. It arrived — within EPSILON of the target.
    //   2. It cannot arrive. The scroll offset a browser stores is quantised,
    //      so a target of 600 can come to rest at 599 and stay there: the
    //      distance never falls under EPSILON, the loop never exits, and a rAF
    //      spins for the rest of the session with the root pinned to
    //      `scroll-behavior: auto`. Observed on /home before this check
    //      existed. If a frame moved the page less than a quarter pixel and
    //      there is under 2px left to go, this is as close as it gets.
    const stalled = Math.abs(current - previous) < 0.25 && Math.abs(distance) < 2;
    previous = current;

    if (Math.abs(distance) < EPSILON || stalled) {
      if (!stalled) window.scrollTo(0, target);
      // Re-seed from where the page actually is, so a residual pixel the
      // scroller refused to travel is not carried into the next wheel notch.
      target = window.scrollY;
      animating = false;
      frame = 0;
      restoreCssEasing();
      return;
    }

    // `LERP` is defined per 60fps frame, so on a 120Hz display a raw
    // `distance * LERP` would arrive twice as fast and the whole page would
    // feel different on different hardware. Compounding it over the elapsed
    // frame count is the frame-rate-independent form of the same easing. The
    // clamp stops a backgrounded tab from resuming with one enormous jump.
    const elapsed = last === 0 ? 1 : Math.min(4, (now - last) / (1000 / 60));
    last = now;
    const factor = 1 - (1 - LERP) ** elapsed;

    window.scrollTo(0, current + distance * factor);
    frame = window.requestAnimationFrame(tick);
  };

  const onWheel = (event: WheelEvent) => {
    // Browser zoom, not scrolling.
    if (event.ctrlKey || event.metaKey) return;
    // A panel inside the page wants this wheel more than the page does.
    if (hasOwnScroller(event.target, root)) return;
    // Horizontal intent — carousels, code blocks — is not ours.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    event.preventDefault();
    target = Math.min(maxScroll(), Math.max(0, target + deltaPixels(event)));

    if (!animating) {
      animating = true;
      last = 0;
      previous = Number.NaN;
      suspendCssEasing();
      frame = window.requestAnimationFrame(tick);
    }
  };

  /**
   * Anything that is not the wheel — a keyboard PageDown, a scrollbar drag, an
   * anchor jump, the browser restoring a position — moves the page without
   * telling us. Re-seeding the target while idle keeps the next wheel notch
   * continuing from where the page actually is rather than snapping back to
   * where we last left it.
   */
  const onScroll = () => {
    if (!animating) target = window.scrollY;
  };

  const onResize = () => {
    target = Math.min(maxScroll(), target);
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    // Navigating away mid-glide must not leave the root pinned to `auto`, or
    // the next page's anchor jumps would silently stop easing.
    restoreCssEasing();
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
  };
}
