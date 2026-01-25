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
  const NO_MATCHES_MSG = "No matches found";

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
  // Pre-hide all Error/Info/PostSubmit alerts in the form (since HTML is static)
  // -------------------------
  function hideInitialAlerts() {
    const errorEls = form.querySelectorAll(".hsfc-ErrorAlert");
    errorEls.forEach((el) => {
      el.hidden = true;
      el.setAttribute("role", el.getAttribute("role") || "alert");
      el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
    });

    const infoEls = form.querySelectorAll(".hsfc-InfoAlert");
    infoEls.forEach((el) => {
      el.hidden = true;
      el.setAttribute("role", el.getAttribute("role") || "status");
      el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
    });

    // Hide the post-submit section if it exists (static HTML contains it)
    const postSubmit = form.querySelector(".hsfc-PostSubmit");
    if (postSubmit) postSubmit.hidden = true;
  }
  hideInitialAlerts();

  // -------------------------
  // Form-level error + post-submit helpers
  // -------------------------
  function getFormErrorEl() {
    // Prefer the NavigationRow alert (your screenshot)
    const navAlerts =
      form.querySelector(".hsfc-NavigationRow__Alerts") ||
      form.querySelector('[data-hsfc-id="NavigationRow"] .hsfc-NavigationRow__Alerts') ||
      null;

    if (navAlerts) {
      return navAlerts.querySelector(".hsfc-ErrorAlert") || null;
    }

    // Fallback: first error alert inside form
    return form.querySelector(".hsfc-ErrorAlert") || null;
  }

  function showFormError(message) {
    const el = getFormErrorEl();
    if (!el) return;
    el.textContent = message || FORM_REQUIRED_MSG;
    el.hidden = false;
  }

  function clearFormError() {
    const el = getFormErrorEl();
    if (!el) return;
    el.hidden = true;
  }

  function showPostSubmit() {
    const postSubmit = form.querySelector(".hsfc-PostSubmit");
    if (!postSubmit) return;

    // Hide the "step"/fields + navigation row, show post-submit
    const step = form.querySelector(".hsfc-Step");
    if (step) step.hidden = true;

    const nav = form.querySelector(".hsfc-NavigationRow");
    if (nav) nav.hidden = true;

    postSubmit.hidden = false;

    // Optional: bring success into view nicely
    try {
      postSubmit.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {}
  }

  function hidePostSubmit() {
    const postSubmit = form.querySelector(".hsfc-PostSubmit");
    if (postSubmit) postSubmit.hidden = true;

    const step = form.querySelector(".hsfc-Step");
    if (step) step.hidden = false;

    const nav = form.querySelector(".hsfc-NavigationRow");
    if (nav) nav.hidden = false;
  }

  // -------------------------
  // Error/Info helpers (REUSE existing HTML elements)
  // -------------------------
  function getErrorEl(fieldEl) {
    if (!fieldEl) return null;
    return fieldEl.querySelector(".hsfc-ErrorAlert") || null;
  }

  function getInfoEl(fieldEl) {
    if (!fieldEl) return null;
    return fieldEl.querySelector(".hsfc-InfoAlert") || null;
  }

  function showError(fieldEl, inputEl, message) {
    const el = getErrorEl(fieldEl);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    if (inputEl) inputEl.setAttribute("aria-invalid", "true");
  }

  function clearError(fieldEl, inputEl) {
    const el = getErrorEl(fieldEl);
    if (el) el.hidden = true;
    if (inputEl) inputEl.setAttribute("aria-invalid", "false");
  }

  function clearInfo(fieldEl) {
    const el = getInfoEl(fieldEl);
    if (!el) return;
    el.hidden = true;
  }

  function showEmailSuggestion(fieldEl, inputEl, suggestion) {
    const infoEl = getInfoEl(fieldEl);
    if (!infoEl) return;

    // Reuse existing button if present
    let btn = infoEl.querySelector(".hsfc-LinkButton") || null;

    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hsfc-LinkButton";
      infoEl.innerHTML = "";
      infoEl.appendChild(btn);
    }

    btn.textContent = `Did you mean ${suggestion}?`;

    // Remove previous click handlers safely by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener("click", () => {
      inputEl.value = suggestion;

      clearError(fieldEl, inputEl);
      clearInfo(fieldEl);
      clearFormError();

      try {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}

      inputEl.focus();
    });

    infoEl.hidden = false;
  }

  // -------------------------
  // Dropdown utilities
  // -------------------------
  function setListScrollbar(listEl, px = 260) {
    if (!listEl) return;
    listEl.style.maxHeight = `${px}px`;
    listEl.style.overflowY = "auto";
  }

  function ensureNoMatchesEl(optionsEl) {
    if (!optionsEl) return null;
    let el = optionsEl.querySelector('[data-newsletter-no-matches="1"]');
    if (!el) {
      el = document.createElement("div");
      el.dataset.newsletterNoMatches = "1";
      el.textContent = NO_MATCHES_MSG;
      // Keep styling minimal; your CSS can style this if you want.
      el.style.padding = "14px 16px";
      el.style.display = "none";
      optionsEl.appendChild(el);
    }
    return el;
  }

  function updateNoMatches(optionsEl, items) {
    const noEl = ensureNoMatchesEl(optionsEl);
    if (!noEl) return;

    const anyVisible = (items || []).some((li) => li && li.style.display !== "none");
    noEl.style.display = anyVisible ? "none" : "block";
  }

  function filterItems(items, q, optionsEl) {
    const query = norm(q);
    (items || []).forEach((li) => {
      const hit = !query || norm(li.textContent).includes(query);
      li.style.display = hit ? "" : "none";
    });
    updateNoMatches(optionsEl, items);
  }

  function clearSearchAndFilter(searchEl, items, optionsEl) {
    if (searchEl) {
      searchEl.value = "";
      // Make sure UI is clean on reopen
      filterItems(items, "", optionsEl);
      try {
        searchEl.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}
    } else {
      filterItems(items, "", optionsEl);
    }
  }

  function closeAllDropdowns(except) {
    [...openDropdowns].forEach((dd) => {
      if (dd !== except) dd.close();
    });
    openDropdowns.clear();
    if (except) openDropdowns.add(except);
  }

  function positionDropdownOptions(optionsEl, anchorEl, offsetParentEl, gap = 6) {
    if (!optionsEl || !anchorEl) return;

    const parent = offsetParentEl || optionsEl.offsetParent || anchorEl.offsetParent;
    if (!parent) return;

    // Force overlay behavior so error alerts don't push the menu (your request)
    optionsEl.style.position = "absolute";
    optionsEl.style.zIndex = "9999";
    optionsEl.style.left = "0";
    optionsEl.style.right = "0";

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
    items,
    ariaExpandedEl,
    onSelect,
    anchorElForPosition,
    offsetParentEl,
    onOpen,
    onClose,
  }) {
    let isOpen = false;

    const api = {
      open() {
        if (isOpen) return;
        isOpen = true;

        closeAllDropdowns(api);

        // Show first then position
        optionsEl.style.display = "flex";
        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "true");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "true");

        setListScrollbar(listEl, 260);

        positionDropdownOptions(
          optionsEl,
          anchorElForPosition || toggleEl,
          offsetParentEl
        );

        clearSearchAndFilter(searchEl, items, optionsEl);

        if (typeof onOpen === "function") onOpen();

        if (searchEl) setTimeout(() => searchEl.focus(), 0);
      },
      close() {
        if (!isOpen) return;
        isOpen = false;

        optionsEl.style.display = "none";
        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "false");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "false");

        clearSearchAndFilter(searchEl, items, optionsEl);

        if (typeof onClose === "function") onClose();

        openDropdowns.delete(api);
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
          offsetParentEl
        );
      },
      isOpen() {
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
      searchEl.addEventListener("input", () => filterItems(items, searchEl.value, optionsEl));
      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          api.close();
          toggleEl.focus();
        }
      });
    }

    (items || []).forEach((li) => {
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

  // Close dropdowns on outside click/tap
  document.addEventListener("pointerdown", (e) => {
    if (!openDropdowns.size) return;
    for (const dd of openDropdowns) {
      if (dd.contains(e.target)) return;
    }
    closeAllDropdowns(null);
  });

  // Close dropdowns on Escape anywhere
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns(null);
  });

  // Reposition open dropdowns on resize/scroll
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
  // City dropdown
  // Fixes included:
  // - "No matches found" handling
  // - Search clears on close/open (always)
  // - Error shows ONLY after user touched the field and closed without selecting
  // - Dropdown overlays error (position absolute + zIndex + anchor)
  // -------------------------
  const cityHidden = form.querySelector('input[type="hidden"][name="0-1/location_"]');
  if (cityHidden) {
    const cityField = cityHidden.closest(".hsfc-DropdownField");
    const cityCombobox = cityField?.querySelector("input.hsfc-TextInput--button");
    const cityOptions = cityField?.querySelector(".hsfc-DropdownOptions");
    const citySearch = cityOptions?.querySelector('input[role="searchbox"]');
    const cityList = cityOptions?.querySelector('ul[role="listbox"]');
    const cityItems = cityList ? toArray(cityList.querySelectorAll('li[role="option"]')) : [];
    const cityCaret = cityField?.querySelector(".hsfc-DropdownInput__Caret");
    const cityAnchor = cityField?.querySelector(".hsfc-DropdownInput");

    if (cityField && cityCombobox && cityOptions && cityList) {
      // Track "touched" + "selected at least once"
      let cityTouched = false;
      let cityHasSelection = !!cityHidden.value.trim();

      function setCitySelected(li) {
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

        cityHasSelection = !!value;
        clearError(cityField, cityCombobox);
        clearFormError();
      }

      const cityDropdown = createDropdown({
        toggleEl: cityCombobox,
        optionsEl: cityOptions,
        searchEl: citySearch,
        listEl: cityList,
        items: cityItems,
        ariaExpandedEl: cityCombobox,
        onSelect: setCitySelected,

        // Anchor to the input row only (NOT the error area)
        anchorElForPosition: cityAnchor || cityCombobox,

        // IMPORTANT: position relative to the same anchor wrapper to avoid error offset
        offsetParentEl: cityAnchor || cityField,

        onOpen: () => {
          cityTouched = true;
          clearError(cityField, cityCombobox);
          clearFormError();
        },
        onClose: () => {
          // only show error after user touched AND closed without selection
          if (cityTouched && !cityHidden.value.trim()) {
            showError(cityField, cityCombobox, REQUIRED_MSG);
          }
        },
      });

      if (cityCaret) {
        cityCaret.addEventListener("click", (e) => {
          e.preventDefault();
          cityDropdown.toggle();
        });
      }

      // Don’t show error on blur (this was the annoying behavior).
      // Just mark touched and clear while interacting.
      cityCombobox.addEventListener("focus", () => {
        cityTouched = true;
        clearError(cityField, cityCombobox);
        clearFormError();
      });

      // Keep selection state in sync if prefilled
      if (cityHasSelection) {
        clearError(cityField, cityCombobox);
      }
    }
  }

  // -------------------------
  // Phone: sanitize + format + validate
  // Fixes included:
  // - "No matches found" handling
  // - Search clears on close/open
  // - Multiple countries with same dial code (e.g. +1):
  //   - typing +1 defaults to US (not CA)
  //   - selecting PR/DO/CA/US from list stays selected (no forced CA)
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

      function formatPhoneDisplayFallback(normalized) {
        if (!normalized) return "";
        const dialCode = findDialMatch(normalized);
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

      function autoFormatPhone(normalizedPlusDigits, iso2Hint) {
        const viaLib = formatWithAsYouType(normalizedPlusDigits, iso2Hint);
        if (viaLib) return viaLib;
        return {
          display: formatPhoneDisplayFallback(normalizedPlusDigits),
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
          const display = iso2 || flagEmoji || "";
          return { li, text, dialCode, flagEmoji, iso2, display };
        })
        .filter((c) => c.dialCode);

      // dialCode -> [countries...], so we can support +1 (US/CA/PR/DO/etc.)
      const countriesByDial = new Map();
      const countryByLi = new Map();
      const countryByIso2 = new Map();

      countries.forEach((c) => {
        countryByLi.set(c.li, c);
        if (c.iso2 && !countryByIso2.has(c.iso2)) countryByIso2.set(c.iso2, c);

        if (!countriesByDial.has(c.dialCode)) countriesByDial.set(c.dialCode, []);
        countriesByDial.get(c.dialCode).push(c);
      });

      const dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
        (a, b) => b.length - a.length
      );

      // Preference: if multiple countries share dial code, choose this ISO2 by default
      const PREFERRED_COUNTRY_BY_DIAL = {
        "+1": "US", // Your requested best-practice default
      };

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
        // IMPORTANT: selection should be by LI identity, not dial-code,
        // so US/CA/PR/DO can all be selected independently.
        countries.forEach((c) => {
          const selected = !!country && c.li === country.li;
          c.li.setAttribute("aria-selected", selected ? "true" : "false");
          c.li.classList.toggle(
            "hsfc-DropdownOptions__List__ListItem--selected",
            selected
          );
        });

        if (flagSpan) flagSpan.textContent = country?.display || "";
      }

      function findDialMatch(v) {
        if (!v) return "";
        return dialCodesSortedDesc.find((dc) => v.startsWith(dc)) || "";
      }

      function pickDefaultCountryForDial(dialCode) {
        const list = countriesByDial.get(dialCode) || [];
        if (!list.length) return null;

        const preferredIso2 = PREFERRED_COUNTRY_BY_DIAL[dialCode];
        if (preferredIso2) {
          const hit = list.find((c) => c.iso2 === preferredIso2);
          if (hit) return hit;
        }

        return list[0] || null;
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
            const hint = selectedCountry?.iso2 || "";
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

        const dialCode = findDialMatch(normalized);
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
          const currentDial = findDialMatch(normalized) || selectedCountry.dialCode;

          const digitsAll = normalized.replace(/\D/g, "");
          const dialDigits = currentDial.replace(/\D/g, "");
          const national = digitsAll.slice(dialDigits.length);

          const nextNormalized = `${selectedCountry.dialCode}${national ? national : ""}`;

          const fmt = autoFormatPhone(nextNormalized, selectedCountry.iso2);
          phoneInput.value = fmt.display || nextNormalized;
          syncHiddenPhoneValue(fmt.e164 || nextNormalized);

          try {
            phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
          } catch (_) {}
        } else {
          const normalized2 = normalizePhoneE164ish(phoneInput.value || "");
          const fmt2 = autoFormatPhone(normalized2, selectedCountry?.iso2 || "");
          syncHiddenPhoneValue(fmt2.e164 || normalized2);
        }

        clearError(phoneField, phoneInput);
        clearFormError();
      }

      function syncCountryFromInput() {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");

        if (!normalized) {
          selectedCountry = null;
          updateCountrySelectionUI(null);
          return;
        }

        // If lib can detect country, prefer that (BUT do not override a deliberate user selection)
        // We only use detection when selectedCountry is null OR dial code changed.
        const dialCode = findDialMatch(normalized);
        const currentDial = selectedCountry?.dialCode || "";

        const dialChanged = dialCode && dialCode !== currentDial;

        if (AsYouTypeCtor) {
          const fmt = formatWithAsYouType(normalized, selectedCountry?.iso2 || "");
          const detected = fmt?.detectedCountry || "";
          if (detected && countryByIso2.has(detected) && (selectedCountry === null || dialChanged)) {
            const found = countryByIso2.get(detected);
            selectedCountry = found;
            updateCountrySelectionUI(selectedCountry);
            return;
          }
        }

        // Fallback: match by dial code; if multiple exist, default to preferred (US for +1)
        if (dialCode) {
          // If the user already selected a specific +1 country from the list, keep it
          if (selectedCountry && selectedCountry.dialCode === dialCode) {
            updateCountrySelectionUI(selectedCountry);
            return;
          }

          const picked = pickDefaultCountryForDial(dialCode);
          selectedCountry = picked;
          updateCountrySelectionUI(selectedCountry);
          return;
        }

        // No match -> clear
        selectedCountry = null;
        updateCountrySelectionUI(null);
      }

      phoneCtx = {
        field: phoneField,
        input: phoneInput,
        validate() {
          return validatePhoneValue(phoneInput.value || "");
        },
      };

      // Initial sync
      {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");
        syncCountryFromInput();

        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || phoneInput.value || "";
        syncHiddenPhoneValue(fmt.e164 || normalized);
      }

      const phoneDropdown = createDropdown({
        toggleEl: flagAndCaret,
        optionsEl: phoneOptions,
        searchEl: phoneSearch,
        listEl: phoneList,
        items: countryLis,
        ariaExpandedEl: flagAndCaret,

        // IMPORTANT: select by LI identity so +1 countries work correctly
        onSelect: (li) => {
          const c = countryByLi.get(li) || null;
          setSelectedCountry(c, true);
        },

        anchorElForPosition: phoneUI,
        offsetParentEl: phoneField,

        onOpen: () => {
          clearError(phoneField, phoneInput);
          clearFormError();
        },
      });

      // Hard block unwanted characters:
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

        // block manual spaces always
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

        syncCountryFromInput();

        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);

        const newCaret = caretIndexAfterNDigits(phoneInput.value, caretDigits);
        try {
          phoneInput.setSelectionRange(newCaret, newCaret);
        } catch (_) {}

        clearError(phoneField, phoneInput);
        clearFormError();
      });

      phoneInput.addEventListener("input", () => {
        clearError(phoneField, phoneInput);
        clearFormError();

        const raw = phoneInput.value || "";
        const caretPos =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : raw.length;

        const caretDigits = digitCountBeforeCaret(raw, caretPos);
        const normalized = normalizePhoneE164ish(raw);

        // Determine country based on dial code; for +1 default to US unless user selected otherwise
        syncCountryFromInput();

        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || normalized;

        const newCaret = caretIndexAfterNDigits(phoneInput.value, caretDigits);
        try {
          phoneInput.setSelectionRange(newCaret, newCaret);
        } catch (_) {}

        syncHiddenPhoneValue(fmt.e164 || normalized);
      });

      phoneInput.addEventListener("focus", () => {
        clearError(phoneField, phoneInput);
        clearFormError();
      });

      phoneInput.addEventListener("blur", () => {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");
        syncCountryFromInput();

        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);

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
      clearFormError();
      hidePostSubmit();
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
      clearFormError();
      hidePostSubmit();
    });

    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();
      clearInfo(field);

      if (!v) {
        showError(field, emailInput, REQUIRED_MSG);
        return;
      }

      // If browser thinks it's invalid (type=email)
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

      // Only enforce "Email address X is invalid" when we can suggest a fix
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
      clearFormError();
      hidePostSubmit();
    });

    checkboxInput.addEventListener("blur", () => {
      if (!checkboxInput.checked) showError(field, checkboxInput, REQUIRED_MSG);
    });

    checkboxInput.addEventListener("focus", () => {
      clearError(field, checkboxInput);
      clearFormError();
      hidePostSubmit();
    });
  }

  // -------------------------
  // Submit validation + NEW behaviors requested:
  // - Show the form-level error: "Please complete all required fields."
  // - Show PostSubmit success section when valid (static HTML success)
  // -------------------------
  form.addEventListener(
    "submit",
    (e) => {
      // Always hide success while trying a new submit attempt
      hidePostSubmit();

      const invalidTargets = [];
      clearFormError();

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

        // Show the NEW global error message (NavigationRow error)
        showFormError(FORM_REQUIRED_MSG);

        // Focus the first invalid input
        invalidTargets[0].focus();
        return;
      }

      // If everything is valid:
      // Since your homepage is a static HTML build and you already have the PostSubmit markup,
      // we show it here and prevent default (so you get the success state like your screenshot).
      e.preventDefault();
      e.stopPropagation();
      closeAllDropdowns(null);
      clearFormError();
      showPostSubmit();
    },
    true
  );
});