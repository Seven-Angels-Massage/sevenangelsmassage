// /assets/js/modules/Newsletter.module.js

document.addEventListener("DOMContentLoaded", () => {
  const ROOT = document.querySelector(".newsletter-form");
  if (!ROOT) return;

  const form = ROOT.querySelector("form.hsfc-Form");
  if (!form) return;

  // -------------------------
  // Messages
  // -------------------------
  const REQUIRED_MSG = "Please complete this required field.";
  const FORM_REQUIRED_MSG = "Please complete all required fields.";
  const FORM_SUBMITTING_MSG = "Submitting… Please wait.";
  const FORM_NETWORK_MSG =
    "We couldn’t submit right now. Please check your connection and try again.";
  const FORM_SERVER_MSG =
    "Something went wrong submitting the form. Please review your details and try again.";

  const EMAIL_INVALID_MSG = "Please enter a valid email address.";
  const EMAIL_INVALID_FORMAT_MSG = "Email must be formatted correctly.";
  const EMAIL_DOMAIN_INVALID_MSG =
    "Email domain looks invalid. Please check your email and try again.";
  const EMAIL_SUGGESTION_SUBMIT_MSG =
    "Please correct your email address before submitting.";

  const PHONE_INVALID_FORMAT_MSG =
    "This phone number is either invalid or is in the wrong format.";

  // -------------------------
  // State + helpers
  // -------------------------
  const openDropdowns = new Set();
  const toArray = (x) => Array.prototype.slice.call(x || []);
  const norm = (s) => (s || "").toString().trim().toLowerCase();

  // submission control
  let pendingSubmit = false;
  let programmaticSubmit = false;
  let submitTimeoutId = null;

  // Keep a handle to phone validation for submit
  let phoneCtx = null;

  // -------------------------
  // Optional: libphonenumber-js hooks (if present)
  // -------------------------
  const LibPhone =
    window.libphonenumber ||
    window.libphonenumberJs ||
    window.libphonenumber_js ||
    window.libphonenumberjs ||
    null;

  const AsYouTypeCtor = LibPhone?.AsYouType || null;
  const parsePhoneNumberFromString = LibPhone?.parsePhoneNumberFromString || null;

  // -------------------------
  // Utilities
  // -------------------------
  function isVisible(el) {
    if (!el) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    return true;
  }

  function showEl(el, display = "block") {
    if (!el) return;
    el.hidden = false;
    el.style.display = display;
  }

  function hideEl(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = "none";
  }

  function setRelPosIfStatic(el) {
    if (!el) return;
    const cs = window.getComputedStyle(el);
    if (cs.position === "static") el.style.position = "relative";
  }

  function getSubmitBtn() {
    return (
      form.querySelector('button[type="submit"]') ||
      form.querySelector('input[type="submit"]') ||
      null
    );
  }

  function setSubmittingUI(isSubmitting) {
    const btn = getSubmitBtn();
    if (btn) {
      btn.disabled = !!isSubmitting;
      btn.setAttribute("aria-disabled", isSubmitting ? "true" : "false");
      if (isSubmitting) btn.dataset.originalText = btn.textContent || btn.value || "";
      // do not overwrite the button text aggressively; just set aria-busy
    }
    form.setAttribute("aria-busy", isSubmitting ? "true" : "false");
  }

  function clearSubmitTimeout() {
    if (submitTimeoutId) {
      clearTimeout(submitTimeoutId);
      submitTimeoutId = null;
    }
  }

  // -------------------------
  // Alerts/PostSubmit
  // You set style="display:none" in HTML; we respect it.
  // We only show/hide via JS when needed.
  // -------------------------
  function normalizeStaticBits() {
    const allAlerts = form.querySelectorAll(".hsfc-ErrorAlert, .hsfc-InfoAlert");
    allAlerts.forEach((el) => {
      if (el.classList.contains("hsfc-ErrorAlert")) {
        el.setAttribute("role", el.getAttribute("role") || "alert");
        el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
      } else {
        el.setAttribute("role", el.getAttribute("role") || "status");
        el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
      }
      // If someone forgot display:none in HTML, keep it hidden initially.
      if (!el.style.display) el.style.display = "none";
      el.hidden = true;
    });

    const FORM_WRAPPER =
      ROOT.querySelector('[data-hsfc-id="FormWrapper"]') || form.parentElement || ROOT;

    const POST_SUBMIT =
      FORM_WRAPPER?.querySelector?.('[data-hsfc-id="PostSubmit"]') ||
      ROOT.querySelector('[data-hsfc-id="PostSubmit"]');

    if (POST_SUBMIT) hideEl(POST_SUBMIT);
  }
  normalizeStaticBits();

  // -------------------------
  // Form-level ErrorAlert (NavigationRow)
  // -------------------------
  function getFormLevelErrorEl() {
    return (
      form.querySelector(".hsfc-NavigationRow__Alerts .hsfc-ErrorAlert") ||
      form.querySelector('.hsfc-NavigationRow__Alerts [data-hsfc-id="ErrorAlert"]') ||
      null
    );
  }

  function showFormLevelError(message) {
    const el = getFormLevelErrorEl();
    if (!el) return;
    el.textContent = message || FORM_REQUIRED_MSG;
    showEl(el, "block");
  }

  function clearFormLevelError() {
    const el = getFormLevelErrorEl();
    if (!el) return;
    hideEl(el);
  }

  // -------------------------
  // Error/Info helpers (reuse existing HTML elements)
  // -------------------------
  function getErrorEl(fieldEl) {
    if (!fieldEl) return null;
    return (
      fieldEl.querySelector('.hsfc-ErrorAlert[data-hsfc-id="ErrorAlert"]') ||
      fieldEl.querySelector(".hsfc-ErrorAlert") ||
      null
    );
  }

  function getInfoEl(fieldEl) {
    if (!fieldEl) return null;
    return (
      fieldEl.querySelector('.hsfc-InfoAlert[data-hsfc-id="InfoAlert"]') ||
      fieldEl.querySelector(".hsfc-InfoAlert") ||
      null
    );
  }

  function showError(fieldEl, inputEl, message) {
    const el = getErrorEl(fieldEl);
    if (el) {
      el.textContent = message;
      showEl(el, "block");
    }
    if (inputEl) inputEl.setAttribute("aria-invalid", "true");
  }

  function clearError(fieldEl, inputEl) {
    const el = getErrorEl(fieldEl);
    if (el) hideEl(el);
    if (inputEl) inputEl.setAttribute("aria-invalid", "false");
  }

  function clearInfo(fieldEl) {
    const el = getInfoEl(fieldEl);
    if (!el) return;
    hideEl(el);
  }

  function showInfo(fieldEl, message) {
    const infoEl = getInfoEl(fieldEl);
    if (!infoEl) return;
    infoEl.textContent = message || "";
    showEl(infoEl, "block");
  }

  function showEmailSuggestion(fieldEl, inputEl, suggestion) {
    const infoEl = getInfoEl(fieldEl);
    if (!infoEl) return;

    let btn =
      infoEl.querySelector('.hsfc-LinkButton[data-hsfc-id="LinkButton"]') ||
      infoEl.querySelector(".hsfc-LinkButton") ||
      null;

    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hsfc-LinkButton";
      btn.dataset.hsfcId = "LinkButton";
      infoEl.innerHTML = "";
      infoEl.appendChild(btn);
    } else {
      // ensure it's the only content
      infoEl.innerHTML = "";
      infoEl.appendChild(btn);
    }

    btn.textContent = `Did you mean ${suggestion}?`;

    // replace to drop old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", () => {
      // IMPORTANT: clicking suggestion should NOT trigger new errors.
      inputEl.value = suggestion;

      clearError(fieldEl, inputEl);
      clearInfo(fieldEl);
      clearFormLevelError();

      try {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}

      inputEl.focus();
    });

    showEl(infoEl, "block");
  }

  // -------------------------
  // Dropdown utilities (Phone + City identical behavior)
  // -------------------------
  function setListScrollbar(listEl, px = 260) {
    if (!listEl) return;
    listEl.style.maxHeight = `${px}px`;
    listEl.style.overflowY = "auto";
  }

  // Ensure a "No matches found" status row exists (inject if missing)
  function ensureNoMatchesStatusLi(listEl) {
    if (!listEl) return null;

    let statusLi = listEl.querySelector('li[role="status"]');
    if (statusLi) return statusLi;

    statusLi = document.createElement("li");
    statusLi.setAttribute("role", "status");
    statusLi.className =
      "hsfc-DropdownOptions__List__ListItem hsfc-DropdownOptions__List__ListItem--disabled";
    statusLi.textContent = "No matches found";
    statusLi.style.display = "none";
    listEl.appendChild(statusLi);

    return statusLi;
  }

  function getStatusLis(listEl) {
    if (!listEl) return [];
    return toArray(listEl.querySelectorAll('li[role="status"]'));
  }

  function filterItemsWithStatus({ optionLis, statusLis, q }) {
    const query = norm(q);
    let visibleCount = 0;

    (statusLis || []).forEach((li) => {
      li.style.display = "none";
    });

    (optionLis || []).forEach((li) => {
      const hit = !query || norm(li.textContent).includes(query);
      li.style.display = hit ? "" : "none";
      if (hit) visibleCount++;
    });

    if (visibleCount === 0 && statusLis && statusLis.length) {
      statusLis.forEach((li) => {
        li.style.display = "";
      });
    }
  }

  function closeAllDropdowns(except) {
    [...openDropdowns].forEach((dd) => {
      if (dd !== except) dd.close();
    });
    openDropdowns.clear();
    if (except) openDropdowns.add(except);
  }

  // Position dropdown overlay with a small gap (kept tiny like Phone UI)
  function positionDropdownOptions(optionsEl, anchorEl, offsetParentEl, gap = 2) {
    if (!optionsEl || !anchorEl) return;

    const parent = offsetParentEl || optionsEl.offsetParent || anchorEl.offsetParent;
    if (!parent) return;

    setRelPosIfStatic(parent);

    optionsEl.style.position = "absolute";
    optionsEl.style.left = "0";
    optionsEl.style.right = "0";
    optionsEl.style.zIndex = "9999";

    // reduce accidental gaps from CSS
    optionsEl.style.marginTop = "0";
    optionsEl.style.marginBottom = "0";
    optionsEl.style.transform = "none";

    const prevDisplay = optionsEl.style.display;
    const prevVisibility = optionsEl.style.visibility;

    optionsEl.style.display = "flex";
    optionsEl.style.visibility = "hidden";

    const listEl =
      optionsEl.querySelector(".hsfc-DropdownOptions__List") ||
      optionsEl.querySelector('ul[role="listbox"]');
    setListScrollbar(listEl, 260);

    const anchorRect = anchorEl.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const optionsRect = optionsEl.getBoundingClientRect();
    const optionsHeight = optionsRect.height;

    const availableBelow = window.innerHeight - anchorRect.bottom - gap;
    const availableAbove = anchorRect.top - gap;

    const shouldDropDown =
      availableBelow >= Math.min(optionsHeight, 280) || availableBelow >= availableAbove;

    optionsEl.style.top = "";
    optionsEl.style.bottom = "";

    if (shouldDropDown) {
      const topPx = anchorRect.bottom - parentRect.top + gap;
      optionsEl.style.top = `${Math.max(0, topPx)}px`;
    } else {
      const bottomPx = parentRect.bottom - anchorRect.top + gap;
      optionsEl.style.bottom = `${Math.max(0, bottomPx)}px`;
    }

    optionsEl.style.visibility = prevVisibility || "";
    optionsEl.style.display = prevDisplay || "flex";
  }

  function createDropdown({
    toggleEl,
    optionsEl,
    searchEl,
    listEl,
    optionItems,
    ariaExpandedEl,
    onSelect,
    onOpen,
    onClose,
    anchorElForPosition,
    offsetParentEl,
    gapPx = 2,
  }) {
    let isOpen = false;

    ensureNoMatchesStatusLi(listEl);
    const statusLis = getStatusLis(listEl);

    const api = {
      open() {
        if (isOpen) return;
        isOpen = true;

        closeAllDropdowns(api);

        optionsEl.style.display = "flex";
        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "true");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "true");

        setListScrollbar(listEl, 260);
        positionDropdownOptions(
          optionsEl,
          anchorElForPosition || toggleEl,
          offsetParentEl,
          gapPx
        );

        if (searchEl) {
          searchEl.value = "";
          filterItemsWithStatus({ optionLis: optionItems, statusLis, q: "" });
          setTimeout(() => searchEl.focus(), 0);
        } else {
          filterItemsWithStatus({ optionLis: optionItems, statusLis, q: "" });
        }

        if (typeof onOpen === "function") {
          try {
            onOpen();
          } catch (_) {}
        }
      },
      close() {
        if (!isOpen) return;
        isOpen = false;

        optionsEl.style.display = "none";
        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "false");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "false");

        if (searchEl) {
          searchEl.value = "";
          filterItemsWithStatus({ optionLis: optionItems, statusLis, q: "" });
        } else {
          filterItemsWithStatus({ optionLis: optionItems, statusLis, q: "" });
        }

        openDropdowns.delete(api);

        if (typeof onClose === "function") {
          try {
            onClose();
          } catch (_) {}
        }
      },
      toggle() {
        isOpen ? api.close() : api.open();
      },
      contains(target) {
        return toggleEl.contains(target) || optionsEl.contains(target);
      },
      reposition() {
        if (!isOpen) return;
        positionDropdownOptions(
          optionsEl,
          anchorElForPosition || toggleEl,
          offsetParentEl,
          gapPx
        );
      },
      get isOpen() {
        return isOpen;
      },
    };

    toggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      api.toggle();
    });

    toggleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        api.toggle();
      }
      if (e.key === "Escape") api.close();
    });

    if (searchEl) {
      searchEl.addEventListener("input", () =>
        filterItemsWithStatus({
          optionLis: optionItems,
          statusLis,
          q: searchEl.value,
        })
      );

      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          api.close();
          // focus back to toggle
          try {
            toggleEl.focus();
          } catch (_) {}
        }
      });
    }

    optionItems.forEach((li) => {
      li.addEventListener("click", (e) => {
        e.preventDefault();
        onSelect(li);
        api.close();
      });

      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(li);
          api.close();
        }
      });
    });

    return api;
  }

  document.addEventListener("pointerdown", (e) => {
    if (!openDropdowns.size) return;
    for (const dd of openDropdowns) {
      if (dd.contains(e.target)) return;
    }
    closeAllDropdowns(null);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns(null);
  });

  window.addEventListener("resize", () => {
    for (const dd of openDropdowns) dd.reposition();
  });

  window.addEventListener(
    "scroll",
    () => {
      for (const dd of openDropdowns) dd.reposition();
    },
    true
  );

  // -------------------------
  // PostSubmit: show ONLY on confirmed success
  // -------------------------
  const FORM_WRAPPER =
    ROOT.querySelector('[data-hsfc-id="FormWrapper"]') || form.parentElement || ROOT;

  const POST_SUBMIT =
    FORM_WRAPPER?.querySelector?.('[data-hsfc-id="PostSubmit"]') ||
    ROOT.querySelector('[data-hsfc-id="PostSubmit"]');

  function showPostSubmitOnly() {
    hideEl(form);

    if (POST_SUBMIT) {
      showEl(POST_SUBMIT, "block");
      try {
        POST_SUBMIT.focus({ preventScroll: false });
      } catch (_) {}
    }

    clearFormLevelError();
    closeAllDropdowns(null);

    pendingSubmit = false;
    setSubmittingUI(false);
    clearSubmitTimeout();
  }

  function markSubmitFailed(message) {
    pendingSubmit = false;
    setSubmittingUI(false);
    clearSubmitTimeout();
    showFormLevelError(message || FORM_SERVER_MSG);
  }

  // HubSpot postMessage callbacks
  window.addEventListener("message", (event) => {
    const data = event?.data;
    if (!data) return;

    let obj = null;
    if (typeof data === "string") {
      try {
        obj = JSON.parse(data);
      } catch (_) {
        obj = null;
      }
    } else if (typeof data === "object") {
      obj = data;
    }
    if (!obj) return;

    const type = obj.type || obj.messageType || "";
    const eventName = obj.eventName || obj.name || "";

    const formGuid =
      obj.id ||
      obj.formGuid ||
      obj.formId ||
      obj?.data?.id ||
      obj?.data?.formGuid ||
      "";

    const ourGuid =
      form.getAttribute("data-form-id") || form.dataset.formId || form.dataset.formGuid || "";

    const isHsCallback =
      type === "hsFormCallback" || type === "hsformsCallback" || type === "hsForm" || false;

    const isSubmitted =
      eventName === "onFormSubmitted" ||
      eventName === "onFormSubmit" ||
      eventName === "formSubmitted" ||
      eventName === "submitted" ||
      false;

    if (isHsCallback && isSubmitted) {
      if (!ourGuid || !formGuid || ourGuid === formGuid) showPostSubmitOnly();
    }
  });

  // Fallback: iframe load as "probable success"
  function hookIframeLoadFallback() {
    const targetName = form.getAttribute("target") || "";
    if (!targetName) return;

    let iframe = null;
    try {
      iframe = document.querySelector(`iframe[name="${CSS.escape(targetName)}"]`);
    } catch (_) {
      iframe = document.querySelector(`iframe[name="${targetName}"]`);
    }
    if (!iframe) return;

    iframe.addEventListener("load", () => {
      if (!pendingSubmit) return;

      // if any visible errors exist, assume failure (HubSpot-side validation or other)
      const anyVisibleError = toArray(form.querySelectorAll(".hsfc-ErrorAlert")).some((el) =>
        isVisible(el)
      );

      if (anyVisibleError) {
        markSubmitFailed(FORM_SERVER_MSG);
        return;
      }

      showPostSubmitOnly();
    });
  }
  hookIframeLoadFallback();

  // -------------------------
  // City dropdown (uses identical dropdown mechanics)
  // -------------------------
  const cityHidden = form.querySelector('input[type="hidden"][name="0-1/location_"]');
  if (cityHidden) {
    const cityField = cityHidden.closest(".hsfc-DropdownField");
    const cityCombobox = cityField?.querySelector("input.hsfc-TextInput--button");
    const cityInputWrap = cityField?.querySelector(".hsfc-DropdownInput");
    const cityOptions = cityField?.querySelector(".hsfc-DropdownOptions");
    const citySearch = cityOptions?.querySelector('input[role="searchbox"]');
    const cityList = cityOptions?.querySelector('ul[role="listbox"]');
    const cityItems = cityList ? toArray(cityList.querySelectorAll('li[role="option"]')) : [];

    let cityTouched = false;

    if (cityField && cityCombobox && cityInputWrap && cityOptions && cityList) {
      ensureNoMatchesStatusLi(cityList);

      function setCitySelected(li) {
        cityTouched = true;

        const value = (li.textContent || "").trim();
        cityCombobox.value = value;
        cityHidden.value = value;

        cityItems.forEach((item) => {
          const selected = item === li;
          item.setAttribute("aria-selected", selected ? "true" : "false");
          item.classList.toggle(
            "hsfc-DropdownOptions__List__ListItem--selected",
            selected
          );
        });

        clearError(cityField, cityCombobox);
        clearFormLevelError();
      }

      const cityDropdown = createDropdown({
        toggleEl: cityInputWrap,
        optionsEl: cityOptions,
        searchEl: citySearch,
        listEl: cityList,
        optionItems: cityItems,
        ariaExpandedEl: cityCombobox,
        onSelect: setCitySelected,
        anchorElForPosition: cityInputWrap,
        offsetParentEl: cityInputWrap,
        gapPx: 2,
        onOpen: () => {
          cityTouched = true;
          clearError(cityField, cityCombobox);
          clearFormLevelError();
        },
        onClose: () => {
          if (cityTouched && !cityHidden.value.trim()) {
            showError(cityField, cityCombobox, REQUIRED_MSG);
          }
        },
      });

      cityCombobox.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          cityTouched = true;
          cityDropdown.toggle();
        }
        if (e.key === "Escape") cityDropdown.close();
      });

      cityCombobox.addEventListener("focus", () => {
        cityTouched = true;
        clearError(cityField, cityCombobox);
        clearFormLevelError();
      });
    }
  }

  // -------------------------
  // Phone: strict-ish validation + PH default preserved + blank until typing
  // -------------------------
  const phoneHidden = form.querySelector('input[type="hidden"][name="0-1/phone"]');
  if (phoneHidden) {
    const phoneField = phoneHidden.closest(".hsfc-PhoneField");
    const phoneInput = phoneField?.querySelector?.('input[type="tel"]');
    const phoneUI = phoneField?.querySelector?.(".hsfc-PhoneInput");
    const flagAndCaret = phoneUI?.querySelector?.(".hsfc-PhoneInput__FlagAndCaret");
    const flagSpan = phoneUI?.querySelector?.(".hsfc-PhoneInput__FlagAndCaret__Flag");
    const phoneOptions = phoneUI?.querySelector?.(".hsfc-DropdownOptions");
    const phoneSearch = phoneOptions?.querySelector?.('input[role="searchbox"]');
    const phoneList = phoneOptions?.querySelector?.('ul[role="listbox"]');
    const countryLis = toArray(phoneList?.querySelectorAll?.('li[role="option"]'));

    if (phoneField && phoneInput && phoneUI && flagAndCaret && phoneOptions && phoneList) {
      ensureNoMatchesStatusLi(phoneList);

      function parseDialCode(text) {
        const m = (text || "").trim().match(/\+[\d]+$/);
        return m ? m[0] : "";
      }

      function flagEmojiToISO2(flag) {
        const chars = Array.from((flag || "").trim());
        if (chars.length !== 2) return "";
        const A = 0x1f1e6;
        const c0 = chars[0].codePointAt(0);
        const c1 = chars[1].codePointAt(0);
        if (!c0 || !c1) return "";
        if (c0 < A || c1 < A) return "";
        const iso2 = String.fromCharCode(c0 - A + 65, c1 - A + 65);
        return /^[A-Z]{2}$/.test(iso2) ? iso2 : "";
      }

      function sanitizeDigitsOnly(raw) {
        return ((raw || "").toString().match(/\d+/g) || []).join("");
      }

      function sanitizePhoneRawNoSpaces(raw) {
        let v = (raw || "").toString();
        v = v.replace(/[^\d+]/g, "");
        if (v.startsWith("+")) v = "+" + v.slice(1).replace(/\+/g, "");
        else v = v.replace(/\+/g, "");
        return v;
      }

      // IMPORTANT:
      // - If user typed '+' -> treat as international as-is.
      // - If user typed digits WITHOUT '+' -> treat as national and prefix with selected dial code.
      // - If empty -> keep empty (no country code displayed).
      function normalizePhoneForProcessing(raw, selectedDialCode) {
        const rawStr = (raw || "").toString();
        const trimmed = rawStr.trim();

        if (!trimmed) return "";

        const hasPlus = trimmed.includes("+");
        if (hasPlus) {
          let v = sanitizePhoneRawNoSpaces(trimmed).trim();
          if (v === "+") return "";
          // ensure single leading '+'
          if (v && !v.startsWith("+") && /^\d/.test(v)) v = `+${v}`;
          return v;
        }

        const digits = sanitizeDigitsOnly(trimmed);
        if (!digits) return "";

        // prefix with selected dial code (PH default from HTML)
        const dial = selectedDialCode || "";
        if (!dial) return `+${digits}`; // fallback
        return `${dial}${digits}`;
      }

      function digitsCount(s) {
        return ((s || "").match(/\d/g) || []).length;
      }

      function digitCountBeforeCaret(value, caretPos) {
        const before = (value || "").slice(0, Math.max(0, caretPos || 0));
        return digitsCount(before);
      }

      function caretIndexAfterNDigits(formatted, nDigits) {
        if (!formatted) return 0;
        if (nDigits <= 0) return formatted.startsWith("+") ? 1 : 0;
        let count = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) count++;
          if (count >= nDigits) return i + 1;
        }
        return formatted.length;
      }

      function formatWithAsYouType(normalizedPlusDigits, iso2Hint) {
        if (!AsYouTypeCtor || !normalizedPlusDigits) return null;
        try {
          const ayt = iso2Hint ? new AsYouTypeCtor(iso2Hint) : new AsYouTypeCtor();
          const out = ayt.input(normalizedPlusDigits);

          const safe = (out || "")
            .replace(/[^\d+]+/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();

          const e164 =
            typeof ayt.getNumberValue === "function" ? ayt.getNumberValue() : "";
          const detectedCountry =
            typeof ayt.getCountry === "function" ? ayt.getCountry() : "";

          return {
            display: safe || normalizedPlusDigits,
            e164: e164 || normalizedPlusDigits,
            detectedCountry: detectedCountry || "",
          };
        } catch (_) {
          return null;
        }
      }

      function groupDigits(digits, groups) {
        const out = [];
        let i = 0;
        for (const g of groups) {
          if (i >= digits.length) break;
          out.push(digits.slice(i, i + g));
          i += g;
        }
        if (i < digits.length) out.push(digits.slice(i));
        return out.filter(Boolean).join(" ");
      }

      function findDialMatch(v, dialCodesSortedDesc) {
        if (!v) return "";
        return dialCodesSortedDesc.find((dc) => v.startsWith(dc)) || "";
      }

      function formatPhoneDisplayFallback(normalized, dialCodesSortedDesc) {
        if (!normalized) return "";
        const dialCode = findDialMatch(normalized, dialCodesSortedDesc);
        if (!dialCode) return normalized;

        const digitsAll = normalized.replace(/\D/g, "");
        const dialDigits = dialCode.replace(/\D/g, "");
        const national = digitsAll.slice(dialDigits.length);

        if (dialCode === "+63") {
          const g = national.length <= 3 ? [national.length] : [3, 3, 4];
          return `+63 ${groupDigits(national, g)}`.trim();
        }

        if (dialCode === "+1") {
          const g = national.length <= 3 ? [national.length] : [3, 3, 4];
          return `+1 ${groupDigits(national, g)}`.trim();
        }

        if (dialCode === "+65" || dialCode === "+852") {
          const g = national.length <= 4 ? [national.length] : [4, 4];
          return `${dialCode} ${groupDigits(national, g)}`.trim();
        }

        const groups = [];
        let remaining = national.length;
        while (remaining > 3) {
          groups.push(3);
          remaining -= 3;
        }
        if (remaining > 0) groups.push(remaining);

        return `${dialCode} ${groupDigits(national, groups)}`.trim();
      }

      function autoFormatPhone(normalizedPlusDigits, iso2Hint, dialCodesSortedDesc) {
        const viaLib = formatWithAsYouType(normalizedPlusDigits, iso2Hint);
        if (viaLib) return viaLib;
        return {
          display: formatPhoneDisplayFallback(normalizedPlusDigits, dialCodesSortedDesc),
          e164: normalizedPlusDigits,
          detectedCountry: "",
        };
      }

      const countries = countryLis
        .map((li) => {
          const text = (li.textContent || "").trim();
          const dialCode = parseDialCode(text);
          const flagEmoji = text.split(/\s+/)[0] || "";
          const iso2 = flagEmojiToISO2(flagEmoji);
          const display = flagEmoji || iso2 || "";
          return { li, text, dialCode, flagEmoji, iso2, display };
        })
        .filter((c) => c.dialCode);

      const dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
        (a, b) => b.length - a.length
      );

      const countryByIso2 = new Map();
      const countriesByDial = new Map();
      countries.forEach((c) => {
        if (c.iso2 && !countryByIso2.has(c.iso2)) countryByIso2.set(c.iso2, c);
        if (!countriesByDial.has(c.dialCode)) countriesByDial.set(c.dialCode, []);
        countriesByDial.get(c.dialCode).push(c);
      });

      function preferredCountryForDial(dialCode) {
        const list = countriesByDial.get(dialCode) || [];
        if (!list.length) return null;
        if (dialCode === "+1") {
          const us = list.find((c) => (c.iso2 || "").toUpperCase() === "US");
          if (us) return us;
        }
        return list[0] || null;
      }

      const MIN_NATIONAL_DIGITS_BY_DIAL = {
        "+63": 10,
        "+1": 10,
        "+7": 10,
        "+65": 8,
        "+852": 8,
      };
      const DEFAULT_MIN_NATIONAL_DIGITS = 7;

      let selectedCountry = null;

      function updateCountrySelectionUI(country) {
        countries.forEach((c) => {
          const selected = !!country && c === country;
          c.li.setAttribute("aria-selected", selected ? "true" : "false");
          c.li.classList.toggle(
            "hsfc-DropdownOptions__List__ListItem--selected",
            selected
          );
        });
        if (flagSpan && country?.display) flagSpan.textContent = country.display;
      }

      function syncHiddenPhoneValue(e164) {
        phoneHidden.value = e164 || "";
      }

      function getMinNationalDigits(dialCode) {
        return MIN_NATIONAL_DIGITS_BY_DIAL[dialCode] || DEFAULT_MIN_NATIONAL_DIGITS;
      }

      function validatePhoneValue(rawValue) {
        const selectedDial = selectedCountry?.dialCode || "";
        const normalized = normalizePhoneForProcessing(rawValue, selectedDial);

        if (!normalized) return { ok: false, message: REQUIRED_MSG };

        const digitsOnly = normalized.replace(/\D/g, "");
        if (digitsOnly.length > 15) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        if (parsePhoneNumberFromString) {
          try {
            const dial = findDialMatch(normalized, dialCodesSortedDesc);
            const hint =
              dial && (countriesByDial.get(dial) || []).length > 1
                ? ""
                : selectedCountry?.iso2 || "";

            const parsed = hint
              ? parsePhoneNumberFromString(normalized, hint)
              : parsePhoneNumberFromString(normalized);

            if (parsed) {
              if (typeof parsed.isValid === "function" && parsed.isValid()) {
                return { ok: true, message: "" };
              }
              return { ok: false, message: PHONE_INVALID_FORMAT_MSG };
            }
          } catch (_) {}
        }

        const dialCode = findDialMatch(normalized, dialCodesSortedDesc);
        if (!dialCode) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        const dialDigits = dialCode.replace(/\D/g, "");
        const nationalDigits = Math.max(0, digitsOnly.length - dialDigits.length);

        if (nationalDigits === 0) return { ok: false, message: REQUIRED_MSG };

        const minNat = getMinNationalDigits(dialCode);
        if (nationalDigits < minNat) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        return { ok: true, message: "" };
      }

      function setSelectedCountry(country, rewriteInputPrefix) {
        selectedCountry = country || null;
        updateCountrySelectionUI(selectedCountry);

        const rawNow = (phoneInput.value || "").trim();

        // IMPORTANT UX:
        // If input is empty, do NOT inject dial code. Keep blank until user types digits.
        if (rewriteInputPrefix && selectedCountry && !rawNow) {
          syncHiddenPhoneValue("");
          clearError(phoneField, phoneInput);
          clearFormLevelError();
          return;
        }

        // Otherwise, re-normalize/format using selected country as national prefix (if no '+')
        const selectedDial = selectedCountry?.dialCode || "";
        const normalized = normalizePhoneForProcessing(phoneInput.value || "", selectedDial);

        const dial = findDialMatch(normalized, dialCodesSortedDesc);
        const shared = dial && (countriesByDial.get(dial) || []).length > 1;

        const fmt = autoFormatPhone(
          normalized,
          shared ? "" : selectedCountry?.iso2 || "",
          dialCodesSortedDesc
        );

        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);

        clearError(phoneField, phoneInput);
        clearFormLevelError();
      }

      function detectAndSyncCountryFromNormalized(normalized) {
        if (!normalized) {
          // keep selection UI (PH stays selected), but do not inject dial code into the field
          syncHiddenPhoneValue("");
          return;
        }

        const dial = findDialMatch(normalized, dialCodesSortedDesc);
        const shared = dial && (countriesByDial.get(dial) || []).length > 1;

        if (AsYouTypeCtor) {
          const fmt = formatWithAsYouType(normalized, shared ? "" : selectedCountry?.iso2 || "");
          const detected = (fmt?.detectedCountry || "").toUpperCase();

          if (detected && countryByIso2.has(detected)) {
            const found = countryByIso2.get(detected);
            if (found && (!selectedCountry || selectedCountry !== found)) {
              selectedCountry = found;
              updateCountrySelectionUI(selectedCountry);
              return;
            }
          }
        }

        // If dial exists, apply preferred fallback (only meaningful for shared codes like +1)
        if (dial) {
          const fallback = preferredCountryForDial(dial);
          if (fallback && (!selectedCountry || selectedCountry !== fallback)) {
            selectedCountry = fallback;
            updateCountrySelectionUI(selectedCountry);
          }
        }
      }

      phoneCtx = {
        field: phoneField,
        input: phoneInput,
        validate() {
          return validatePhoneValue(phoneInput.value || "");
        },
      };

      // Initial country: respect HTML-selected (PH in your HTML)
      const initiallySelectedLi =
        countryLis.find((li) => li.getAttribute("aria-selected") === "true") ||
        countryLis.find((li) =>
          li.classList.contains("hsfc-DropdownOptions__List__ListItem--selected")
        ) ||
        null;

      if (initiallySelectedLi) {
        const match = countries.find((c) => c.li === initiallySelectedLi) || null;
        if (match) selectedCountry = match;
      }

      // Initial UI sync: DO NOT inject dial code into empty input
      updateCountrySelectionUI(selectedCountry);
      if (!String(phoneInput.value || "").trim()) {
        syncHiddenPhoneValue("");
      } else {
        const selectedDial = selectedCountry?.dialCode || "";
        const normalized = normalizePhoneForProcessing(phoneInput.value || "", selectedDial);
        const dial = findDialMatch(normalized, dialCodesSortedDesc);
        const shared = dial && (countriesByDial.get(dial) || []).length > 1;

        const fmt = autoFormatPhone(
          normalized,
          shared ? "" : selectedCountry?.iso2 || "",
          dialCodesSortedDesc
        );
        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);
        detectAndSyncCountryFromNormalized(fmt.e164 || normalized);
      }

      // Country dropdown
      createDropdown({
        toggleEl: flagAndCaret,
        optionsEl: phoneOptions,
        searchEl: phoneSearch,
        listEl: phoneList,
        optionItems: countryLis,
        ariaExpandedEl: flagAndCaret,
        onSelect: (li) => {
          const match = countries.find((c) => c.li === li) || null;
          setSelectedCountry(match, true);
        },
        anchorElForPosition: phoneUI,
        offsetParentEl: phoneUI,
        gapPx: 2,
        onOpen: () => {
          clearError(phoneField, phoneInput);
          clearFormLevelError();
        },
      });

      // Input restrictions: allow digits and plus; no spaces
      phoneInput.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.metaKey) return;

        const k = e.key;
        const okKeys = [
          "Backspace",
          "Delete",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "Tab",
          "Enter",
          "Escape",
        ];
        if (okKeys.includes(k)) return;
        if (k >= "0" && k <= "9") return;

        if (k === " ") {
          e.preventDefault();
          return;
        }

        if (k === "+") {
          const v = phoneInput.value || "";
          const start =
            typeof phoneInput.selectionStart === "number" ? phoneInput.selectionStart : 0;
          const end =
            typeof phoneInput.selectionEnd === "number" ? phoneInput.selectionEnd : 0;

          const replacingAll = start === 0 && end === v.length;
          const replacingFirstChar = start === 0 && end >= 1;

          if ((start === 0 && !v.includes("+")) || replacingAll || replacingFirstChar) return;

          e.preventDefault();
          return;
        }

        e.preventDefault();
      });

      phoneInput.addEventListener("paste", (e) => {
        if (!e.clipboardData) return;
        e.preventDefault();

        const pasted = e.clipboardData.getData("text") || "";
        const insert = sanitizePhoneRawNoSpaces(pasted);

        const current = phoneInput.value || "";
        const start =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : current.length;
        const end =
          typeof phoneInput.selectionEnd === "number" ? phoneInput.selectionEnd : start;

        const caretDigits = digitCountBeforeCaret(current, start);

        const next = current.slice(0, start) + insert + current.slice(end);
        const selectedDial = selectedCountry?.dialCode || "";
        const normalized = normalizePhoneForProcessing(next, selectedDial);

        if (!normalized) {
          phoneInput.value = "";
          syncHiddenPhoneValue("");
          return;
        }

        const dial = findDialMatch(normalized, dialCodesSortedDesc);
        const shared = dial && (countriesByDial.get(dial) || []).length > 1;

        const fmt = autoFormatPhone(
          normalized,
          shared ? "" : selectedCountry?.iso2 || "",
          dialCodesSortedDesc
        );

        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);

        const newCaret = caretIndexAfterNDigits(phoneInput.value, caretDigits);
        try {
          phoneInput.setSelectionRange(newCaret, newCaret);
        } catch (_) {}

        clearError(phoneField, phoneInput);
        clearFormLevelError();

        detectAndSyncCountryFromNormalized(fmt.e164 || normalized);
      });

      phoneInput.addEventListener("input", () => {
        clearError(phoneField, phoneInput);
        clearFormLevelError();

        const raw = phoneInput.value || "";
        const trimmed = raw.trim();

        // If cleared -> keep blank, do not inject a country code
        if (!trimmed) {
          phoneInput.value = "";
          syncHiddenPhoneValue("");
          return;
        }

        const caretPos =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : raw.length;

        const caretDigits = digitCountBeforeCaret(raw, caretPos);

        const selectedDial = selectedCountry?.dialCode || "";
        const normalized = normalizePhoneForProcessing(raw, selectedDial);

        const dial = findDialMatch(normalized, dialCodesSortedDesc);
        const shared = dial && (countriesByDial.get(dial) || []).length > 1;

        const fmtPrimary = formatWithAsYouType(
          normalized,
          shared ? "" : selectedCountry?.iso2 || ""
        );
        const fmt = fmtPrimary
          ? fmtPrimary
          : autoFormatPhone(
              normalized,
              shared ? "" : selectedCountry?.iso2 || "",
              dialCodesSortedDesc
            );

        phoneInput.value = fmt.display || normalized;

        const newCaret = caretIndexAfterNDigits(phoneInput.value, caretDigits);
        try {
          phoneInput.setSelectionRange(newCaret, newCaret);
        } catch (_) {}

        syncHiddenPhoneValue(fmt.e164 || normalized);

        // Auto-switch for shared dial codes (+1) as digits come in
        detectAndSyncCountryFromNormalized(fmt.e164 || normalized);
      });

      phoneInput.addEventListener("focus", () => {
        clearError(phoneField, phoneInput);
        clearFormLevelError();
      });

      phoneInput.addEventListener("blur", () => {
        const raw = (phoneInput.value || "").trim();
        if (!raw) {
          phoneInput.value = "";
          syncHiddenPhoneValue("");
          return;
        }

        const res = validatePhoneValue(raw);
        if (!res.ok) showError(phoneField, phoneInput, res.message);
      });
    }
  }

  // -------------------------
  // First Name
  // -------------------------
  const firstNameInput = form.querySelector('input[name="0-1/firstname"]');
  if (firstNameInput) {
    const field = firstNameInput.closest(".hsfc-TextField");
    firstNameInput.addEventListener("input", () => {
      clearError(field, firstNameInput);
      clearFormLevelError();
    });
    firstNameInput.addEventListener("blur", () => {
      if (!firstNameInput.value.trim()) showError(field, firstNameInput, REQUIRED_MSG);
    });
  }

  // -------------------------
  // Email: stricter format + common typo suggestion (NO error on suggestion click/blur)
  // Plus: domain MX/A check on submit (strict gatekeeper)
  // -------------------------
  function isEmailBasicFormat(v) {
    const s = (v || "").trim();
    if (!s) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(s);
  }

  function isEmailStrictEnough(email) {
    const v = (email || "").trim();
    if (!v) return { ok: false, reason: "required" };
    if (v.length > 254) return { ok: false, reason: "format" };

    const at = v.lastIndexOf("@");
    if (at <= 0 || at === v.length - 1) return { ok: false, reason: "format" };

    const local = v.slice(0, at);
    const domain = v.slice(at + 1);

    if (!local || !domain) return { ok: false, reason: "format" };
    if (local.length > 64) return { ok: false, reason: "format" };

    // no spaces
    if (/\s/.test(v)) return { ok: false, reason: "format" };

    // no leading/trailing dot in local or domain
    if (local.startsWith(".") || local.endsWith(".")) return { ok: false, reason: "format" };
    if (domain.startsWith(".") || domain.endsWith(".")) return { ok: false, reason: "format" };

    // no consecutive dots
    if (v.includes("..")) return { ok: false, reason: "format" };

    // must contain at least one dot in domain
    if (!domain.includes(".")) return { ok: false, reason: "format" };

    // basic regex still must pass
    if (!isEmailBasicFormat(v)) return { ok: false, reason: "format" };

    return { ok: true, reason: "" };
  }

  const COMMON_EMAIL_DOMAINS = [
    "gmail.com",
    "yahoo.com",
    "yahoo.com.ph",
    "ymail.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "gmx.com",
  ];

  const COMMON_TLDS = [
    "com",
    "net",
    "org",
    "edu",
    "gov",
    "io",
    "co",
    "me",
    "ph",
    "asia",
    "info",
    "biz",
    "app",
    "dev",
  ];

  function levenshtein(a, b) {
    a = (a || "").toLowerCase();
    b = (b || "").toLowerCase();
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function bestCloseMatch(target, candidates) {
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = levenshtein(target, c);
      if (d < bestScore) {
        bestScore = d;
        best = c;
      }
    }
    return { best, score: bestScore };
  }

  function getEmailSuggestion(email) {
    const v = (email || "").trim();
    const at = v.lastIndexOf("@");
    if (at <= 0) return null;

    const local = v.slice(0, at);
    const domain = v.slice(at + 1).toLowerCase();
    if (!local || !domain) return null;

    if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;

    const domainMatch = bestCloseMatch(domain, COMMON_EMAIL_DOMAINS);
    if (domainMatch.best && domainMatch.score <= 2) {
      return `${local}@${domainMatch.best}`;
    }

    const parts = domain.split(".");
    if (parts.length >= 2) {
      const tld = parts[parts.length - 1];
      const base = parts.slice(0, -1).join(".");
      const tldMatch = bestCloseMatch(tld, COMMON_TLDS);

      if (tldMatch.best && tldMatch.score <= 2) {
        const suggested = `${base}.${tldMatch.best}`;
        if (base) return `${local}@${suggested}`;
      }
    }

    return null;
  }

  function isKnownCommonTld(email) {
    const v = (email || "").trim().toLowerCase();
    const at = v.lastIndexOf("@");
    if (at <= 0) return false;
    const domain = v.slice(at + 1);
    const parts = domain.split(".");
    if (parts.length < 2) return false;
    const tld = parts[parts.length - 1];
    return COMMON_TLDS.includes(tld);
  }

  function getEmailDomain(email) {
    const v = (email || "").trim();
    const at = v.lastIndexOf("@");
    if (at <= 0) return "";
    return v.slice(at + 1).trim().toLowerCase();
  }

  // DNS check via DoH (MX -> fallback A)
  async function checkDomainHasMxOrA(domain, timeoutMs = 2500) {
    if (!domain) return false;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    async function query(type) {
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(
        domain
      )}&type=${encodeURIComponent(type)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/dns-json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("dns_http");
      const json = await res.json();
      // Status 0 = NOERROR
      if (json && json.Status === 0 && Array.isArray(json.Answer) && json.Answer.length > 0) {
        return true;
      }
      return false;
    }

    try {
      const hasMx = await query("MX");
      if (hasMx) return true;
      const hasA = await query("A");
      return !!hasA;
    } finally {
      clearTimeout(t);
    }
  }

  const emailInput = form.querySelector('input[name="0-1/email"]');
  if (emailInput) {
    const field = emailInput.closest(".hsfc-EmailField");
    let lastSuggestion = null;

    emailInput.addEventListener("input", () => {
      clearError(field, emailInput);
      clearInfo(field);
      clearFormLevelError();
      lastSuggestion = null;
    });

    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();
      clearInfo(field);

      const strict = isEmailStrictEnough(v);
      if (!strict.ok) {
        if (strict.reason === "required") showError(field, emailInput, REQUIRED_MSG);
        else showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
        return;
      }

      // Suggestion should NOT create an error on blur.
      const suggestion = getEmailSuggestion(v);
      const tldIsKnown = isKnownCommonTld(v);

      lastSuggestion = suggestion && !tldIsKnown ? suggestion : null;

      if (lastSuggestion) {
        clearError(field, emailInput);
        showEmailSuggestion(field, emailInput, lastSuggestion);
        return;
      }

      clearError(field, emailInput);
      clearInfo(field);
    });
  }

  // -------------------------
  // Checkbox
  // -------------------------
  const checkboxInput = form.querySelector(
    'input[type="checkbox"][name="0-1/confirmation_checkbox"]'
  );
  if (checkboxInput) {
    const field = checkboxInput.closest(".hsfc-CheckboxField");

    checkboxInput.value = checkboxInput.checked ? "true" : "false";

    checkboxInput.addEventListener("change", () => {
      checkboxInput.value = checkboxInput.checked ? "true" : "false";
      if (checkboxInput.checked) clearError(field, checkboxInput);
      clearFormLevelError();
    });

    checkboxInput.addEventListener("blur", () => {
      if (!checkboxInput.checked) showError(field, checkboxInput, REQUIRED_MSG);
    });

    checkboxInput.addEventListener("focus", () => {
      clearError(field, checkboxInput);
      clearFormLevelError();
    });
  }

  // -------------------------
  // Submit validation (sync + async) + success handling
  // -------------------------
  async function runAsyncSubmitChecks() {
    // Email “real-ish” check: domain must have MX or A (strict)
    if (emailInput) {
      const field = emailInput.closest(".hsfc-EmailField");
      const v = emailInput.value.trim();

      const strict = isEmailStrictEnough(v);
      if (!strict.ok) return { ok: false, target: emailInput };

      // If there is a suggestion due to likely typo and user didn't accept it,
      // block ONLY on submit (as requested).
      const suggestion = getEmailSuggestion(v);
      const tldIsKnown = isKnownCommonTld(v);
      if (!tldIsKnown && suggestion) {
        showError(field, emailInput, EMAIL_SUGGESTION_SUBMIT_MSG);
        showEmailSuggestion(field, emailInput, suggestion);
        return { ok: false, target: emailInput };
      }

      // DNS check
      const domain = getEmailDomain(v);
      try {
        const ok = await checkDomainHasMxOrA(domain);
        if (!ok) {
          showError(field, emailInput, EMAIL_DOMAIN_INVALID_MSG);
          return { ok: false, target: emailInput };
        }
      } catch (_) {
        // If we can't verify due to network/CORS/etc., treat as network issue and block.
        showFormLevelError(FORM_NETWORK_MSG);
        return { ok: false, target: emailInput };
      }
    }

    return { ok: true, target: null };
  }

  form.addEventListener(
    "submit",
    async (e) => {
      if (programmaticSubmit) return;

      // Prevent duplicate submissions
      if (pendingSubmit) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      clearFormLevelError();

      const invalidTargets = [];

      // First Name
      if (firstNameInput) {
        const field = firstNameInput.closest(".hsfc-TextField");
        if (!firstNameInput.value.trim()) {
          showError(field, firstNameInput, REQUIRED_MSG);
          invalidTargets.push(firstNameInput);
        }
      }

      // City
      const cityHidden2 = form.querySelector('input[type="hidden"][name="0-1/location_"]');
      if (cityHidden2) {
        const cityField = cityHidden2.closest(".hsfc-DropdownField");
        const cityCombobox = cityField?.querySelector("input.hsfc-TextInput--button");
        if (cityField && cityCombobox && !cityHidden2.value.trim()) {
          showError(cityField, cityCombobox, REQUIRED_MSG);
          invalidTargets.push(cityCombobox);
        }
      }

      // Phone
      if (phoneCtx?.field && phoneCtx?.input && typeof phoneCtx.validate === "function") {
        const res = phoneCtx.validate();
        if (!res.ok) {
          showError(phoneCtx.field, phoneCtx.input, res.message);
          invalidTargets.push(phoneCtx.input);
        }
      }

      // Email (sync checks only)
      if (emailInput) {
        const field = emailInput.closest(".hsfc-EmailField");
        const v = emailInput.value.trim();

        clearInfo(field);

        const strict = isEmailStrictEnough(v);
        if (!strict.ok) {
          if (strict.reason === "required") showError(field, emailInput, REQUIRED_MSG);
          else showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
          invalidTargets.push(emailInput);
        }
      }

      // Checkbox
      if (checkboxInput) {
        const field = checkboxInput.closest(".hsfc-CheckboxField");
        if (!checkboxInput.checked) {
          showError(field, checkboxInput, REQUIRED_MSG);
          invalidTargets.push(checkboxInput);
        }
      }

      if (invalidTargets.length) {
        e.preventDefault();
        e.stopPropagation();
        closeAllDropdowns(null);
        showFormLevelError(FORM_REQUIRED_MSG);
        try {
          invalidTargets[0].focus();
        } catch (_) {}
        return;
      }

      // Now run async checks (DNS + submit-only email suggestion gate)
      e.preventDefault();
      e.stopPropagation();

      // If offline, fail fast
      if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) {
        showFormLevelError(FORM_NETWORK_MSG);
        return;
      }

      setSubmittingUI(true);
      showFormLevelError(FORM_SUBMITTING_MSG);

      const asyncRes = await runAsyncSubmitChecks();
      if (!asyncRes.ok) {
        setSubmittingUI(false);
        // keep whatever error we already showed; also focus the field
        if (asyncRes.target) {
          try {
            asyncRes.target.focus();
          } catch (_) {}
        }
        return;
      }

      // All good -> submit for real
      clearFormLevelError();
      pendingSubmit = true;

      // Safety timeout: if no callback/iframe load happens, show server/network error
      clearSubmitTimeout();
      submitTimeoutId = setTimeout(() => {
        if (!pendingSubmit) return;
        // if any visible field error appeared, keep that; otherwise show generic failure
        const anyVisibleError = toArray(form.querySelectorAll(".hsfc-ErrorAlert")).some((el) =>
          isVisible(el)
        );
        markSubmitFailed(anyVisibleError ? FORM_SERVER_MSG : FORM_NETWORK_MSG);
      }, 12000);

      try {
        programmaticSubmit = true;
        form.submit();
      } finally {
        programmaticSubmit = false;
      }
    },
    true
  );
});