// /assets/js/modules/Newsletter.module.js

document.addEventListener("DOMContentLoaded", () => {
  const ROOT = document.querySelector(".newsletter-form");
  if (!ROOT) return;

  const form = ROOT.querySelector("form.hsfc-Form");
  if (!form) return;

  const REQUIRED_MSG = "Please complete this required field.";
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
  // libphonenumber-js (optional, best-practice source-of-truth)
  // -------------------------
  // Supports multiple possible globals depending on how you bundle/include it.
  const LibPhone =
    window.libphonenumber ||
    window.libphonenumberJs ||
    window.libphonenumber_js ||
    window.libphonenumberjs ||
    null;

  const AsYouTypeCtor = LibPhone?.AsYouType || null;
  const parsePhoneNumberFromString = LibPhone?.parsePhoneNumberFromString || null;

  // -------------------------
  // Error helpers
  // -------------------------
  function ensureErrorEl(fieldEl) {
    if (!fieldEl) return null;
    let el = fieldEl.querySelector('.hsfc-ErrorAlert[data-newsletter-error="1"]');
    if (!el) {
      el = document.createElement("div");
      el.className = "hsfc-ErrorAlert";
      el.dataset.newsletterError = "1";
      el.setAttribute("role", "alert");
      el.hidden = true;
      fieldEl.appendChild(el);
    }
    return el;
  }

  function ensureInfoEl(fieldEl) {
    if (!fieldEl) return null;
    let el = fieldEl.querySelector('.hsfc-InfoAlert[data-newsletter-info="1"]');
    if (!el) {
      el = document.createElement("div");
      el.className = "hsfc-InfoAlert";
      el.dataset.newsletterInfo = "1";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.hidden = true;
      fieldEl.appendChild(el);
    }
    return el;
  }

  function showError(fieldEl, inputEl, message) {
    const el = ensureErrorEl(fieldEl);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    if (inputEl) inputEl.setAttribute("aria-invalid", "true");
  }

  function clearError(fieldEl, inputEl) {
    const el = fieldEl?.querySelector?.('.hsfc-ErrorAlert[data-newsletter-error="1"]');
    if (el) el.hidden = true;
    if (inputEl) inputEl.setAttribute("aria-invalid", "false");
  }

  function showInfo(fieldEl, htmlOrNode) {
    const el = ensureInfoEl(fieldEl);
    if (!el) return;

    el.hidden = false;
    el.innerHTML = "";
    if (typeof htmlOrNode === "string") {
      el.innerHTML = htmlOrNode;
    } else if (htmlOrNode && htmlOrNode.nodeType) {
      el.appendChild(htmlOrNode);
    }
  }

  function clearInfo(fieldEl) {
    const el = fieldEl?.querySelector?.('.hsfc-InfoAlert[data-newsletter-info="1"]');
    if (el) {
      el.hidden = true;
      el.innerHTML = "";
    }
  }

  // -------------------------
  // Dropdown positioning + scrollbar
  // -------------------------
  function setListScrollbar(listEl, px = 260) {
    // This is the ONLY styling we force (scrollbar visibility)
    if (!listEl) return;
    listEl.style.maxHeight = `${px}px`;
    listEl.style.overflowY = "auto";
  }

  function filterItems(items, q) {
    const query = norm(q);
    items.forEach((li) => {
      const hit = !query || norm(li.textContent).includes(query);
      li.style.display = hit ? "" : "none";
    });
  }

  function closeAllDropdowns(except) {
    [...openDropdowns].forEach((dd) => {
      if (dd !== except) dd.close();
    });
    openDropdowns.clear();
    if (except) openDropdowns.add(except);
  }

  /**
   * Positions `.hsfc-DropdownOptions` so it doesn't cover the anchor field.
   * Chooses drop-down vs drop-up based on available viewport space.
   */
  function positionDropdownOptions(optionsEl, anchorEl, offsetParentEl, gap = 6) {
    if (!optionsEl || !anchorEl) return;

    const parent = offsetParentEl || optionsEl.offsetParent || anchorEl.offsetParent;
    if (!parent) return;

    // Ensure we can measure
    const prevDisplay = optionsEl.style.display;
    const prevVisibility = optionsEl.style.visibility;

    // Must be displayed to measure size; keep hidden to avoid flicker
    optionsEl.style.display = "flex";
    optionsEl.style.visibility = "hidden";

    // Make sure list scroll rules are applied BEFORE measuring
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
      availableBelow >= Math.min(optionsHeight, 280) ||
      availableBelow >= availableAbove;

    // Reset both so we don't accumulate stale rules
    optionsEl.style.top = "";
    optionsEl.style.bottom = "";

    if (shouldDropDown) {
      // Place below anchor
      const topPx = anchorRect.bottom - parentRect.top + gap;
      optionsEl.style.top = `${Math.max(0, topPx)}px`;
    } else {
      // Place above anchor
      const bottomPx = parentRect.bottom - anchorRect.top + gap;
      optionsEl.style.bottom = `${Math.max(0, bottomPx)}px`;
    }

    // Restore visibility, keep display as-is
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
    anchorElForPosition, // the element whose bottom/top we align to
    offsetParentEl, // positioned container (usually the field wrapper)
  }) {
    let isOpen = false;

    const api = {
      open() {
        if (isOpen) return;
        isOpen = true;

        closeAllDropdowns(api);

        // Show first (needed for measuring), then position, then focus
        optionsEl.style.display = "flex";
        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "true");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "true");

        // Scrollbar (only forced CSS behavior)
        setListScrollbar(listEl, 260);

        // Dropup/dropdown positioning (prevents covering the field)
        positionDropdownOptions(
          optionsEl,
          anchorElForPosition || toggleEl,
          offsetParentEl
        );

        if (searchEl) {
          searchEl.value = "";
          filterItems(items, "");
          setTimeout(() => searchEl.focus(), 0);
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
          filterItems(items, "");
        }

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
      searchEl.addEventListener("input", () => filterItems(items, searchEl.value));
      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          api.close();
          toggleEl.focus();
        }
      });
    }

    items.forEach((li) => {
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

  // Reposition open dropdowns on resize/scroll (keeps alignment stable)
  window.addEventListener("resize", () => {
    for (const dd of openDropdowns) dd.reposition();
  });

  // Capture scroll from any scroll container
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
    const cityCombobox = cityField.querySelector("input.hsfc-TextInput--button");
    const cityOptions = cityField.querySelector(".hsfc-DropdownOptions");
    const citySearch = cityOptions.querySelector('input[role="searchbox"]');
    const cityList = cityOptions.querySelector('ul[role="listbox"]');
    const cityItems = toArray(cityList.querySelectorAll('li[role="option"]'));
    const cityCaret = cityField.querySelector(".hsfc-DropdownInput__Caret");
    const cityAnchor = cityField.querySelector(".hsfc-DropdownInput"); // align menu to this box

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

      clearError(cityField, cityCombobox);
    }

    const cityDropdown = createDropdown({
      toggleEl: cityCombobox,
      optionsEl: cityOptions,
      searchEl: citySearch,
      listEl: cityList,
      items: cityItems,
      ariaExpandedEl: cityCombobox,
      onSelect: setCitySelected,
      anchorElForPosition: cityAnchor || cityCombobox,
      offsetParentEl: cityField, // `.hsfc-DropdownField` is position:relative in your DOM CSS
    });

    if (cityCaret) {
      cityCaret.addEventListener("click", (e) => {
        e.preventDefault();
        cityDropdown.toggle();
      });
    }

    cityCombobox.addEventListener("blur", () => {
      if (!cityHidden.value.trim()) showError(cityField, cityCombobox, REQUIRED_MSG);
    });

    cityCombobox.addEventListener("focus", () => {
      clearError(cityField, cityCombobox);
    });
  }

  // -------------------------
  // Phone (country + dial code + as-you-type spacing)
  // Rules requested:
  // - Only "+" allowed, only as first character
  // - Only numbers otherwise
  // - No manual spaces from keyboard (spaces only via auto formatting)
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

    if (
      phoneField &&
      phoneInput &&
      phoneUI &&
      flagAndCaret &&
      phoneOptions &&
      phoneList
    ) {
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

      // Digits + optional single leading "+".
      // NOTE: removes ALL spaces; spacing is added ONLY by auto-format.
      function sanitizePhoneRawNoSpaces(raw) {
        let v = (raw || "").toString();

        // Keep digits and plus only
        v = v.replace(/[^\d+]/g, "");

        // Ensure only one "+" and only at the beginning
        if (v.startsWith("+")) {
          v = "+" + v.slice(1).replace(/\+/g, "");
        } else {
          v = v.replace(/\+/g, "");
        }

        return v;
      }

      function normalizePhoneE164ish(raw) {
        let v = sanitizePhoneRawNoSpaces(raw).trim();

        // Auto-prefix "+" if user starts with a number
        if (v && !v.startsWith("+") && /^\d/.test(v)) v = `+${v}`;

        // Treat lone "+" as empty
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

      // Returns caret index in formatted string after N digits (ignores "+")
      function caretIndexAfterNDigits(formatted, nDigits) {
        if (!formatted) return 0;
        if (nDigits <= 0) {
          // place after "+" if it exists, else at start
          return formatted.startsWith("+") ? 1 : 0;
        }
        let count = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) count++;
          if (count >= nDigits) return i + 1;
        }
        return formatted.length;
      }

      // libphonenumber-js AsYouType formatting (best-practice),
      // sanitized to only: "+" digits spaces (no hyphens/parentheses/etc).
      function formatWithAsYouType(normalizedPlusDigits, iso2Hint) {
        if (!AsYouTypeCtor || !normalizedPlusDigits) return null;

        try {
          const ayt = iso2Hint ? new AsYouTypeCtor(iso2Hint) : new AsYouTypeCtor();
          const out = ayt.input(normalizedPlusDigits);

          // Keep only "+", digits; convert any separators to spaces
          const safe = (out || "")
            .replace(/[^\d+]+/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();

          // Prefer the library's E.164 if it has it
          const e164 = typeof ayt.getNumberValue === "function" ? ayt.getNumberValue() : "";
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

      // Fallback display formatting with spaces only (your existing intent),
      // used when libphonenumber-js isn't present.
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

        // normalized: +<digits only>
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

        // Generic chunk by 3s
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

      // Countries mapped from LI text
      const countries = countryLis
        .map((li) => {
          const text = (li.textContent || "").trim();
          const dialCode = parseDialCode(text);
          const flagEmoji = text.split(/\s+/)[0] || "";
          const iso2 = flagEmojiToISO2(flagEmoji); // "PH"
          const display = iso2 || flagEmoji || "";
          return { li, text, dialCode, flagEmoji, iso2, display };
        })
        .filter((c) => c.dialCode);

      const dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
        (a, b) => b.length - a.length
      );

      const countryByDial = new Map();
      const countryByIso2 = new Map();
      countries.forEach((c) => {
        if (!countryByDial.has(c.dialCode)) countryByDial.set(c.dialCode, c);
        if (c.iso2 && !countryByIso2.has(c.iso2)) countryByIso2.set(c.iso2, c);
      });

      // Your original targeted minimum-length rules (kept)
      const MIN_NATIONAL_DIGITS_BY_DIAL = {
        "+63": 10, // PH mobile without leading 0 (e.g., 9XXXXXXXXX)
        "+1": 10, // NANP
        "+7": 10, // RU/KZ (common)
        "+65": 8, // SG
        "+852": 8, // HK
      };
      const DEFAULT_MIN_NATIONAL_DIGITS = 7;

      let selectedCountry = null;

      function updateCountrySelectionUI(country) {
        countries.forEach((c) => {
          const selected = !!country && c.dialCode === country.dialCode;
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

      function syncHiddenPhoneValue(e164) {
        phoneHidden.value = e164 || "";
      }

      function getMinNationalDigits(dialCode) {
        return MIN_NATIONAL_DIGITS_BY_DIAL[dialCode] || DEFAULT_MIN_NATIONAL_DIGITS;
      }

      // Best-practice validation path:
      // 1) If libphonenumber-js available: parse + isValid()
      // 2) Else fallback to your existing heuristic
      function validatePhoneValue(rawValue) {
        const normalized = normalizePhoneE164ish(rawValue);

        if (!normalized) return { ok: false, message: REQUIRED_MSG };

        // E.164 max is 15 digits total (excluding "+")
        const digitsOnly = normalized.replace(/\D/g, "");
        if (digitsOnly.length > 15) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        // Preferred: libphonenumber validation
        if (parsePhoneNumberFromString) {
          try {
            const hint = selectedCountry?.iso2 || "";
            const parsed = hint
              ? parsePhoneNumberFromString(normalized, hint)
              : parsePhoneNumberFromString(normalized);

            if (parsed) {
              // If it's valid, accept immediately
              if (typeof parsed.isValid === "function" && parsed.isValid()) {
                return { ok: true, message: "" };
              }

              // If it's possible-but-not-valid, still treat as invalid for submit
              // (keeps your strictness for phone numbers).
              return { ok: false, message: PHONE_INVALID_FORMAT_MSG };
            }
          } catch (_) {
            // fall through to heuristic
          }
        }

        // Fallback heuristic (your original intent)
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

          // Extract digits after whatever dial code is currently present (or assume selected)
          const currentDial = findDialMatch(normalized) || selectedCountry.dialCode;

          const digitsAll = normalized.replace(/\D/g, "");
          const dialDigits = currentDial.replace(/\D/g, "");
          const national = digitsAll.slice(dialDigits.length);

          const nextNormalized = `${selectedCountry.dialCode}${national ? national : ""}`;

          const fmt = autoFormatPhone(nextNormalized, selectedCountry.iso2);
          phoneInput.value = fmt.display || nextNormalized;
          syncHiddenPhoneValue(fmt.e164 || nextNormalized);

          // Keep caret at end after selection (matches HubSpot feel)
          try {
            phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
          } catch (_) {}
        } else {
          // Just re-sync hidden without forcing a rewrite
          const normalized2 = normalizePhoneE164ish(phoneInput.value || "");
          const fmt2 = autoFormatPhone(normalized2, selectedCountry?.iso2 || "");
          syncHiddenPhoneValue(fmt2.e164 || normalized2);
        }

        clearError(phoneField, phoneInput);
      }

      function syncCountryFromInput() {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");

        if (!normalized) {
          if (selectedCountry) setSelectedCountry(null, false);
          else updateCountrySelectionUI(null);
          return;
        }

        // If lib can detect country, prefer that
        if (AsYouTypeCtor) {
          const fmt = formatWithAsYouType(normalized, selectedCountry?.iso2 || "");
          const detected = fmt?.detectedCountry || "";
          if (detected && countryByIso2.has(detected)) {
            const found = countryByIso2.get(detected);
            if (!selectedCountry || selectedCountry.dialCode !== found.dialCode) {
              selectedCountry = found;
              updateCountrySelectionUI(selectedCountry);
              return;
            }
          }
        }

        // Fallback: match by dial code
        const dialCode = findDialMatch(normalized);
        const found = dialCode ? countryByDial.get(dialCode) || null : null;

        if (!found) {
          if (selectedCountry) setSelectedCountry(null, false);
          else updateCountrySelectionUI(null);
          return;
        }

        if (!selectedCountry || selectedCountry.dialCode !== found.dialCode) {
          // Don't rewrite while typing (avoid cursor jump)
          selectedCountry = found;
          updateCountrySelectionUI(selectedCountry);
        } else {
          updateCountrySelectionUI(selectedCountry);
        }
      }

      // Expose for submit validation
      phoneCtx = {
        field: phoneField,
        input: phoneInput,
        validate() {
          return validatePhoneValue(phoneInput.value || "");
        },
      };

      // initial sync (based on prefilled input)
      {
        const normalized = normalizePhoneE164ish(phoneInput.value || "");
        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || phoneInput.value || "";
        syncHiddenPhoneValue(fmt.e164 || normalized);
        syncCountryFromInput();
      }

      // dropdown setup (Country list)
      const phoneDropdown = createDropdown({
        toggleEl: flagAndCaret,
        optionsEl: phoneOptions,
        searchEl: phoneSearch,
        listEl: phoneList,
        items: countryLis,
        ariaExpandedEl: flagAndCaret,
        onSelect: (li) => {
          const dc = parseDialCode(li.textContent);
          setSelectedCountry(countryByDial.get(dc) || null, true);
        },
        // Align dropdown to the whole phone input row (so it doesn't cover it)
        anchorElForPosition: phoneUI,
        offsetParentEl: phoneField, // `.hsfc-PhoneField` is position:relative in your DOM CSS
      });

      // Hard block unwanted characters:
      // - digits allowed
      // - "+" allowed ONLY at the first character
      // - NO manual spaces (spaces come only from auto format)
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

          // allow "+" only if caret is at start and there isn't already a "+"
          if ((start === 0 && !v.includes("+")) || replacingAll || replacingFirstChar) return;

          e.preventDefault();
          return;
        }

        // everything else blocked
        e.preventDefault();
      });

      // Sanitize on paste (strip spaces/letters/symbols; keep +digits)
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

        // Keep caret-digit count
        const caretDigits = digitCountBeforeCaret(current, start);

        let next = current.slice(0, start) + insert + current.slice(end);
        const normalized = normalizePhoneE164ish(next);

        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);

        // Restore caret by digit count
        const newCaret = caretIndexAfterNDigits(phoneInput.value, caretDigits);
        try {
          phoneInput.setSelectionRange(newCaret, newCaret);
        } catch (_) {}

        clearError(phoneField, phoneInput);
        syncCountryFromInput();
      });

      phoneInput.addEventListener("input", () => {
        // Clear while editing (errors on blur/submit)
        clearError(phoneField, phoneInput);

        const raw = phoneInput.value || "";
        const caretPos =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : raw.length;

        // Count digits before caret (so we can restore caret after we inject spaces)
        const caretDigits = digitCountBeforeCaret(raw, caretPos);

        // Sanitize to "+digits" only (no spaces)
        const normalized = normalizePhoneE164ish(raw);

        // Auto-format (spaces only)
        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || normalized;

        // Restore caret position
        const newCaret = caretIndexAfterNDigits(phoneInput.value, caretDigits);
        try {
          phoneInput.setSelectionRange(newCaret, newCaret);
        } catch (_) {}

        // Hidden should always store a clean number (E.164 when possible)
        syncHiddenPhoneValue(fmt.e164 || normalized);

        // Keep flag/country in sync without rewriting while typing
        syncCountryFromInput();
      });

      phoneInput.addEventListener("focus", () => {
        clearError(phoneField, phoneInput);
      });

      phoneInput.addEventListener("blur", () => {
        // On blur, reformat to stable output (still spaces only)
        const normalized = normalizePhoneE164ish(phoneInput.value || "");
        const fmt = autoFormatPhone(normalized, selectedCountry?.iso2 || "");
        phoneInput.value = fmt.display || normalized;
        syncHiddenPhoneValue(fmt.e164 || normalized);
        syncCountryFromInput();

        const res = validatePhoneValue(phoneInput.value || "");
        if (!res.ok) showError(phoneField, phoneInput, res.message);
      });

      // If the dropdown is open and user scrolls inside it, keep it aligned (optional but helpful)
      phoneOptions.addEventListener("wheel", () => {
        phoneDropdown.reposition();
      });
    }
  }

  // -------------------------
  // First name + Email + Checkbox
  // -------------------------
  const firstNameInput = form.querySelector('input[name="0-1/firstname"]');
  if (firstNameInput) {
    const field = firstNameInput.closest(".hsfc-TextField");
    firstNameInput.addEventListener("input", () => {
      clearError(field, firstNameInput);
    });
    firstNameInput.addEventListener("blur", () => {
      if (!firstNameInput.value.trim()) showError(field, firstNameInput, REQUIRED_MSG);
    });
  }

  // -------------------------
  // Email validation + suggestion (practical, not gatekeep-y)
  // Requirements you asked for:
  // - Keep multiple messages (we add, not remove)
  // - Show "Email address X is invalid" when we can confidently detect a typo
  // - Show "Did you mean ...?" suggestion when available
  // - Still practical: do NOT block rare/unknown TLDs unless we have a strong suggestion
  // -------------------------
  function isEmailBasicFormat(v) {
    const s = (v || "").trim();
    if (!s) return false;
    // Basic: local@domain.tld (tld >= 2). No spaces. Not insane.
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(s);
  }

  // Small, practical suggestion list (like Mailcheck-style).
  // We do NOT attempt to maintain a full TLD list here (too big, changes often).
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
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + cost // substitution
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

    // If it's already one of our common domains, no suggestion
    if (COMMON_EMAIL_DOMAINS.includes(domain)) return null;

    // If domain has dots, check full domain first
    const domainMatch = bestCloseMatch(domain, COMMON_EMAIL_DOMAINS);
    if (domainMatch.best && domainMatch.score <= 2) {
      return `${local}@${domainMatch.best}`;
    }

    // Else check just TLD typos (e.g. yahoo.asfag -> yahoo.asia)
    const parts = domain.split(".");
    if (parts.length >= 2) {
      const tld = parts[parts.length - 1];
      const base = parts.slice(0, -1).join(".");
      const tldMatch = bestCloseMatch(tld, COMMON_TLDS);

      if (tldMatch.best && tldMatch.score <= 2) {
        const suggested = `${base}.${tldMatch.best}`;
        // Only suggest if it looks plausibly intentional (not empty base)
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

  function renderEmailSuggestion(fieldEl, inputEl, suggestion) {
    // Match HubSpot-ish UI: "Did you mean <button>email</button>?"
    const wrap = document.createElement("div");

    const text1 = document.createElement("span");
    text1.textContent = "Did you mean ";
    wrap.appendChild(text1);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hsfc-LinkButton";
    btn.textContent = suggestion;
    btn.addEventListener("click", () => {
      inputEl.value = suggestion;
      clearError(fieldEl, inputEl);
      clearInfo(fieldEl);

      // trigger input event so any other logic stays consistent
      try {
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}
      inputEl.focus();
    });
    wrap.appendChild(btn);

    const text2 = document.createElement("span");
    text2.textContent = "?";
    wrap.appendChild(text2);

    showInfo(fieldEl, wrap);
  }

  const emailInput = form.querySelector('input[name="0-1/email"]');
  if (emailInput) {
    const field = emailInput.closest(".hsfc-EmailField");

    emailInput.addEventListener("input", () => {
      clearError(field, emailInput);
      clearInfo(field);
    });

    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();

      clearInfo(field);

      if (!v) {
        showError(field, emailInput, REQUIRED_MSG);
        return;
      }

      // If browser thinks it's invalid (type=email), use the requested message
      // (this mirrors the screenshot "Please enter a valid email address.")
      if (typeof emailInput.checkValidity === "function" && !emailInput.checkValidity()) {
        showError(field, emailInput, EMAIL_INVALID_MSG);
        return;
      }

      // Our format check (keeps your previous intent)
      if (!isEmailBasicFormat(v)) {
        showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
        return;
      }

      // Practical anti-typo: if TLD looks wrong BUT we have a strong suggestion, show:
      // "Email address X is invalid" + "Did you mean ...?"
      // If we have no strong suggestion, we DO NOT block (avoids gatekeeping newer/rare TLDs).
      const suggestion = getEmailSuggestion(v);

      // Only enforce when:
      // - TLD isn't in our common list (so likely typo)
      // - AND we can suggest a close fix
      const tldIsKnown = isKnownCommonTld(v);
      if (!tldIsKnown && suggestion) {
        showError(field, emailInput, `Email address ${v} is invalid`);
        renderEmailSuggestion(field, emailInput, suggestion);
        return;
      }

      // Otherwise: accept silently (practical)
      clearError(field, emailInput);
      clearInfo(field);
    });
  }

  const checkboxInput = form.querySelector(
    'input[type="checkbox"][name="0-1/confirmation_checkbox"]'
  );
  if (checkboxInput) {
    const field = checkboxInput.closest(".hsfc-CheckboxField");

    checkboxInput.value = checkboxInput.checked ? "true" : "false";

    checkboxInput.addEventListener("change", () => {
      checkboxInput.value = checkboxInput.checked ? "true" : "false";
      if (checkboxInput.checked) clearError(field, checkboxInput);
    });

    checkboxInput.addEventListener("blur", () => {
      if (!checkboxInput.checked) showError(field, checkboxInput, REQUIRED_MSG);
    });

    checkboxInput.addEventListener("focus", () => {
      clearError(field, checkboxInput);
    });
  }

  // -------------------------
  // Submit validation (required text in red)
  // -------------------------
  form.addEventListener(
    "submit",
    (e) => {
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
        const cityCombobox = cityField.querySelector("input.hsfc-TextInput--button");
        if (!cityHidden2.value.trim()) {
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
            renderEmailSuggestion(field, emailInput, suggestion);
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
        invalidTargets[0].focus();
      }
    },
    true
  );
});