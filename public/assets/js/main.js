/* Common Variables */
const backdrop = document.querySelector('.backdrop');

/* Get Siblings Function */
const getSiblings = function (e) {
    let siblings = [];
    if(!e.parentNode) { return siblings; }
    let sibling  = e.parentNode.firstChild;
    while (sibling) {
        if (sibling.nodeType === 1 && sibling !== e) {
            siblings.push(sibling);
        }
        sibling = sibling.nextSibling;
    }
    return siblings;
};

/* Slide Up Function */
const slideUp = (target, duration=500) => {
    target.style.transitionProperty = 'height, margin, padding';
    target.style.transitionDuration = duration + 'ms';
    target.style.boxSizing = 'border-box';
    target.style.height = target.offsetHeight + 'px';
    target.offsetHeight;
    target.style.overflow = 'hidden';
    target.style.height = 0;
    target.style.paddingTop = 0;
    target.style.paddingBottom = 0;
    target.style.marginTop = 0;
    target.style.marginBottom = 0;
    window.setTimeout( () => {
        target.style.display = 'none';
        target.style.removeProperty('height');
        target.style.removeProperty('padding-top');
        target.style.removeProperty('padding-bottom');
        target.style.removeProperty('margin-top');
        target.style.removeProperty('margin-bottom');
        target.style.removeProperty('overflow');
        target.style.removeProperty('transition-duration');
        target.style.removeProperty('transition-property');
    }, duration);
}

/* Slide Down Function */
const slideDown = (target, duration=500) => {
    target.style.removeProperty('display');
    let display = window.getComputedStyle(target).display;
    if (display === 'none') display = 'block';
    target.style.display = display;
    let height = target.offsetHeight;
    target.style.overflow = 'hidden';
    target.style.height = 0;
    target.style.paddingTop = 0;
    target.style.paddingBottom = 0;
    target.style.marginTop = 0;
    target.style.marginBottom = 0;
    target.offsetHeight;
    target.style.boxSizing = 'border-box';
    target.style.transitionProperty = "height, margin, padding";
    target.style.transitionDuration = duration + 'ms';
    target.style.height = height + 'px';
    target.style.removeProperty('padding-top');
    target.style.removeProperty('padding-bottom');
    target.style.removeProperty('margin-top');
    target.style.removeProperty('margin-bottom');
    window.setTimeout( () => {
        target.style.removeProperty('height');
        target.style.removeProperty('overflow');
        target.style.removeProperty('transition-duration');
        target.style.removeProperty('transition-property');
    }, duration);
}

/* Slide Toggle Function */
const slideToggle = (target, duration = 500) => {
    if (window.getComputedStyle(target).display === 'none') {
        return slideDown(target, duration);
    } else {
        return slideUp(target, duration);
    }
}

/* Header Sticky */
const stickyHeader = document.querySelector('.header-sticky')
function headerStickyFunction() {
    if (!stickyHeader) return;
    if (window.scrollY > 550) {
        stickyHeader.classList.add('is-sticky');
    } else {
        stickyHeader.classList.remove('is-sticky');
    }
}

/* Offcanvas Submenu Open Close */
const offcanvasSubMenuToggle = document.querySelectorAll('.offcanvas-sub-menu-toggle');
offcanvasSubMenuToggle.forEach(function(toggle) {
    toggle.addEventListener('click', function() {
        const siblingsSubmenu = this.nextElementSibling;
        if(this.classList.contains('active')) {
            this.classList.remove('active');
            slideUp(siblingsSubmenu);
            siblingsSubmenu.querySelectorAll('.offcanvas-sub-menu').forEach(function(subMenu) {
                slideUp(subMenu);
                subMenu.previousElementSibling.classList.remove('active');
            });
        } else {
            this.classList.add('active');
            slideDown(siblingsSubmenu);
            getSiblings(this.closest('li')).forEach(function(li) {
                li.querySelectorAll('.offcanvas-sub-menu').forEach(function(subMenu) {
                    slideUp(subMenu);
                    subMenu.previousElementSibling.classList.remove('active');
                });
            });
        }
    });
});

/* Header Offcanvas */
const headerOffCanvas = document.querySelector('.header-offcanvas'),
    headerOffCanvasOpen = document.querySelector('.header-offcanvas-open'),
    headerOffCanvasClose = document.querySelector('.header-offcanvas-close');

if(headerOffCanvasOpen) {
    headerOffCanvasOpen.addEventListener('click', function(e) {
        headerOffCanvas.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
    });
}
if(headerOffCanvasClose) {
    headerOffCanvasClose.addEventListener('click', function() {
        headerOffCanvas.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    });
}

/* =========================
   SWIPER INITS (GUARDED)
   IMPORTANT: If a slider element does not exist on a page,
   we DO NOT init it (prevents breaking other sliders).
   ========================= */

function safeInitSwiper(selector, options) {
    try {
        if (typeof Swiper === 'undefined') return null;
        const el = document.querySelector(selector);
        if (!el) return null;
        // Avoid double init
        if (el.swiper) return el.swiper;
        return new Swiper(selector, options);
    } catch (e) {
        // swallow errors to avoid breaking the whole file
        return null;
    }
}

/* Hero Slider */
safeInitSwiper('.hero-slider', {
    loop: true,
    navigation: {
        nextEl: '.hero-slider .home-slider-next',
        prevEl: '.hero-slider .home-slider-prev',
    },
});

/* Yoga Package Slider */
(function() {
    try {
        if (typeof Swiper === 'undefined') return;
        const el = document.querySelector('.yoga-package-slider');
        if (!el) return;
        if (el.swiper) return;

        new Swiper('.yoga-package-slider', {
            loop: true,
            spaceBetween: 30,
            slidesPerView: 3,
            autoHeight: true,
            pagination: {
                el: '.swiper-pagination',
                type: 'bullets',
                clickable: true,
            },
            breakpoints: {
                1200: { slidesPerView: 3 },
                992:  { slidesPerView: 3 },
                768:  { slidesPerView: 2 },
                576:  { slidesPerView: 1 },
                320:  { slidesPerView: 1 }
            }
        });
    } catch (_) {}
})();

/* =========================
   TESTIMONIALS (MOBILE-SAFE + DEVTOOLS-EXIT SAFE) — TRIMMED
   - 2-way real-time swipe
   - click/tap thumb recenters + main follows
   - loop forever
   - survives: load in DevTools Responsive -> exit to desktop
   ========================= */
(function () {
  "use strict";

  const SEL_MAIN = ".testimonial-nav-content.nav-content";
  const SEL_THUMBS = ".testimonial-thumb-wrap.nav-thumb";

  let main = null, thumbs = null, booted = false;
  let until = 0;
  const now = () => Date.now();
  const cool = (ms) => (until = now() + ms);
  const iced = () => now() < until;

  const q = (s) => document.querySelector(s);

  const realCountOf = (mainEl) =>
    (mainEl.querySelectorAll(".swiper-wrapper > .swiper-slide") || []).length;

  const closestInternal = (sw, realIdx) => {
    if (!sw || !sw.slides) return null;
    const tr = Number(realIdx);
    if (isNaN(tr)) return null;

    const a = sw.activeIndex;
    let best = null, bestD = 1e9;

    for (let i = 0; i < sw.slides.length; i++) {
      const ri = sw.slides[i]?.getAttribute?.("data-swiper-slide-index");
      if (ri == null || Number(ri) !== tr) continue;
      const d = Math.abs(i - a);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const toReal = (sw, realIdx, speed, force) => {
    if (!sw || sw.destroyed) return;
    if (!force && (sw.isTouched || sw.animating)) return;

    const internal = closestInternal(sw, realIdx);
    if (internal != null) return sw.slideTo(internal, speed, false);
    if (typeof sw.slideToLoop === "function") return sw.slideToLoop(realIdx, speed, false);
    sw.slideTo(realIdx, speed, false);
  };

  const twoWay = (a, b) => {
    try { a.controller && (a.controller.control = b); } catch (_) {}
    try { b.controller && (b.controller.control = a); } catch (_) {}
  };
  const oneWay = (from, to) => {
    try { from.controller && (from.controller.control = to); } catch (_) {}
    try { to.controller && (to.controller.control = null); } catch (_) {}
  };

  const clearStuck = (sw) => {
    if (!sw || sw.destroyed) return;
    try { sw.allowClick = true; } catch (_) {}
    try { sw.isTouched = false; } catch (_) {}
    try { sw.animating = false; } catch (_) {}
    try { sw.allowTouchMove = true; } catch (_) {}
    try {
      if (sw.touchEventsData) {
        sw.touchEventsData.isTouched = false;
        sw.touchEventsData.isMoved = false;
        sw.touchEventsData.allowTouchCallbacks = false;
      }
    } catch (_) {}
  };

  // 🔥 Key DevTools fix: force Pointer Events (survives touch emulation -> mouse)
  const forcePointerEvents = (sw) => {
    if (!sw || sw.destroyed) return;
    if (!("PointerEvent" in window)) return;
    try {
      sw.touchEvents = {
        start: "pointerdown",
        move: "pointermove",
        end: "pointerup",
        cancel: "pointercancel"
      };
    } catch (_) {}
  };

  const softRepair = () => {
    if (!main || !thumbs || main.destroyed || thumbs.destroyed) return;

    clearStuck(main);
    clearStuck(thumbs);

    forcePointerEvents(main);
    forcePointerEvents(thumbs);

    try { main.detachEvents?.(); } catch (_) {}
    try { thumbs.detachEvents?.(); } catch (_) {}
    try { main.attachEvents?.(); } catch (_) {}
    try { thumbs.attachEvents?.(); } catch (_) {}

    try { main.update?.(); } catch (_) {}
    try { thumbs.update?.(); } catch (_) {}

    twoWay(main, thumbs);

    if (thumbs.realIndex !== main.realIndex) toReal(thumbs, main.realIndex, 0, true);
  };

  const destroy = () => {
    try { main && !main.destroyed && main.destroy(true, true); } catch (_) {}
    try { thumbs && !thumbs.destroyed && thumbs.destroy(true, true); } catch (_) {}
    main = null; thumbs = null;
  };

  const create = () => {
    if (typeof Swiper === "undefined") return false;

    const mainEl = q(SEL_MAIN);
    const thEl = q(SEL_THUMBS);
    if (!mainEl || !thEl) return false;

    const realCount = realCountOf(mainEl);
    if (realCount < 2) return false;

    // If already init'd elsewhere, adopt + repair
    if (mainEl.swiper || thEl.swiper) {
      main = mainEl.swiper || main;
      thumbs = thEl.swiper || thumbs;
      if (main && thumbs) softRepair();
      return !!(main && thumbs);
    }

    thumbs = new Swiper(thEl, {
      loop: true,
      loopedSlides: realCount,
      loopAdditionalSlides: realCount,
      slidesPerView: 5,
      slidesPerGroup: 1,
      centeredSlides: true,
      spaceBetween: 0,
      watchSlidesProgress: true,
      allowTouchMove: true,
      simulateTouch: true,
      preventInteractionOnTransition: false,
      slideToClickedSlide: false,
      breakpoints: { 0: { slidesPerView: 3 }, 768: { slidesPerView: 5 } }
    });

    main = new Swiper(mainEl, {
      loop: true,
      loopedSlides: realCount,
      loopAdditionalSlides: realCount,
      slidesPerView: 1,
      slidesPerGroup: 1,
      centeredSlides: true,
      allowTouchMove: true,
      simulateTouch: true,
      preventInteractionOnTransition: false,
      navigation: {
        nextEl: ".testimonial-nav-content .testimonial-slider-next",
        prevEl: ".testimonial-nav-content .testimonial-slider-prev"
      }
    });

    forcePointerEvents(main);
    forcePointerEvents(thumbs);
    try { main.detachEvents?.(); main.attachEvents?.(); } catch (_) {}
    try { thumbs.detachEvents?.(); thumbs.attachEvents?.(); } catch (_) {}

    twoWay(main, thumbs);

    let driver = null;

    // Gate during drag (mobile safety)
    main.on("sliderFirstMove", () => {
      if (iced()) return;
      driver = "main";
      oneWay(main, thumbs);
    });
    thumbs.on("sliderFirstMove", () => {
      if (iced()) return;
      driver = "thumbs";
      oneWay(thumbs, main);
    });
    const restore = () => setTimeout(() => { driver = null; twoWay(main, thumbs); }, 0);
    main.on("touchEnd", restore);
    thumbs.on("touchEnd", restore);

    // click/tap thumb: recenter + sync
    const onThumb = () => {
      if (iced()) return;

      const idx = thumbs.clickedIndex;
      if (idx == null) return;

      const slide = thumbs.slides?.[idx];
      const riAttr = slide?.getAttribute?.("data-swiper-slide-index");
      const real = !isNaN(Number(riAttr)) ? Number(riAttr) : thumbs.realIndex;

      driver = "thumbs";
      oneWay(thumbs, main);

      cool(220);
      toReal(thumbs, real, 220, false);
      toReal(main, real, 220, false);

      setTimeout(() => { twoWay(main, thumbs); driver = null; }, 260);
    };
    thumbs.on("tap", onThumb);
    thumbs.on("click", onThumb);

    // light drift correction
    main.on("slideChangeTransitionEnd", () => {
      if (iced() || (driver && driver !== "main")) return;
      if (thumbs.realIndex !== main.realIndex) toReal(thumbs, main.realIndex, 120, false);
    });
    thumbs.on("slideChangeTransitionEnd", () => {
      if (iced() || (driver && driver !== "thumbs")) return;
      if (main.realIndex !== thumbs.realIndex) toReal(main, thumbs.realIndex, 160, false);
    });

    // boot align + repair once
    setTimeout(() => {
      try { main.update?.(); } catch (_) {}
      try { thumbs.update?.(); } catch (_) {}
      cool(120);
      if (thumbs.realIndex !== main.realIndex) toReal(thumbs, main.realIndex, 0, true);
      twoWay(main, thumbs);
      softRepair();
    }, 80);

    return true;
  };

  const hardReinit = () => {
    const keep = (main && !main.destroyed && typeof main.realIndex === "number") ? main.realIndex : 0;
    destroy();
    if (create()) {
      setTimeout(() => {
        if (!main || !thumbs) return;
        toReal(main, keep, 0, true);
        toReal(thumbs, keep, 0, true);
        softRepair();
      }, 0);
    }
  };

  function start() {
    if (booted) return;
    booted = true;

    let rt = null;
    const schedule = (hard) => {
      clearTimeout(rt);
      rt = setTimeout(() => (hard ? hardReinit() : softRepair()), 180);
    };

    window.addEventListener("resize", () => schedule(false), { passive: true });
    window.addEventListener("focus", () => schedule(false), { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(false); });

    // DevTools emulation flip signal -> HARD
    try {
      const mq1 = window.matchMedia("(any-pointer: coarse)");
      const mq2 = window.matchMedia("(any-hover: hover)");
      const onMQ = () => schedule(true);
      mq1?.addEventListener?.("change", onMQ) || mq1?.addListener?.(onMQ);
      mq2?.addEventListener?.("change", onMQ) || mq2?.addListener?.(onMQ);
    } catch (_) {}

    // HubSpot-safe retries
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (create() || n > 160) clearInterval(t);
    }, 50);

    window.addEventListener("load", () => setTimeout(() => schedule(true), 250));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();


/*------------------------------
    Parallax Motion Animation 
-------------------------------*/
var sceneElements = document.querySelectorAll('.scene');
var parallaxScenes = [];
for (var i = 0; i < sceneElements.length; i++) {
    parallaxScenes.push(new Parallax(sceneElements[i]));
}

/*----------------------------------------
    SVG Inject With Vivus(After Inject) 
------------------------------------------*/
SVGInject(document.querySelectorAll("img.svgInject"), {
    makeIdsUnique: true,
    afterInject: function (img, svg) {
        new Vivus(svg, { duration: 80 });
    }
});

/* Vivus On Hover */
var vivusHover = document.querySelectorAll('[data-vivus-hover]');
vivusHover.forEach(function(item) {
    item.addEventListener('mouseover', function () {
        var svg = this.querySelectorAll('svg')[0];
        new Vivus(svg, { duration: 50 });
    });
})

/* ----------------------------
    AOS Scroll Animation  (reduced-motion safe)
-------------------------------*/
if (window.AOS) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  AOS.init({
    disable: reduce,
    offset: 80,
    duration: 1000,
    once: true,
    easing: 'ease',
  });
}

/* Video Popup */
new VenoBox({
    selector: '.video-popup, .gallery-popup',
    autoplay: true,
    maxWidth: '1000px'
});

/* If Click Outside of Element */
document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('header-offcanvas-open') &&
        !e.target.closest('.header-offcanvas-open') &&
        !e.target.closest('.header-offcanvas')) {
        if (headerOffCanvas) headerOffCanvas.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    }
});

/* Scroll Event */
window.addEventListener('scroll', function () {
    headerStickyFunction()
});