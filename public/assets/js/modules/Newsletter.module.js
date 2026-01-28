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
  // Display helpers (works with inline style="display:none")
  // -------------------------
  function showEl(el) {
    if (!el) return;
    el.hidden = false;
    el.style.display = "";
  }

  function hideEl(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = "none";
  }

  // -------------------------
  // Pre-hide all Error/Info/PostSubmit alerts in the form (since HTML is static)
  // -------------------------
  function hideInitialAlerts() {
    const errorEls = form.querySelectorAll(".hsfc-ErrorAlert");
    errorEls.forEach((el) => {
      hideEl(el);
      el.setAttribute("role", el.getAttribute("role") || "alert");
      el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
    });

    const infoEls = form.querySelectorAll(".hsfc-InfoAlert");
    infoEls.forEach((el) => {
      hideEl(el);
      el.setAttribute("role", el.getAttribute("role") || "status");
      el.setAttribute("aria-live", el.getAttribute("aria-live") || "polite");
    });

    const postSubmit = form.querySelector(".hsfc-PostSubmit");
    if (postSubmit) hideEl(postSubmit);
  }
  hideInitialAlerts();

  // -------------------------
  // Form-level error + post-submit helpers
  // -------------------------
  function getFormErrorEl() {
    const navAlerts =
      form.querySelector(".hsfc-NavigationRow__Alerts") ||
      form.querySelector('[data-hsfc-id="NavigationRow"] .hsfc-NavigationRow__Alerts') ||
      null;

    if (navAlerts) {
      return navAlerts.querySelector(".hsfc-ErrorAlert") || null;
    }

    return form.querySelector(".hsfc-ErrorAlert") || null;
  }

  function showFormError(message) {
    const el = getFormErrorEl();
    if (!el) return;
    el.textContent = message || FORM_REQUIRED_MSG;
    showEl(el);
  }

  function clearFormError() {
    const el = getFormErrorEl();
    if (!el) return;
    hideEl(el);
  }

  function showPostSubmit() {
    const postSubmit = form.querySelector(".hsfc-PostSubmit");
    if (!postSubmit) return;

    const step = form.querySelector(".hsfc-Step");
    if (step) hideEl(step);

    const nav = form.querySelector(".hsfc-NavigationRow");
    if (nav) hideEl(nav);

    showEl(postSubmit);

    try {
      postSubmit.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {}
  }

  function hidePostSubmit() {
    const postSubmit = form.querySelector(".hsfc-PostSubmit");
    if (postSubmit) hideEl(postSubmit);

    const step = form.querySelector(".hsfc-Step");
    if (step) showEl(step);

    const nav = form.querySelector(".hsfc-NavigationRow");
    if (nav) showEl(nav);
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
      showEl(el);
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

  // ✅ PATCHED: Email suggestion must NEVER trigger submit/global errors
  function showEmailSuggestion(fieldEl, inputEl, suggestion) {
    const infoEl = getInfoEl(fieldEl);
    if (!infoEl) return;

    let btn = infoEl.querySelector(".hsfc-LinkButton") || null;

    // Ensure it is ALWAYS a button, and ALWAYS type="button"
    if (!btn || btn.tagName !== "BUTTON") {
      btn = document.createElement("button");
      btn.className = "hsfc-LinkButton";
      infoEl.innerHTML = "";
      infoEl.appendChild(btn);
    }

    btn.type = "button";
    btn.textContent = `Did you mean ${suggestion}?`;

    // Remove previous handlers safely by cloning (keeps DOM clean)
    const newBtn = btn.cloneNode(true);
    newBtn.type = "button";
    btn.parentNode.replaceChild(newBtn, btn);

    const applySuggestion = (e) => {
      // Hard-stop submit-like behavior + bubbling into form listeners
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      }

      inputEl.value = suggestion;

      clearError(fieldEl, inputEl);
      clearInfo(fieldEl);
      clearFormError();

      try {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}

      inputEl.focus();
    };

    newBtn.addEventListener("click", applySuggestion);

    // Extra safety: Enter/Space while focused must not submit the form
    newBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") applySuggestion(e);
    });

    showEl(infoEl);
  }

  // -------------------------
  // Dropdown utilities
  // -------------------------
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

    // CSS owns position/z-index/width; JS only controls top/bottom placement logic.

    const prevDisplay = optionsEl.style.display;
    const prevVisibility = optionsEl.style.visibility;

    optionsEl.style.display = "";
    optionsEl.style.visibility = "hidden";

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
    optionsEl.style.display = prevDisplay || "";
  }

  function createNoMatchesUl(fromUl) {
    const ul = document.createElement("ul");
    ul.setAttribute("role", "listbox");
    ul.className = fromUl?.className || "hsfc-DropdownOptions__List";
    if (fromUl?.id) ul.id = fromUl.id;

    const li = document.createElement("li");
    li.setAttribute("role", "status");
    li.className =
      "hsfc-DropdownOptions__List__ListItem hsfc-DropdownOptions__List__ListItem--disabled";
    li.textContent = NO_MATCHES_MSG;

    ul.appendChild(li);
    return ul;
  }

  function createDropdown({
    toggleEl,
    optionsEl,
    searchEl,
    listEl,
    ariaExpandedEl,
    onSelect,
    anchorElForPosition,
    offsetParentEl,
    onOpen,
    onClose,
    onListRestored, // called whenever the "real" UL is restored (fresh clone)
  }) {
    let isOpen = false;

    // Keep a template of the original full list (for restore)
    const originalListTemplate = listEl ? listEl.cloneNode(true) : null;

    // Track whether we're currently showing the No Matches UL
    let showingNoMatches = false;

    // Current list reference (may be swapped)
    let currentListEl = listEl;

    function setExpanded(v) {
      const val = v ? "true" : "false";
      if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", val);
      if (toggleEl) toggleEl.setAttribute("aria-expanded", val);
    }

    function bindOptionItems() {
      const items = currentListEl
        ? toArray(currentListEl.querySelectorAll('li[role="option"]'))
        : [];

      items.forEach((li) => {
        if (li.dataset.newsletterBound === "1") return;
        li.dataset.newsletterBound = "1";

        li.addEventListener("click", (e) => {
          e.preventDefault();
          if (typeof onSelect === "function") onSelect(li);
          api.close();
        });

        li.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (typeof onSelect === "function") onSelect(li);
            api.close();
          }
        });
      });

      return items;
    }

    function restoreFullList() {
      if (!originalListTemplate || !currentListEl) return;

      // If we're already on a full list (not no-matches), still ensure bindings exist.
      if (!showingNoMatches) {
        bindOptionItems();
        return;
      }

      const restored = originalListTemplate.cloneNode(true);
      currentListEl.replaceWith(restored);
      currentListEl = restored;
      showingNoMatches = false;

      // Rebind option item handlers (new nodes)
      bindOptionItems();

      // Let the caller rebuild maps/selections if needed
      if (typeof onListRestored === "function") onListRestored(currentListEl);
    }

    function showNoMatchesList() {
      if (!currentListEl) return;
      if (showingNoMatches) return;

      const noUl = createNoMatchesUl(currentListEl);
      currentListEl.replaceWith(noUl);
      currentListEl = noUl;
      showingNoMatches = true;
    }

    function applyFilter() {
      // Always start from the full list so filtering is correct
      restoreFullList();

      const query = norm(searchEl?.value || "");
      const items = currentListEl
        ? toArray(currentListEl.querySelectorAll('li[role="option"]'))
        : [];

      items.forEach((li) => {
        const hit = !query || norm(li.textContent).includes(query);
        li.style.display = hit ? "" : "none";
      });

      const anyVisible = items.some((li) => li && li.style.display !== "none");

      if (!anyVisible) {
        showNoMatchesList();
      }
    }

    function clearSearchAndNormalizeList() {
      if (searchEl) {
        searchEl.value = "";
      }
      // Restore full list and clear any "display:none" filtering
      restoreFullList();

      const items = currentListEl
        ? toArray(currentListEl.querySelectorAll('li[role="option"]'))
        : [];
      items.forEach((li) => (li.style.display = ""));
    }

    const api = {
      open() {
        if (isOpen) return;
        isOpen = true;

        closeAllDropdowns(api);

        optionsEl.style.display = "";
        setExpanded(true);

        positionDropdownOptions(optionsEl, anchorElForPosition || toggleEl, offsetParentEl);

        // Always normalize list state on open
        clearSearchAndNormalizeList();
        bindOptionItems();
        if (typeof onListRestored === "function") onListRestored(currentListEl);

        if (typeof onOpen === "function") onOpen();
        if (searchEl) setTimeout(() => searchEl.focus(), 0);
      },
      close() {
        if (!isOpen) return;
        isOpen = false;

        optionsEl.style.display = "none";
        setExpanded(false);

        // Requirement: on close, restore original list for next open
        clearSearchAndNormalizeList();
        bindOptionItems();
        if (typeof onListRestored === "function") onListRestored(currentListEl);

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
        positionDropdownOptions(optionsEl, anchorElForPosition || toggleEl, offsetParentEl);
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
      searchEl.addEventListener("input", applyFilter);

      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          api.close();
          toggleEl.focus();
        }
      });
    }

    // Initial bind
    bindOptionItems();

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
  // -------------------------
  const cityHidden = form.querySelector('input[type="hidden"][name="0-1/location_"]');
  if (cityHidden) {
    const cityField = cityHidden.closest(".hsfc-DropdownField");
    const cityCombobox = cityField?.querySelector("input.hsfc-TextInput--button");
    const cityOptions = cityField?.querySelector(".hsfc-DropdownOptions");
    const citySearch = cityOptions?.querySelector('input[role="searchbox"]');
    const cityList = cityOptions?.querySelector('ul[role="listbox"]');
    const cityCaret = cityField?.querySelector(".hsfc-DropdownInput__Caret");
    const cityAnchor = cityField?.querySelector(".hsfc-DropdownInput");

    if (cityField && cityCombobox && cityOptions && cityList) {
      let cityTouched = false;

      function setCitySelected(li) {
        const value = (li.textContent || "").trim();
        cityCombobox.value = value;
        cityHidden.value = value;

        // Update selected styles in the CURRENT list
        const cityItems = toArray(
          cityList.ownerDocument.querySelectorAll(
            `#${CSS.escape(cityList.id)} li[role="option"]`
          )
        );

        cityItems.forEach((item) => {
          const selected = item.textContent.trim() === value;
          item.setAttribute("aria-selected", selected ? "true" : "false");
          item.classList.toggle(
            "hsfc-DropdownOptions__List__ListItem--selected",
            selected
          );
        });

        clearError(cityField, cityCombobox);
        clearFormError();
      }

      const cityDropdown = createDropdown({
        toggleEl: cityCombobox,
        optionsEl: cityOptions,
        searchEl: citySearch,
        listEl: cityList,
        ariaExpandedEl: cityCombobox,
        onSelect: setCitySelected,

        anchorElForPosition: cityAnchor || cityCombobox,
        offsetParentEl: cityAnchor || cityField,

        onOpen: () => {
          cityTouched = true;
          clearError(cityField, cityCombobox);
          clearFormError();
        },
        onClose: () => {
          if (cityTouched && !cityHidden.value.trim()) {
            showError(cityField, cityCombobox, REQUIRED_MSG);
          }
        },

        // After restore, ensure selected state reflects hidden value
        onListRestored: (ul) => {
          if (!ul) return;
          const value = (cityHidden.value || "").trim();
          const items = toArray(ul.querySelectorAll('li[role="option"]'));
          items.forEach((item) => {
            const selected = value && item.textContent.trim() === value;
            item.setAttribute("aria-selected", selected ? "true" : "false");
            item.classList.toggle(
              "hsfc-DropdownOptions__List__ListItem--selected",
              selected
            );
          });
        },
      });

      if (cityCaret) {
        cityCaret.addEventListener("click", (e) => {
          e.preventDefault();
          cityDropdown.toggle();
        });
      }

      cityCombobox.addEventListener("focus", () => {
        cityTouched = true;
        clearError(cityField, cityCombobox);
        clearFormError();
      });

      if (cityHidden.value.trim()) {
        clearError(cityField, cityCombobox);
      }
    }
  }

  // -------------------------
  // Phone: sanitize + format + validate
  // -------------------------
  const phoneHidden = form.querySelector('input[type="hidden"][name="0-1/phone"]');
  if (phoneHidden) {
    const phoneField = phoneHidden.closest(".hsfc-PhoneField");
    const phoneInput = phoneField?.querySelector?.('input[type="tel"]');
    const phoneUI = phoneField?.querySelector?.(".hsfc-PhoneInput");
    const flagAndCaret = phoneUI?.querySelector?.(".hsfc-PhoneInput__FlagAndCaret");
    const flagSpan = phoneUI?.querySelector?.(".hsfc-PhoneInput__FlagAndCaret__Flag");
    const phoneOptions = phoneUI?.querySelector?.(".hsfc-DropdownOptions");
    let phoneList = phoneUI?.querySelector?.('.hsfc-DropdownOptions ul[role="listbox"]');
    const phoneSearch = phoneOptions?.querySelector?.('input[role="searchbox"]');

    if (phoneField && phoneInput && phoneUI && flagAndCaret && phoneOptions && phoneList) {
      function parseDialCode(text) {
        const m = (text || "").trim().match(/\+[\d]+$/);
        return m ? m[0] : "";
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

      // Preference: if multiple countries share dial code, choose this by default
      const PREFERRED_COUNTRY_BY_DIAL = {
        "+1": "United States",
      };

      const MIN_NATIONAL_DIGITS_BY_DIAL = {
        "+63": 10,
        "+1": 10,
        "+7": 10,
        "+65": 8,
        "+852": 8,
      };
      const DEFAULT_MIN_NATIONAL_DIGITS = 7;

      // Dynamic country index (rebuilt when UL is restored)
      let countryLis = [];
      let countries = [];
      let countriesByDial = new Map();
      let countryByLi = new Map();
      let dialCodesSortedDesc = [];
      let selectedCountry = null;

      function rebuildCountryIndex(ul) {
        phoneList = ul;

        countryLis = toArray(phoneList?.querySelectorAll?.('li[role="option"]'));

        countries = countryLis
          .map((li) => {
            const text = (li.textContent || "").trim();
            const dialCode = parseDialCode(text);
            const flagEmoji = (text.split(/\s+/)[0] || "").trim();
            const display = flagEmoji || "";
            return { li, text, dialCode, flagEmoji, display };
          })
          .filter((c) => c.dialCode);

        countriesByDial = new Map();
        countryByLi = new Map();

        countries.forEach((c) => {
          countryByLi.set(c.li, c);
          if (!countriesByDial.has(c.dialCode)) countriesByDial.set(c.dialCode, []);
          countriesByDial.get(c.dialCode).push(c);
        });

        dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
          (a, b) => b.length - a.length
        );
      }

      // initial build
      rebuildCountryIndex(phoneList);

      function updateCountrySelectionUI(country) {
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

        const preferredName = PREFERRED_COUNTRY_BY_DIAL[dialCode];
        if (preferredName) {
          const hit = list.find((c) => (c.text || "").includes(preferredName));
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
            const parsed = parsePhoneNumberFromString(normalized);
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

          const fmt = autoFormatPhone(nextNormalized, "");
          phoneInput.value = fmt.display || nextNormalized;
          syncHiddenPhoneValue(fmt.e164 || nextNormalized);

          try {
            phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
          } catch (_) {}
        } else {
          const normalized2 = normalizePhoneE164ish(phoneInput.value || "");
          const fmt2 = autoFormatPhone(normalized2, "");
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

        const dialCode = findDialMatch(normalized);
        const currentDial = selectedCountry?.dialCode || "";
        const dialChanged = dialCode && dialCode !== currentDial;

        if (AsYouTypeCtor) {
          const fmt = formatWithAsYouType(normalized, "");
          const detected = fmt?.detectedCountry || "";
          // We are no longer using ISO2 mapping; rely on dial code fallback behavior.
          if (detected && (selectedCountry === null || dialChanged)) {
            // no-op; dial-code matching below will handle selection
          }
        }

        if (dialCode) {
          if (selectedCountry && selectedCountry.dialCode === dialCode) {
            updateCountrySelectionUI(selectedCountry);
            return;
          }
          const picked = pickDefaultCountryForDial(dialCode);
          selectedCountry = picked;
          updateCountrySelectionUI(selectedCountry);
          return;
        }

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

        const fmt = autoFormatPhone(normalized, "");
        phoneInput.value = fmt.display || phoneInput.value || "";
        syncHiddenPhoneValue(fmt.e164 || normalized);
      }

      const phoneDropdown = createDropdown({
        toggleEl: flagAndCaret,
        optionsEl: phoneOptions,
        searchEl: phoneSearch,
        listEl: phoneList,
        ariaExpandedEl: flagAndCaret,

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

        // When UL restores, rebuild indices and reapply selected UI
        onListRestored: (ul) => {
          if (!ul) return;
          rebuildCountryIndex(ul);

          // Reapply selected class to the currently selectedCountry (by matching dial + flag text)
          if (selectedCountry) {
            const match = countries.find(
              (c) =>
                c.dialCode === selectedCountry.dialCode &&
                c.display === selectedCountry.display
            );
            if (match) selectedCountry = match;
          }
          updateCountrySelectionUI(selectedCountry);
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

        const fmt = autoFormatPhone(normalized, "");
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

        syncCountryFromInput();

        const fmt = autoFormatPhone(normalized, "");
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

        const fmt = autoFormatPhone(normalized, "");
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
  // Submit validation + success state
  // -------------------------
  form.addEventListener(
    "submit",
    (e) => {
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

        showFormError(FORM_REQUIRED_MSG);
        invalidTargets[0].focus();
        return;
      }

      // Valid: show static PostSubmit success section
      e.preventDefault();
      e.stopPropagation();
      closeAllDropdowns(null);
      clearFormError();
      showPostSubmit();
    },
    true
  );
});