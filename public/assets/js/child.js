/**
 * ============================================================================
 * PREMIUM ANCHOR + HERO NAVIGATION SYSTEM (FINAL SPEC)
 * ============================================================================
 *
 * PURPOSE
 * -------
 * This file implements a unified, cross-platform anchor navigation system
 * with pixel-perfect behavior across:
 *
 *   • Desktop & Laptop browsers
 *   • Android browsers
 *   • iOS Safari (including deep hash links)
 *
 * It supports:
 *   • HERO anchors (Swiper slider-based navigation)
 *   • NON-HERO anchors (standard page sections)
 *   • SAME-PAGE and CROSS-PAGE navigation
 *
 * And guarantees:
 *   • No headings covered by fixed headers
 *   • No “double jump” or correction nudges
 *   • Smooth scrolling everywhere
 *
 *
 * CORE CONCEPTS
 * -------------
 *
 * 1) HERO NAVIGATION (SPECIAL CASE)
 *    ------------------------------
 *    • Hero sections live inside a Swiper slider.
 *    • They MUST be navigated via query param:
 *
 *        /?slide=hero-section-id
 *
 *    • DO NOT use #hash for hero navigation.
 *    • This avoids conflicts with native anchor scrolling.
 *
 *    ✔ Same-page hero clicks:
 *        - Prevent default
 *        - Slide Swiper
 *        - Rewrite URL to ?slide=...
 *
 *    ✔ Cross-page hero clicks:
 *        - Navigate directly to /?slide=...
 *        - Handled on page load
 *
 *
 * 2) NON-HERO ANCHOR NAVIGATION (MAIN SYSTEM)
 *    ---------------------------------------
 *    All non-hero anchors use a TRUE OFFSET strategy:
 *
 *      • 200px offset the FIRST time an anchor is visited
 *      • 100px offset AFTER that anchor has been “seen”
 *
 *    This is PER-ANCHOR, not global.
 *
 *    Meaning:
 *      - Each anchor starts fresh (200px)
 *      - Once scrolled to or passed, it becomes normalized (100px)
 *      - Other anchors remain fresh until seen
 *
 *
 * 3) CSS RESPONSIBILITIES
 *    --------------------
 *    CSS is responsible ONLY for:
 *
 *      • Smooth scrolling
 *      • Safe default offset for native hash landings
 *
 *    Required CSS (DO NOT REMOVE):
 *
 *      html {
 *        scroll-behavior: smooth;
 *        scroll-padding-top: 200px;  // TRUE fresh landing offset
 *      }
 *
 *      section[id],
 *      [id][data-anchor],
 *      h1[id], h2[id], h3[id], h4[id], h5[id] {
 *        scroll-margin-top: 0;
 *      }
 *
 *    ⚠️ JS does ALL offset math for same-page clicks.
 *
 *
 * 4) PER-ANCHOR OFFSET CONTROLLER
 *    ----------------------------
 *    Tracks which anchors have been “seen”.
 *
 *    An anchor is considered SEEN when:
 *      • It enters the viewport (IntersectionObserver)
 *      • It is scrolled to programmatically
 *      • It is passed during a deep-link landing (iOS fix)
 *
 *    Exposed APIs:
 *
 *      window.__ANCHOR_GET_OFFSET__(id)
 *        → returns 200 or 100
 *
 *      window.__ANCHOR_MARK_SEEN_LATER__(id)
 *        → marks seen after scroll finishes
 *
 *      window.__ANCHOR_MARK_SEEN_NOW__(id)
 *        → immediate mark
 *
 *      window.__ANCHOR_MARK_PASSED_UP_TO_Y__(y)
 *        → marks all anchors ABOVE a Y position as seen
 *
 *
 * 5) iOS SAFARI DEEP-HASH TAKEOVER (CRITICAL)
 *    ---------------------------------------
 *    Safari has bugs with deep hash scrolling:
 *      • Overshoots targets
 *      • Misses IntersectionObserver events
 *      • Accumulates phantom offsets
 *
 *    For iOS ONLY:
 *      • Native hash jump is canceled
 *      • We manually scroll with 200px offset
 *      • All anchors ABOVE the target are marked as SEEN
 *      • Target is marked seen after scroll
 *
 *    This preserves:
 *      ✔ Smooth scrolling
 *      ✔ Correct 200px fresh landing
 *      ✔ Correct normalization after landing
 *
 *
 * 6) CLICK HANDLER RULES (VERY IMPORTANT)
 *    -----------------------------------
 *
 *    • External links → ignored
 *    • href="#" / javascript: / mailto: → ignored
 *    • Modifier clicks (cmd/ctrl/shift/middle) → ignored
 *
 *    NON-HERO:
 *      ✔ Cross-page (#hash):
 *          - Let browser navigate
 *          - CSS + iOS takeover handle offset
 *
 *      ✔ Same-page:
 *          - Prevent default
 *          - ONE intentional scroll using per-anchor offset
 *          - NO correction / nudge scrolls
 *
 *    HERO:
 *      ✔ Same-page:
 *          - Slide Swiper
 *          - Rewrite URL to ?slide=
 *
 *      ✔ Cross-page:
 *          - Navigate to /?slide=
 *
 *
 * 7) UI / MODAL SAFETY
 *    -----------------
 *    • href="#" links (WeChat modal, etc.) are ignored safely
 *    • External deep links (Signal, WhatsApp, etc.) are untouched
 *
 *
 * ⚠️ MAINTENANCE WARNINGS
 * ----------------------
 * ❌ Do NOT add scroll-margin-top offsets
 * ❌ Do NOT add correction “nudge” scrolls
 * ❌ Do NOT convert hero links to hashes
 * ❌ Do NOT remove scroll-padding-top:200px
 *
 * ✔ If you add new anchor elements, update:
 *     - IntersectionObserver selectors
 *     - Passed-anchor marking logic
 *
 *
 * This system is intentionally precise.
 * Change behavior only if you understand ALL layers.
 *
 *
 * NOTE (Swiper init ownership)
 * ---------------------------
 * Swiper sliders (especially the Testimonial thumbs+content sync) are initialized in main.js.
 * DO NOT initialize Swiper again in this global child.js for the same selectors, or you'll get
 * double-init bugs (frozen sliders, broken touch, desync).
 *
 * If you ever add new Swiper code in child.js, ALWAYS guard it like:
 *   const el = document.querySelector(".some-swiper");
 *   if (el && !el.swiper) new Swiper(el, {...});
 *
 * safeInitSwiper() exists in main.js as a helper to prevent double-init; it is not used here.
 *
 *
 * ============================================================================
 */

/**
 * ============================================================================
 * QUICK MAP (for future edits)
 * ============================================================================
 *
 * OWNERSHIP / WHERE THINGS LIVE
 * - main.js:
 *   • Swiper initializations (hero slider, yoga slider, testimonials sync)
 *   • Theme UI behaviors (offcanvas open/close, sticky header, venobox init, etc.)
 *   • AOS init (reduced-motion safe)
 *
 * - child.js (GLOBAL on HubSpot):
 *   • Anchor + Hero navigation system (hash + ?slide routing)
 *   • iOS deep-hash takeover fix
 *   • Offcanvas “close on anchor click” helper (does NOT init the menu)
 *   • Chevron scroll-down logic
 *   • Tracking + WeChat modal logic
 *   • /chat/fallback deep-link helper ONLY (path scoped)
 *
 * HARD RULES
 * - Do NOT init Swiper in child.js for selectors used in main.js.
 * - Any new DOM work in child.js must be guarded (element existence checks).
 *
 * ============================================================================
 */


// =========================
// GLOBAL HELPERS
// =========================
function shouldIgnoreAnchor(e, href) {
  const h = (href || '').trim();
  if (!h) return true;
  if (h === '#' || h.startsWith('javascript:') || h.startsWith('mailto:')) return true;
  // respect new tab / modifier intent
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return true;
  return false;
}

function getHeaderHeightFallback100() {
  const header = document.querySelector('header');
  return header ? header.offsetHeight : 100;
}


// =========================
// PER-ANCHOR OFFSET CONTROLLER (true per-anchor fresh)
// Goal:
// - Each anchor starts "fresh" => 200px
// - Once that anchor is seen in viewport => 100px forever (for that anchor only)
// =========================
(function () {
  const OFFSET_FRESH = 200;
  const OFFSET_SEEN  = 100;
  const MARK_DELAY_MS = 450;

  const seen = new Set();

  function normId(id) {
    if (!id) return '';
    try { return decodeURIComponent(id); } catch (_) { return id; }
  }

  function markSeen(id) {
    const n = normId(id);
    if (n) seen.add(n);
  }

  // ✅ Immediate "is it already visible right now?" check (helps some iOS timing gaps)
  function markSeenIfInViewport(el) {
    if (!el || !el.id) return;
    const r = el.getBoundingClientRect();
    const visible = r.top < (window.innerHeight * 0.75) && r.bottom > 0;
    if (visible) markSeen(el.id);
  }

  function initObserver() {
    const targets = Array.from(document.querySelectorAll(
      'section[id], [id][data-anchor], h1[id], h2[id], h3[id], h4[id], h5[id]'
    ));
    if (!targets.length) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach(ent => {
        if (ent.isIntersecting && ent.target && ent.target.id) {
          markSeen(ent.target.id);
        }
      });
    }, { threshold: 0.25 });

    targets.forEach(el => io.observe(el));
  }

  document.addEventListener('DOMContentLoaded', initObserver);

  // ✅ Expose API used by click handler
  window.__ANCHOR_GET_OFFSET__ = function (id) {
    const n = normId(id);
    return seen.has(n) ? OFFSET_SEEN : OFFSET_FRESH;
  };

  window.__ANCHOR_MARK_SEEN_LATER__ = function (id) {
    setTimeout(() => markSeen(id), MARK_DELAY_MS);
  };

  // ✅ NEW: mark an anchor seen immediately (no delay)
  window.__ANCHOR_MARK_SEEN_NOW__ = function (id) {
    markSeen(id);
  };

  // ✅ NEW: mark anchors "passed" (above target Y) as seen
  // This is the real iOS cross-page deep-link fix.
  window.__ANCHOR_MARK_PASSED_UP_TO_Y__ = function (y) {
    if (!Number.isFinite(y)) return;

    const targets = Array.from(document.querySelectorAll(
      'section[id], [id][data-anchor], h1[id], h2[id], h3[id], h4[id], h5[id]'
    ));

    targets.forEach(el => {
      if (!el || !el.id) return;
      const absTop = el.getBoundingClientRect().top + window.scrollY;
      // strictly ABOVE the target line
      if (absTop < y - 1) markSeen(el.id);
    });
  };

  // ✅ Keep your helper (optional, but harmless)
  window.__ANCHOR_MARK_IF_VISIBLE_NOW__ = function (id) {
    const n = normId(id);
    if (!n) return;
    const el = document.getElementById(n);
    if (!el) return;
    markSeenIfInViewport(el);
  };
})();


// =========================
// iOS ONLY: Cross-page NON-HERO hash landing (smooth + 200px fresh offset)
// Prevent Safari deep-hash overshoot by taking over the *initial* hash scroll.
// ALSO: mark "passed" anchors as seen (fixes the iOS bug you described).
// =========================
(function () {
  const ua = navigator.userAgent || "";
  const IS_IOS = /iPhone|iPad|iPod/i.test(ua);
  if (!IS_IOS) return;

  const rawHash = location.hash || "";
  if (!rawHash || rawHash.length <= 1) return;

  const params = new URLSearchParams(location.search);
  if (params.get("slide")) return;

  let id = rawHash.slice(1);
  try { id = decodeURIComponent(id); } catch (_) {}

  // Remove hash ASAP so Safari doesn't do the native jump
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (_) {}

  window.addEventListener("load", () => {
    const el = document.getElementById(id);
    if (!el) {
      try { history.replaceState(null, "", location.pathname + location.search + "#" + encodeURIComponent(id)); } catch (_) {}
      return;
    }

    // ✅ iOS fix: mark everything ABOVE the target as "seen"
    // because the user effectively "passed" those anchors to get here.
    const targetAbsTop = el.getBoundingClientRect().top + window.scrollY;
    if (typeof window.__ANCHOR_MARK_PASSED_UP_TO_Y__ === "function") {
      window.__ANCHOR_MARK_PASSED_UP_TO_Y__(targetAbsTop);
    }

    // ✅ REQUIRED: landing target uses fresh 200px offset
    const FRESH_OFFSET = 200;
    const top = el.getBoundingClientRect().top + window.scrollY - FRESH_OFFSET;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    // Restore hash for sharing/copy-link
    try {
      history.replaceState(null, "", location.pathname + location.search + "#" + encodeURIComponent(id));
    } catch (_) {}

    // Mark the TARGET as seen after the smooth scroll finishes
    if (typeof window.__ANCHOR_MARK_SEEN_LATER__ === "function") {
      window.__ANCHOR_MARK_SEEN_LATER__(id);
    }
  }, { once: true });
})();


// =========================
// OFFCANVAS MENU — CLOSE ONLY (NO SCROLL)
// =========================
document.addEventListener("DOMContentLoaded", function () {
  const offcanvas = document.querySelector(".header-offcanvas");
  if (!offcanvas) return;

  const closeBtn = offcanvas.querySelector(".close, .header-offcanvas-close");
  const overlay = document.querySelector(".offcanvas-overlay");
  const body = document.body;

  offcanvas.querySelectorAll("a[href]").forEach(link => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (shouldIgnoreAnchor(e, href)) return;

      // Close offcanvas only; anchor handler will manage scroll.
      if (href.includes("#")) {
        if (closeBtn) closeBtn.click();
        body.classList.remove("offcanvas-open");
        if (overlay) overlay.style.display = "none";

        // safety cleanup after animation
        setTimeout(() => {
          body.classList.remove("offcanvas-open");
          if (overlay) overlay.style.display = "none";
        }, 400);
      }
    });
  });
});


// =========================
// ANCHOR + HERO HANDLER (PREMIUM) — per-anchor 200→100 (NO correction scrolls)
// =========================
(function () {
  const SLIDE_POLL_MAX = 80;

  function getLocaleBasePath(path) {
    const m = path.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\/$/i);
    return m ? `/${m[1]}/` : '/';
  }

  function normPath(p) {
    const s = (p || '/').split('?')[0];
    const t = s.replace(/\/+$/, '');
    return t || '/';
  }

  function normId(id) {
    if (!id) return '';
    try { return decodeURIComponent(id); } catch (_) { return id; }
  }

  function scrollToIdWithOffset(id, offsetPx, behavior = 'smooth') {
    const n = normId(id);
    const el = document.getElementById(n);
    if (!el) return false;
    const top = el.getBoundingClientRect().top + window.scrollY - offsetPx;
    window.scrollTo({ top: Math.max(0, top), behavior });
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const slider =
      document.querySelector('#hs_cos_wrapper_dnd_area-dnd_partial-1-module-2 .hero-slider.swiper') ||
      document.querySelector('.hero-slider.swiper, .hero-slider');

    function getSwiper() {
      return slider && slider.swiper ? slider.swiper : null;
    }

    function buildMap() {
      const map = {};
      if (!slider) return map;

      slider.querySelectorAll('.swiper-slide').forEach(slide => {
        const sec = slide.querySelector('section[id]');
        if (!sec) return;

        const idxAttr = slide.getAttribute('data-swiper-slide-index');
        const idx = idxAttr != null ? parseInt(idxAttr, 10) : null;
        if (idx != null && !Number.isNaN(idx)) map[sec.id] = idx;
      });

      return map;
    }

    function whenSwiperReady(cb, tries = 0) {
      const swiper = getSwiper();
      if (swiper) return cb(swiper);
      if (tries < SLIDE_POLL_MAX) return setTimeout(() => whenSwiperReady(cb, tries + 1), 100);
      return cb(null);
    }

    let idMap = buildMap();
    if (slider) {
      new MutationObserver(() => { idMap = buildMap(); })
        .observe(slider, { childList: true, subtree: true });
    }

    function handleHero(id, animate) {
      const n = normId(id); // ✅ NEW: decode once
      const idx = idMap[n];
      if (idx == null) return;

      whenSwiperReady(swiper => {
        if (!swiper) return;

        const speed = animate ? 600 : 0;
        try {
          if (swiper.params && swiper.params.loop) swiper.slideToLoop(idx, speed);
          else swiper.slideTo(idx, speed);

          setTimeout(() => window.scrollTo(0, 0), speed ? (speed + 50) : 0);
        } catch (_) {
          window.scrollTo(0, 0);
        }
      });

      history.replaceState(null, '', `${getLocaleBasePath(location.pathname)}?slide=${encodeURIComponent(n)}`);
    }

    // INITIAL LOAD (hero via ?slide)
    const params = new URLSearchParams(location.search);
    const slide = params.get('slide');
    if (slide) {
      const nSlide = normId(slide); // ✅ NEW
      window.scrollTo(0, 0);
      history.replaceState(null, '', `${getLocaleBasePath(location.pathname)}?slide=${encodeURIComponent(nSlide)}`);
      setTimeout(() => handleHero(nSlide, false), 50);
    }

    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;

      const href = a.getAttribute('href');
      if (shouldIgnoreAnchor(e, href)) return;

      let url;
      try { url = new URL(href, location.href); }
      catch (_) { return; }

      if (url.origin !== location.origin) return;

      const hasHash  = !!url.hash;
      const hasSlide = url.searchParams && url.searchParams.get('slide');
      if (!hasHash && !hasSlide) return;

      const rawId = (url.hash || '').replace('#', '') || null;
      const id = normId(rawId); // ✅ NEW: normalize ONCE for everything
      const pathname = url.pathname || '/';
      const samePage = (normPath(pathname) === normPath(location.pathname));
      const isHero = id && (idMap[id] != null); // ✅ FIXED: now matches even if original hash was encoded

      // Pure ?slide= links: keep native navigation
      if (hasSlide && !hasHash) return;

      // HERO
      if (isHero) {
        e.preventDefault();

        if (!samePage) {
          location.href = `${location.origin}${getLocaleBasePath(location.pathname)}?slide=${encodeURIComponent(id)}`;
          return;
        }

        const basePath = getLocaleBasePath(location.pathname);
        history.replaceState(null, '', `${basePath}?slide=${encodeURIComponent(id)}`);
        handleHero(id, true);
        return;
      }

      // NON-HERO
      if (!id) return;

      // Cross-page non-hero: DO NOT prevent default.
      // (Your iOS takeover + CSS strategy handles this path.)
      if (!samePage) return;

      // Same-page non-hero: ONE intentional scroll using per-anchor offset (200 or 100).
      e.preventDefault();

      // If the target is already visible NOW, mark it seen immediately (iOS timing fix)
      if (typeof window.__ANCHOR_MARK_IF_VISIBLE_NOW__ === 'function') {
        window.__ANCHOR_MARK_IF_VISIBLE_NOW__(id);
      }

      const getOffset = (typeof window.__ANCHOR_GET_OFFSET__ === 'function')
        ? window.__ANCHOR_GET_OFFSET__
        : (() => 200);

      const offsetPx = getOffset(id);
      scrollToIdWithOffset(id, offsetPx, 'smooth');

      // after the scroll, mark THIS anchor as seen => next time it becomes 100 (for this anchor only)
      if (typeof window.__ANCHOR_MARK_SEEN_LATER__ === 'function') {
        window.__ANCHOR_MARK_SEEN_LATER__(id);
      }

      // clean URL: hash only (strip ?slide leftovers)
      const cleanBase = location.pathname + location.search
        .replace(/([?&])slide=[^&]+(&?)/, (m, p1, p2) => {
          if (p1 === '?' && p2) return '?';
          if (p1 === '?') return '';
          return p1;
        })
        .replace(/[?&]$/, '');

      history.replaceState(null, '', `${cleanBase}#${encodeURIComponent(id)}`);
    });
  });
})();


// =========================
// ROBUST, MOBILE-SAFE CHEVRON SCROLL (UNCHANGED)
// =========================
(function () {
  'use strict';

  function closestAny(el, selectors) {
    if (!el) return null;
    for (var i = 0; i < selectors.length; i++) {
      var found = el.closest(selectors[i]);
      if (found) return found;
    }
    return null;
  }

  function getHeaderHeight() {
    var header = document.querySelector('header, .site-header, .main-header, .hs-header, .header, .navbar');
    return header ? Math.ceil(header.getBoundingClientRect().height) : 0;
  }

  function getVisualViewportOffset() {
    return (window.visualViewport && typeof window.visualViewport.offsetTop === 'number')
      ? Math.round(window.visualViewport.offsetTop)
      : 0;
  }

  function scrollBelowHero(heroContainer) {
    if (!heroContainer) return;
    var headerHeight = getHeaderHeight();
    var vvOffset = getVisualViewportOffset();
    var heroRect = heroContainer.getBoundingClientRect();
    var heroBottomY = window.scrollY + heroRect.bottom;
    var finalY = Math.max(0, Math.round(heroBottomY - headerHeight - vvOffset));
    window.scrollTo({ top: finalY, behavior: 'smooth' });
  }

  document.addEventListener('click', function (evt) {
    var target = evt.target;
    var chevron = target.closest && target.closest('.scroll-down, .scroll-down *');
    if (!chevron) return;

    var link = target.closest && target.closest('a');
    evt.preventDefault();

    var slideSelectors = ['.hero-item', '.swiper-slide', '.slick-slide', '.carousel-item', '.hs-hero-slide', '.slide'];
    var heroSelectors = ['.hero', '.hero-section', '.hero-wrapper', '.hero-slider', '.slider', '.banner', '.module-hero', '.relxo-hero', '.relxo-slider'];

    var clicked = target.closest ? target.closest('.scroll-down') : null;
    var slideEl = closestAny(clicked || target, slideSelectors);
    var heroContainer = null;

    if (slideEl) {
      heroContainer = closestAny(slideEl, heroSelectors) || slideEl;
    } else {
      heroContainer = document.querySelector(heroSelectors.join(',')) || document.querySelector('.hero-item') || null;
    }

    setTimeout(function () {
      scrollBelowHero(heroContainer);
    }, 45);
  }, { passive: false });
})();


// =========================
// HIGHLIGHT TODAY'S DAY FOR BUSINESS HOURS (FIXED WRAP)
// =========================
document.addEventListener("DOMContentLoaded", function () {
  const today = new Date().getDay();
  const todayItem = document.querySelector(`.hours p[data-day="${today}"]`);
  if (todayItem) todayItem.classList.add("highlight");
});


// =========================
// FRESHA REVIEWS WIDGET (UNCHANGED)
// =========================
(function () {
  const API_ENDPOINT = "https://www.sevenangelsmassage.com/api/fresha-reviews";
  const FRESHA_LINK = "https://www.fresha.com/a/seven-angels-massage-makati-city-valero-street-salcedo-village-barangay-bel-air-ppd0tkwk&utm_source=website&utm_medium=fresha_booking&utm_campaign=booking_intent&utm_content=footer_fresha_reviews&utm_term=seven_angels_massage";
  const FRESHA_LOGO = "/assets/media/Fresha-Logo.webp";
  const FRESHA_LOGO_LINK = "https://www.fresha.com/a/seven-angels-massage-makati-city-valero-street-salcedo-village-barangay-bel-air-ppd0tkwk&utm_source=website&utm_medium=fresha_booking&utm_campaign=booking_intent&utm_content=footer_fresha_logo&utm_term=seven_angels_massage";
  
  document.addEventListener("DOMContentLoaded", async () => {
    const target = document.querySelector(".footer-reviews");
    if (!target) return;

    try {
      const res = await fetch(API_ENDPOINT, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error("Bad API response " + res.status);

      const data = await res.json();

      if (typeof data.average === "number" && typeof data.count === "number") {
        target.innerHTML = `
          <a href="${FRESHA_LOGO_LINK}" target="_blank" rel="noopener">
          <img src="${FRESHA_LOGO}" alt="Fresha Booking App for Seven Angels Massage"  alt="Fresha Booking App for Seven Angels Massage" style="height: 50px;" loading="lazy">
          </a>
          <span>
            <a href="${FRESHA_LINK}" target="_blank" rel="noopener">Fresha</a> 
            Rating: <strong>${data.average.toFixed(1)}/5</strong> (based on ${data.count} reviews)
          </span>
          <div>
            Updated ${new Date(data.lastUpdated || Date.now()).toLocaleString()}
          </div>
        `;
      }
    } catch (err) {
      console.error("[Fresha Widget] Error:", err);
    }
  });
})();


// =========================
// EXPLORE MORE AMBIANCE (UNCHANGED)
// =========================
window.addEventListener('load', function () {
  var btn =
    document.querySelector('.sam-cta-null-button a');

  if (!btn) return;

  if (btn && btn.tagName !== 'A') {
    var innerA = btn.querySelector('a');
    if (innerA) btn = innerA;
  }

  var items = document.querySelectorAll('a.vbox-item[data-gall="myGallery"]');
  if (items.length === 5) return;

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    if (window.jQuery && typeof jQuery.fn.venobox !== 'undefined') {
      jQuery(items[5]).trigger('click');
    } else {
      items[5].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  });
});


// =========================
// LAZY LOAD GALLERY IMAGES (UNCHANGED)
// =========================
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.gallery-thumb img').forEach(function(img){
    if(!img.hasAttribute('loading')) img.setAttribute('loading','lazy');
    img.setAttribute('decoding','async');
  });
});


// =========================
// UNIVERSAL CLICK TRACKING FOR ALL CONTACT LINKS (DEEP LINKS)
// + WECHAT MODAL TRACKING
// Works with Worker v3:
//   /chat/track/<app> -> 204 tracking collector
// =========================
document.addEventListener("DOMContentLoaded", function () {
  const TRACK_BASE = "https://www.sevenangelsmassage.com/chat/track/";

  function buildTrackingParams(utmContentOverride) {
    const params = new URLSearchParams(window.location.search);

    // Defaults (match your final UTM schema)
    if (!params.get("utm_source")) params.set("utm_source", "website");
    if (!params.get("utm_medium")) params.set("utm_medium", "chat_deeplink");
    if (!params.get("utm_campaign")) params.set("utm_campaign", "booking_intent");
    if (!params.get("utm_term")) params.set("utm_term", "seven_angels_massage");

    // ✅ IMPORTANT: placement-specific utm_content should WIN
    if (utmContentOverride) {
      params.set("utm_content", utmContentOverride);
    } else if (!params.get("utm_content")) {
      params.set("utm_content", "unknown_placement");
    }

    return params;
  }

  function sendTracking(app, utmContentOverride) {
    if (!app) return;

    const params = buildTrackingParams(utmContentOverride);
    const trackUrl = TRACK_BASE + encodeURIComponent(app) + "?" + params.toString();

    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackUrl);
    } else {
      fetch(trackUrl, { method: "GET", mode: "no-cors", keepalive: true }).catch(() => {});
    }
  }

  // -------------------------
  // 1) Universal tracking for any <a class="chat-link" ...>
  // -------------------------
  document.addEventListener(
    "click",
    function (e) {
      // Ignore modified clicks (open-in-new-tab, etc.) — optional but reduces noise

      const a = e.target.closest("a.chat-link");
      if (!a) return;

      // Prevent accidental double-track for WeChat modal trigger (handled in WeChat block)
      if (a.id === "wechatLinkButton") return;

      const app = a.getAttribute("data-app");
      if (!app) return;

      const utmContent = a.getAttribute("data-utm-content") || null;

      // Track, then allow normal navigation (deep link opens the app)
      sendTracking(app, utmContent);
    },
    true
  );

  // -------------------------
  // 2) WeChat modal (no navigation) + tracking beacon
  // -------------------------
  const trigger = document.getElementById("wechatLinkButton");
  const modal = document.getElementById("wechatModal");
  const closeBtn = document.querySelector(".wechat-modal-close");

  if (!trigger || !modal || !closeBtn) return;

  // Ensure modal is under <body> so it overlays correctly
  if (modal.parentElement !== document.body) document.body.appendChild(modal);

  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  const openModal = () => {
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = () => {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  };

  function openWeChatScannerWithFallback() {
    if (!isMobile) return;
    if (!isAndroid) {
      window.location.href = "weixin://scanqrcode";
      return;
    }
    window.location.href = "weixin://";
  }

  function trackWeChatClick() {
    const utmContent = trigger.getAttribute("data-utm-content") || "wechat_cta";
    // For WeChat modal, you already standardized this:
    // contact_section_wechat_modal / footer_wechat_modal, etc.
    const params = buildTrackingParams(utmContent);

    const trackUrl = TRACK_BASE + "wechat?" + params.toString();

    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackUrl);
    } else {
      fetch(trackUrl, { method: "GET", mode: "no-cors", keepalive: true }).catch(() => {});
    }
  }

  trigger.addEventListener("click", function (e) {
    e.preventDefault();
    trackWeChatClick();
    openModal();
    openWeChatScannerWithFallback();
  });

  closeBtn.addEventListener("click", closeModal);
  window.addEventListener("click", (e) => e.target === modal && closeModal());
  window.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());
});


// =========================
// CHAT-FALLBACK SCRIPT
// =========================
(function () {
  const TEXT_DEFAULT =
    "Hi! I visited your website and I'd like to book a massage.\n\n" +
    "My details:\n" +
    "- Full Name:\n" +
    "- Condo / Hotel & City:\n" +
    "- Preferred date & start time:\n" +
    "- Massage type & duration:\n" +
    "- Number of guests:\n" +
    "- Additional notes:";

  const VCARD_FILE_URL = "/files/seven-angels-massage.vcf";
  const params = new URLSearchParams(window.location.search);

  // ✅ IMPORTANT: child.js is global on HubSpot.
  // Only run this fallback logic on the fallback page, or you'll create redirect loops.
  const normalizedPath = (window.location.pathname || "").replace(/\/+$/, "");
  if (normalizedPath !== "/chat/fallback") return;

  // ✅ On fallback page, ONLY trust ?app=. Path inference is not meaningful here.
  const app = (params.get("app") || "").toLowerCase();

  // ✅ If no app was provided, this page can't do anything useful.
  // Send the user to Contact Us (good UX) and stop.
  if (!app) {
    window.location.replace("/contact-us" + window.location.search);
    return;
  }

  const rawTextParam = params.get("text");

  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  function safeDecodeMaybe(s) {
    if (!s) return "";
    try { return decodeURIComponent(String(s).replace(/\+/g, "%20")); }
    catch { return String(s); }
  }

  const message = rawTextParam ? safeDecodeMaybe(rawTextParam) : TEXT_DEFAULT;
  const encodedText = encodeURIComponent(message);

  // ✅ Tracking beacon (Worker v5: /chat/track/<app> returns 204)
  // Preserves full query string (utm_*, text, etc.) so tracking stays consistent.
  (function trackOnce() {
    try {
      const beaconUrl = "/chat/track/" + encodeURIComponent(app) + "?" + params.toString();
      if (navigator.sendBeacon) {
        navigator.sendBeacon(beaconUrl);
      } else {
        fetch(beaconUrl, { method: "GET", keepalive: true, credentials: "omit" }).catch(() => {});
      }
    } catch (_) {}
  })();

  let deepLink = "#";

  switch (app) {
    case "wechat-qr": {
      const qr = document.getElementById("wechatQR");
      if (qr) {
        qr.style.display = "flex";
        qr.setAttribute("aria-hidden", "false");
      }
      deepLink = isIOS ? "weixin://scanqrcode" : (isAndroid ? "weixin://" : "#");
      break;
    }

    case "vcard": {
      const box = document.getElementById("vcardBox");
      if (box) box.style.display = "block";

      const btn = document.getElementById("openBtn");
      if (btn) btn.style.display = "none";

      deepLink = VCARD_FILE_URL;
      break;
    }

    case "whatsapp":
      deepLink = "whatsapp://send?&phone=+639174476203&text=" + encodedText;
      break;

    case "viber":
      deepLink = "viber://chat?&number=%2B639174476203&draft=" + encodedText;
      break;

    case "telegram":
      deepLink = "tg://resolve?&domain=sevenangels003&text=" + encodedText;
      break;

    case "messenger":
      deepLink = "https://m.me/7AngelsMassage?text=" + encodedText;
      break;

    case "sms-globe":
      deepLink = "sms:+63917-447-6203?&body=" + encodedText;
      break;

    case "sms-smart":
      deepLink = "sms:+63908-397-2327?&body=" + encodedText;
      break;

    case "signal":
      deepLink = "sgnl://signal.me/#p/+639174476203";
      break;

    case "line":
      deepLink = "line://ti/p/~sevenangels003";
      break;

    case "kakaotalk":
    case "kakao":
      deepLink = "http://qr.kakao.com/talk/iZxce2olITQ44EjbmZ39vbd4ekQ-";
      break;

    case "email":
      deepLink =
        "mailto:24-7_on-call@sevenangelsmassage.com" +
        "?subject=" + encodeURIComponent("Massage Booking Inquiry — Seven Angels Massage") +
        "&body=" + encodeURIComponent(message);
      break;

    default:
      window.location.replace("/contact-us" + window.location.search);
      return;
  }

  const btn = document.getElementById("openBtn");
  if (btn) btn.href = deepLink;

  const btnWeChat = document.getElementById("openBtnWeChat");
  if (btnWeChat) {
    if (app === "wechat-qr") {
      btnWeChat.style.display = "block";
      btnWeChat.href = deepLink;
    } else {
      btnWeChat.style.display = "none";
    }
  }

  const btnVcard = document.getElementById("openBtnVcard");
  if (btnVcard) btnVcard.href = VCARD_FILE_URL;

    let tried = false;
  function tryOpen() {
    if (tried) return;
    tried = true;
    if (deepLink && deepLink !== "#") window.location.href = deepLink;
  }

  setTimeout(tryOpen, 120);
  setTimeout(tryOpen, 600);
})();


/* ==========================================================
   A11Y PATCH: HubSpot intl phone country/extension <select>
   - Fixes Lighthouse: "Select elements do not have associated label elements"
   - Applies to HubSpot-injected phone_ext-* selects (blog comments + forms)
   - Non-destructive: skips if aria-label/aria-labelledby already exists
   ========================================================== */
(function () {
  function labelPhoneExtSelects(root) {
    try {
      var scope = root || document;

      // HubSpot intl phone country select
      var selects = scope.querySelectorAll('#hs_cos_wrapper_blog_comments select[id^="phone_ext-"]');


      for (var i = 0; i < selects.length; i++) {
        var sel = selects[i];

        // Don't override if HubSpot ever adds naming later
        if (sel.hasAttribute('aria-label') || sel.hasAttribute('aria-labelledby')) continue;

        // Give it a stable accessible name Lighthouse accepts
        sel.setAttribute('aria-label', 'Country code');
      }
    } catch (e) {
      // accessibility enhancement only; fail silently
    }
  }

  function run() {
    labelPhoneExtSelects(document);
  }

  // Run early + after full load (PSI can be late / slow)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.addEventListener('load', run);

  // HubSpot forms inject after initial render; observe for a while
  try {
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (!m.addedNodes || !m.addedNodes.length) continue;

        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n && n.querySelectorAll) labelPhoneExtSelects(n);
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Stop after 30s to avoid a long-running observer
    setTimeout(function () {
      try { mo.disconnect(); } catch (e) {}
    }, 30000);
  } catch (e) {}
})();


// ============================================================================
// END OF child.js
// If you add new blocks, insert ABOVE this line and follow the OWNERSHIP rules.
// ============================================================================