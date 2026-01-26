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
  const EMAIL_INVALID_MSG = "Please enter a valid email address.";
  const EMAIL_INVALID_FORMAT_MSG = "Email must be formatted correctly.";
  const PHONE_INVALID_FORMAT_MSG =
    "This phone number is either invalid or is in the wrong format.";

  const openDropdowns = new Set();
  const toArray = (x) => Array.prototype.slice.call(x || []);
  const norm = (s) => (s || "").toString().trim().toLowerCase();

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

  // -------------------------
  // Alerts/PostSubmit (you set style="display:none" in HTML; we respect that)
  // We still enforce aria defaults and ensure PostSubmit is hidden initially.
  // -------------------------
  function normalizeStaticBits() {
    const allAlerts = form.querySelectorAll(".hsfc-ErrorAlert, .hsfc-InfoAlert");
    allAlerts.forEach((el) => {
      // respect your inline display:none; just ensure ARIA is sane
      if (el.classList.contains("hsfc-ErrorAlert")) {
        el.setAttribute("role", el.getAttribute("role") || "alert");
        el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
      } else {
        el.setAttribute("role", el.getAttribute("role") || "status");
        el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
      }
      // do not force-hide if you already did; but if someone forgot, keep it hidden
      if (!el.style.display) el.style.display = "none";
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
  // Error/Info helpers (REUSE existing HTML elements)
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
    }

    btn.textContent = `Did you mean ${suggestion}?`;

    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", () => {
      inputEl.value = suggestion;
      clearError(fieldEl, inputEl);
      clearInfo(fieldEl);

      try {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}

      inputEl.focus();
    });

    showEl(infoEl, "block");
  }

  // -------------------------
  // Dropdown utilities (Phone + City should behave IDENTICALLY)
  // -------------------------
  function setListScrollbar(listEl, px = 260) {
    if (!listEl) return;
    listEl.style.maxHeight = `${px}px`;
    listEl.style.overflowY = "auto";
  }

  // Ensure a HubSpot-native looking status row exists (we inject if missing)
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
    // include injected role="status" item(s)
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

  // Position options as an overlay with a small gap (same for City + Phone)
  function positionDropdownOptions(optionsEl, anchorEl, offsetParentEl, gap = 2) {
    if (!optionsEl || !anchorEl) return;

    // We intentionally position relative to the input wrapper itself (offsetParentEl),
    // so City/Phone behave identically and avoid weird "big gap" cases.
    const parent = offsetParentEl || optionsEl.offsetParent || anchorEl.offsetParent;
    if (!parent) return;

    setRelPosIfStatic(parent);

    optionsEl.style.position = "absolute";
    optionsEl.style.left = "0";
    optionsEl.style.right = "0";
    optionsEl.style.zIndex = "9999";

    // Kill unexpected spacing coming from CSS
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
    optionItems, // li[role="option"]
    ariaExpandedEl,
    onSelect,
    onOpen,
    onClose,
    anchorElForPosition,
    offsetParentEl,
    gapPx = 2,
  }) {
    let isOpen = false;

    // Make sure "No matches found" exists
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
          toggleEl.focus();
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
  // PostSubmit: show ONLY on success; hide the whole form
  // -------------------------
  const FORM_WRAPPER =
    ROOT.querySelector('[data-hsfc-id="FormWrapper"]') || form.parentElement || ROOT;

  const POST_SUBMIT =
    FORM_WRAPPER?.querySelector?.('[data-hsfc-id="PostSubmit"]') ||
    ROOT.querySelector('[data-hsfc-id="PostSubmit"]');

  let pendingSubmit = false;

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
  }

  // HubSpot postMessage callbacks (when present)
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

      const anyVisibleError = toArray(form.querySelectorAll(".hsfc-ErrorAlert")).some((el) =>
        isVisible(el)
      );

      if (anyVisibleError) {
        pendingSubmit = false;
        return;
      }

      showPostSubmitOnly();
    });
  }
  hookIframeLoadFallback();

  // -------------------------
  // City dropdown (UPDATED: now uses IDENTICAL dropdown mechanics to Phone)
  // -------------------------
  const cityHidden = form.querySelector('input[type="hidden"][name="0-1/location_"]');
  if (cityHidden) {
    const cityField = cityHidden.closest(".hsfc-DropdownField");
    const cityCombobox = cityField?.querySelector("input.hsfc-TextInput--button");
    const cityInputWrap = cityField?.querySelector(".hsfc-DropdownInput"); // acts like PhoneInput wrapper
    const cityOptions = cityField?.querySelector(".hsfc-DropdownOptions");
    const citySearch = cityOptions?.querySelector('input[role="searchbox"]');
    const cityList = cityOptions?.querySelector('ul[role="listbox"]');
    const cityItems = cityList ? toArray(cityList.querySelectorAll('li[role="option"]')) : [];

    let cityTouched = false;

    if (cityField && cityCombobox && cityInputWrap && cityOptions && cityList) {
      // Ensure "No matches found" exists for City list
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
        toggleEl: cityInputWrap,          // identical concept to Phone's toggle wrapper
        optionsEl: cityOptions,
        searchEl: citySearch,
        listEl: cityList,
        optionItems: cityItems,
        ariaExpandedEl: cityCombobox,     // aria-expanded belongs on the combobox input
        onSelect: setCitySelected,
        anchorElForPosition: cityInputWrap,
        offsetParentEl: cityInputWrap,    // IMPORTANT: fixes big gap by positioning relative to wrapper
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

      // Keyboard support on the input itself (since toggle wrapper won't receive keydown when input is focused)
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
  // Phone: sanitize + format + validate + shared dial-code country switching
  // (UPDATED: keep PH default from HTML; do NOT override to US)
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
      // Ensure "No matches found" exists for Phone list
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

      function sanitizePhoneRawNoSpaces(raw) {
        let v = (raw || "").toString();
        v = v.replace(/[^\d+]/g, "");
        if (v.startsWith("+")) v = "+" + v.slice(1).replace(/\+/g, "");
        else v = v.replace(/\+/g, "");
        return v;
      }

      function normalizePhoneE164ish(raw) {
        let v = sanitizePhoneRawNoSpaces(raw).trim();
        if (v && !v.startsWith("+") && /^\d/.test(v)) v = `+${v}`;
        if (v === "+") return "";
        return v;
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
          // Keep the UI flag as whatever HubSpot uses; DO NOT replace emoji with ISO for display
          const display = flagEmoji || iso2 || "";
          return { li, text, dialCode, flagEmoji, iso2, display };
        })
        .filter((c) => c.dialCode);

      const dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
        (a, b) => b.length - a.length
      );

      const countryByIso2 = new Map();
      const countriesByDial = new Map(); // dial -> [countries...]
      countries.forEach((c) => {
        if (c.iso2 && !countryByIso2.has(c.iso2)) countryByIso2.set(c.iso2, c);
        if (!countriesByDial.has(c.dialCode)) countriesByDial.set(c.dialCode, []);
        countriesByDial.get(c.dialCode).push(c);
      });

      // Only used when user is actively typing a shared dial code
      function preferredCountryForDial(dialCode) {
        const list = countriesByDial.get(dialCode) || [];
        if (!list.length) return null;

        // For +1, prefer US *only when +1 is in play* (doesn't override PH default)
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

        // keep whatever HubSpot shows (emoji)
        if (flagSpan) flagSpan.textContent = country?.display || flagSpan.textContent || "";
      }

      function syncHiddenPhoneValue(e164) {
        phoneHidden.value = e164 || "";
      }

      function getMinNationalDigits(dialCode) {
        return MIN_NATIONAL_DIGITS_BY_DIAL[dialCode] || DEFAULT_MIN_NATIONAL_DIGITS;
      }

      function validatePhoneValue(rawValue) {
        const normalized = normalizePhoneE164ish(rawValue);
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

        if (rewriteInputPrefix && selectedCountry) {
          const normalized = normalizePhoneE164ish(phoneInput.value || "");
          const currentDial =
            findDialMatch(normalized, dialCodesSortedDesc) || selectedCountry.dialCode;

          const digitsAll = normalized.replace(/\D/g, "");
          const dialDigits = currentDial.replace(/\D/g, "");
          const national = digitsAll.slice(dialDigits.length);

          const nextNormalized = `${selectedCountry.dialCode}${national ? national : ""}`;

          const isShared =
            (countriesByDial.get(selectedCountry.dialCode) || []).length > 1;

          const fmt = autoFormatPhone(
            nextNormalized,
            isShared ? "" : selectedCountry.iso2,
            dialCodesSortedDesc
          );

          phoneInput.value = fmt.display || nextNormalized;
          syncHiddenPhoneValue(fmt.e164 || nextNormalized);

          try {
            phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
          } catch (_) {}
        } else {
          const normalized2 = normalizePhoneE164ish(phoneInput.value || "");
          const dial2 = findDialMatch(normalized2, dialCodesSortedDesc);
          const shared2 = dial2 && (countriesByDial.get(dial2) || []).length > 1;

          const fmt2 = autoFormatPhone(
            normalized2,
            shared2 ? "" : selectedCountry?.iso2 || "",
            dialCodesSortedDesc
          );
          syncHiddenPhoneValue(fmt2.e164 || normalized2);
        }

        clearError(phoneField, phoneInput);
        clearFormLevelError();
      }

      function detectAndSyncCountryFromNormalized(normalized) {
        if (!normalized) {
          if (selectedCountry) setSelectedCountry(null, false);
          else updateCountrySelectionUI(null);
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

        // If we can't detect a specific country, only pick a preferred default for the dial code.
        // This matters for +1, but will NOT override PH unless the user actually typed +1.
        if (dial) {
          const fallback = preferredCountryForDial(dial);
          if (fallback && (!selectedCountry || selectedCountry !== fallback)) {
            selectedCountry = fallback;
            updateCountrySelectionUI(selectedCountry);
          } else {
            updateCountrySelectionUI(selectedCountry);
          }
          return;
        }

        if (selectedCountry) setSelectedCountry(null, false);
        else updateCountrySelectionUI(null);
      }

      phoneCtx = {
        field: phoneField,
        input: phoneInput,
        validate() {
          return validatePhoneValue(phoneInput.value || "");
        },
      };

      // ---- Initial selection: KEEP whatever HubSpot already marked as selected in HTML (PH in your case)
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

      // Initial sync/format (does not override PH default; just formats and syncs hidden)
      {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");
        const dial = findDialMatch(normalized, dialCodesSortedDesc);
        const shared = dial && (countriesByDial.get(dial) || []).length > 1;

        const fmt = autoFormatPhone(
          normalized,
          shared ? "" : selectedCountry?.iso2 || "",
          dialCodesSortedDesc
        );

        // Keep input as-is if it's empty; otherwise apply formatting
        if (normalized) phoneInput.value = fmt.display || phoneInput.value || "";
        syncHiddenPhoneValue(fmt.e164 || normalized);

        // Update UI flag/selected row to match the HTML-selected country first
        updateCountrySelectionUI(selectedCountry);

        // Then allow detection to refine ONLY if dial is shared and digits indicate otherwise (+1 etc.)
        detectAndSyncCountryFromNormalized(fmt.e164 || normalized);
      }

      // Country dropdown
      const phoneDropdown = createDropdown({
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
        offsetParentEl: phoneUI, // match City behavior; avoids odd offsets
        gapPx: 2,
        onOpen: () => {
          clearError(phoneField, phoneInput);
          clearFormLevelError();
        },
      });

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

        let next = current.slice(0, start) + insert + current.slice(end);
        const normalized = normalizePhoneE164ish(next);

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
        const caretPos =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : raw.length;

        const caretDigits = digitCountBeforeCaret(raw, caretPos);
        const normalized = normalizePhoneE164ish(raw);

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

        detectAndSyncCountryFromNormalized(fmt.e164 || normalized);

        // If user typed +1 and we still have no country selected, apply +1 preferred (US) only then
        if (dial && !selectedCountry) {
          const pref = preferredCountryForDial(dial);
          if (pref) {
            selectedCountry = pref;
            updateCountrySelectionUI(selectedCountry);
          }
        }
      });

      phoneInput.addEventListener("focus", () => {
        clearError(phoneField, phoneInput);
        clearFormLevelError();
      });

      phoneInput.addEventListener("blur", () => {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");
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

        const res = validatePhoneValue(phoneInput.value || "");
        if (!res.ok) showError(phoneField, phoneInput, res.message);
      });

      phoneOptions.addEventListener("wheel", () => {
        phoneDropdown.reposition();
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
  // Email validation + suggestion
  // -------------------------
  function isEmailBasicFormat(v) {
    const s = (v || "").trim();
    if (!s) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(s);
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

  const emailInput = form.querySelector('input[name="0-1/email"]');
  if (emailInput) {
    const field = emailInput.closest(".hsfc-EmailField");

    emailInput.addEventListener("input", () => {
      clearError(field, emailInput);
      clearInfo(field);
      clearFormLevelError();
    });

    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();
      clearInfo(field);

      if (!v) {
        showError(field, emailInput, REQUIRED_MSG);
        return;
      }

      if (typeof emailInput.checkValidity === "function" && !emailInput.checkValidity()) {
        showError(field, emailInput, EMAIL_INVALID_MSG);
        return;
      }

      if (!isEmailBasicFormat(v)) {
        showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
        return;
      }

      const suggestion = getEmailSuggestion(v);
      const tldIsKnown = isKnownCommonTld(v);

      if (!tldIsKnown && suggestion) {
        showError(field, emailInput, `Email address ${v} is invalid`);
        showEmailSuggestion(field, emailInput, suggestion);
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
  // Submit validation + trigger PostSubmit on success
  // -------------------------
  form.addEventListener(
    "submit",
    (e) => {
      const invalidTargets = [];

      clearFormLevelError();

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

      // Email
      if (emailInput) {
        const field = emailInput.closest(".hsfc-EmailField");
        const v = emailInput.value.trim();

        clearInfo(field);

        if (!v) {
          showError(field, emailInput, REQUIRED_MSG);
          invalidTargets.push(emailInput);
        } else if (
          typeof emailInput.checkValidity === "function" &&
          !emailInput.checkValidity()
        ) {
          showError(field, emailInput, EMAIL_INVALID_MSG);
          invalidTargets.push(emailInput);
        } else if (!isEmailBasicFormat(v)) {
          showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
          invalidTargets.push(emailInput);
        } else {
          const suggestion = getEmailSuggestion(v);
          const tldIsKnown = isKnownCommonTld(v);
          if (!tldIsKnown && suggestion) {
            showError(field, emailInput, `Email address ${v} is invalid`);
            showEmailSuggestion(field, emailInput, suggestion);
            invalidTargets.push(emailInput);
          }
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

        invalidTargets[0].focus();
        pendingSubmit = false;
        return;
      }

      pendingSubmit = true;
    },
    true
  );
});