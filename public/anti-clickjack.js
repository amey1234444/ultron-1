/**
 * Defense-in-depth clickjacking guard.
 *
 * The PRIMARY protection is server-side (X-Frame-Options: DENY and CSP
 * `frame-ancestors 'none'` in next.config.js). This script is an additional,
 * self-contained layer that travels with the page itself, so the app also
 * refuses to render if it is ever served somewhere the headers are missing.
 *
 * It hides the document by default when framed (defeats even sandboxed iframes
 * that block top-navigation) and, when possible, breaks out of the frame.
 */
(function () {
  try {
    if (window.top !== window.self) {
      var el = document.documentElement;
      if (el) el.style.display = 'none';
      try {
        window.top.location = window.self.location.href;
      } catch (e) {
        /* Cross-origin/sandboxed parent: can't navigate it — stay hidden. */
      }
    }
  } catch (e) {
    /* Reading window.top threw => we are inside a cross-origin frame. Hide. */
    if (document.documentElement) document.documentElement.style.display = 'none';
  }
})();
