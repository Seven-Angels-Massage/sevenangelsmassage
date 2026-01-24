// /assets/js/modules/Newsletter.module.js

document.addEventListener("DOMContentLoaded", () => {
  const ROOT = document.querySelector(".newsletter-form");
  if (!ROOT) return;

  const form = ROOT.querySelector("form.hsfc-Form");
  if (!form) return;

  const REQUIRED_MSG = "Please complete this required field.";
  const EMAIL_INVALID_MSG = "Email must be formatted correctly.";
  const PHONE_INVALID_FORMAT_MSG =
    "This phone number is either invalid or is in the wrong format.";

  const openDropdowns = new Set();
  const toArray = (x) => Array.prototype.slice.call(x || []);
  const norm = (s) => (s || "").toString().trim().toLowerCase();

  // Keep a handle to phone validation for submit
  let phoneCtx = null;

  // -------------------------
  // Error helpers
  // -------------------------
  function ensureErrorEl(fieldEl) {
    if (!fieldEl) return null;
    let el = fieldEl.querySelector(
      '.hsfc-ErrorAlert[data-newsletter-error="1"]'
    );
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

  function showError(fieldEl, inputEl, message) {
    const el = ensureErrorEl(fieldEl);
    if (el) {
      el.textContent = message;
      el.hidden = false;
    }
    if (inputEl) inputEl.setAttribute("aria-invalid", "true");
  }

  function clearError(fieldEl, inputEl) {
    const el = fieldEl?.querySelector?.(
      '.hsfc-ErrorAlert[data-newsletter-error="1"]'
    );
    if (el) el.hidden = true;
    if (inputEl) inputEl.setAttribute("aria-invalid", "false");
  }

  // -------------------------
  // Dropdown logic (NO styling)
  // -------------------------
  function filterItems(items, q) {
    const query = norm(q);
    items.forEach((li) => {
      const hit = !query || norm(li.textContent).includes(query);
      li.hidden = !hit; // attribute-based visibility (no inline styles)
    });
  }

  function closeAllDropdowns(except) {
    [...openDropdowns].forEach((dd) => {
      if (dd !== except) dd.close();
    });
    openDropdowns.clear();
    if (except) openDropdowns.add(except);
  }

  function createDropdown({
    toggleEl,
    optionsEl,
    searchEl,
    items,
    ariaExpandedEl,
    onSelect,
  }) {
    let isOpen = false;

    // Ensure a consistent baseline without touching styles
    if (optionsEl) optionsEl.hidden = true;

    const api = {
      open() {
        if (isOpen) return;
        isOpen = true;

        closeAllDropdowns(api);

        // Attribute-only open/close
        if (optionsEl) optionsEl.hidden = false;

        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "true");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "true");

        if (searchEl) {
          searchEl.value = "";
          filterItems(items, "");
          setTimeout(() => searchEl.focus(), 0);
        }
      },
      close() {
        if (!isOpen) return;
        isOpen = false;

        if (optionsEl) optionsEl.hidden = true;

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
        filterItems(items, searchEl.value)
      );
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

  // -------------------------
  // City dropdown
  // -------------------------
  const cityHidden = form.querySelector(
    'input[type="hidden"][name="0-1/location_"]'
  );
  if (cityHidden) {
    const cityField = cityHidden.closest(".hsfc-DropdownField");
    const cityCombobox = cityField.querySelector("input.hsfc-TextInput--button");
    const cityOptions = cityField.querySelector(".hsfc-DropdownOptions");
    const citySearch = cityOptions.querySelector('input[role="searchbox"]');
    const cityList = cityOptions.querySelector('ul[role="listbox"]');
    const cityItems = toArray(cityList.querySelectorAll('li[role="option"]'));
    const cityCaret = cityField.querySelector(".hsfc-DropdownInput__Caret");

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
      items: cityItems,
      ariaExpandedEl: cityCombobox,
      onSelect: setCitySelected,
    });

    if (cityCaret) {
      cityCaret.addEventListener("click", (e) => {
        e.preventDefault();
        cityDropdown.toggle();
      });
    }

    cityCombobox.addEventListener("blur", () => {
      if (!cityHidden.value.trim())
        showError(cityField, cityCombobox, REQUIRED_MSG);
    });

    cityCombobox.addEventListener("focus", () => {
      clearError(cityField, cityCombobox);
    });
  }

  // -------------------------
  // Phone (country + dial code + spacing)
  // -------------------------
  const phoneHidden = form.querySelector(
    'input[type="hidden"][name="0-1/phone"]'
  );
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

      // Only allow: digits, spaces, and a single leading "+"
      function sanitizePhoneRaw(raw) {
        let v = (raw || "").toString();

        v = v.replace(/[^\d+\s]/g, ""); // keep digits, +, spaces
        v = v.replace(/^\s+/, "");      // trim left
        v = v.replace(/\s{2,}/g, " ");  // collapse spaces

        if (v.startsWith("+")) {
          v = "+" + v.slice(1).replace(/\+/g, "");
          v = v.replace(/^\+\s+/, "+"); // no spaces right after +
        } else {
          v = v.replace(/\+/g, "");
        }

        return v;
      }

      function normalizePhone(raw) {
        let v = sanitizePhoneRaw(raw).trim();

        // Auto-prefix "+" if user starts with a number
        if (v && !v.startsWith("+") && /^\d/.test(v)) v = `+${v}`;

        // Treat lone "+" as empty
        if (v === "+") return "";

        // No spaces directly after "+"
        v = v.replace(/^\+\s+/, "+");

        return v;
      }

      // Countries mapped from LI text
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

      const dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
        (a, b) => b.length - a.length
      );

      const countryByDial = new Map();
      countries.forEach((c) => {
        if (!countryByDial.has(c.dialCode)) countryByDial.set(c.dialCode, c);
      });

      // Targeted minimum-length rules (keep your existing validation intent)
      const MIN_NATIONAL_DIGITS_BY_DIAL = {
        "+63": 10, // PH mobile without leading 0 (e.g., 9XXXXXXXXX)
        "+1": 10,  // NANP
        "+7": 10,  // RU/KZ (common)
        "+65": 8,  // SG
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

      function syncHiddenPhone() {
        const v = normalizePhone(phoneInput.value || "");
        phoneHidden.value = v;
      }

      function getMinNationalDigits(dialCode) {
        return MIN_NATIONAL_DIGITS_BY_DIAL[dialCode] || DEFAULT_MIN_NATIONAL_DIGITS;
      }

      function validatePhoneValue(rawValue) {
        const normalized = normalizePhone(rawValue);

        if (!normalized) return { ok: false, message: REQUIRED_MSG };

        const dialCode = findDialMatch(normalized);
        if (!dialCode) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        const digits = normalized.replace(/\D/g, "");
        const dialDigits = dialCode.replace(/\D/g, "");
        const nationalDigits = Math.max(0, digits.length - dialDigits.length);

        if (nationalDigits === 0) return { ok: false, message: REQUIRED_MSG };
        if (digits.length > 15) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        const minNat = getMinNationalDigits(dialCode);
        if (nationalDigits < minNat) return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        return { ok: true, message: "" };
      }

      // Display formatting with spaces (applied on blur / after country selection)
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

      function formatPhoneDisplay(normalized) {
        if (!normalized) return "";

        const dialCode = findDialMatch(normalized);
        if (!dialCode) return normalized;

        const digitsAll = normalized.replace(/\D/g, "");
        const dialDigits = dialCode.replace(/\D/g, "");
        let national = digitsAll.slice(dialDigits.length);

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
        while (national.length - groups.reduce((a, b) => a + b, 0) > 3) groups.push(3);
        groups.push(Math.max(0, national.length - groups.reduce((a, b) => a + b, 0)));
        return `${dialCode} ${groupDigits(national, groups)}`.trim();
      }

      function setSelectedCountry(country, rewriteInputPrefix) {
        selectedCountry = country || null;
        updateCountrySelectionUI(selectedCountry);

        if (rewriteInputPrefix && selectedCountry) {
          const normalized = normalizePhone(phoneInput.value || "");
          const dialCode = findDialMatch(normalized) || selectedCountry.dialCode;

          const digitsAll = normalized.replace(/\D/g, "");
          const dialDigits = dialCode.replace(/\D/g, "");
          const national = digitsAll.slice(dialDigits.length);

          const next = `${selectedCountry.dialCode}${national ? national : ""}`;
          phoneInput.value = formatPhoneDisplay(next);

          try {
            phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
          } catch (_) {}
        }

        syncHiddenPhone();
        clearError(phoneField, phoneInput);
      }

      function syncCountryFromInput() {
        const normalized = normalizePhone(phoneInput.value || "");
        if (!normalized) {
          if (selectedCountry) setSelectedCountry(null, false);
          else updateCountrySelectionUI(null);
          return;
        }

        const dialCode = findDialMatch(normalized);
        const found = dialCode ? countryByDial.get(dialCode) || null : null;

        if (!found) {
          if (selectedCountry) setSelectedCountry(null, false);
          else updateCountrySelectionUI(null);
          return;
        }

        if (!selectedCountry || selectedCountry.dialCode !== found.dialCode) {
          selectedCountry = found;
          updateCountrySelectionUI(selectedCountry);
        } else {
          updateCountrySelectionUI(selectedCountry);
        }
      }

      phoneCtx = {
        field: phoneField,
        input: phoneInput,
        validate() {
          return validatePhoneValue(phoneInput.value || "");
        },
      };

      syncHiddenPhone();
      syncCountryFromInput();

      const phoneDropdown = createDropdown({
        toggleEl: flagAndCaret,
        optionsEl: phoneOptions,
        searchEl: phoneSearch,
        items: countryLis,
        ariaExpandedEl: flagAndCaret,
        onSelect: (li) => {
          const dc = parseDialCode(li.textContent);
          setSelectedCountry(countryByDial.get(dc) || null, true);
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
        if (k === " ") return;

        if (k === "+") {
          const v = phoneInput.value || "";
          const start =
            typeof phoneInput.selectionStart === "number"
              ? phoneInput.selectionStart
              : 0;
          const end =
            typeof phoneInput.selectionEnd === "number"
              ? phoneInput.selectionEnd
              : 0;

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
        const insert = sanitizePhoneRaw(pasted);

        const current = phoneInput.value || "";
        const start =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : current.length;
        const end =
          typeof phoneInput.selectionEnd === "number"
            ? phoneInput.selectionEnd
            : start;

        let next = current.slice(0, start) + insert + current.slice(end);
        next = sanitizePhoneRaw(next);

        if (next && !next.startsWith("+") && /^\d/.test(next)) next = `+${next}`;
        next = next.replace(/^\+\s+/, "+");

        phoneInput.value = next;

        const newPos = Math.min(
          (current.slice(0, start) + insert).length,
          phoneInput.value.length
        );
        try {
          phoneInput.setSelectionRange(newPos, newPos);
        } catch (_) {}

        clearError(phoneField, phoneInput);
        syncHiddenPhone();
        syncCountryFromInput();
      });

      phoneInput.addEventListener("input", () => {
        clearError(phoneField, phoneInput);

        const raw = phoneInput.value || "";
        const caret =
          typeof phoneInput.selectionStart === "number"
            ? phoneInput.selectionStart
            : null;

        if (caret !== null) {
          const before = raw.slice(0, caret);
          const sanitizedAll = sanitizePhoneRaw(raw);
          const sanitizedBefore = sanitizePhoneRaw(before);

          phoneInput.value = sanitizedAll;
          const newCaret = sanitizedBefore.length;

          try {
            phoneInput.setSelectionRange(newCaret, newCaret);
          } catch (_) {}
        } else {
          phoneInput.value = sanitizePhoneRaw(raw);
        }

        if (
          phoneInput.value &&
          !phoneInput.value.startsWith("+") &&
          /^\d/.test(phoneInput.value)
        ) {
          const pos =
            typeof phoneInput.selectionStart === "number"
              ? phoneInput.selectionStart
              : phoneInput.value.length;
          phoneInput.value = `+${phoneInput.value}`;
          try {
            phoneInput.setSelectionRange(pos + 1, pos + 1);
          } catch (_) {}
        }

        phoneInput.value = phoneInput.value.replace(/^\+\s+/, "+");

        syncHiddenPhone();
        syncCountryFromInput();
      });

      phoneInput.addEventListener("focus", () => {
        clearError(phoneField, phoneInput);
      });

      phoneInput.addEventListener("blur", () => {
        const normalized = normalizePhone(phoneInput.value || "");
        if (normalized) {
          phoneInput.value = formatPhoneDisplay(normalized);
          syncHiddenPhone();
          syncCountryFromInput();
        }

        const res = validatePhoneValue(phoneInput.value || "");
        if (!res.ok) showError(phoneField, phoneInput, res.message);
      });

      flagAndCaret.addEventListener("click", (e) => {
        e.preventDefault();
        phoneDropdown.toggle();
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
      if (!firstNameInput.value.trim())
        showError(field, firstNameInput, REQUIRED_MSG);
    });
  }

  function isEmailStrict(v) {
    const s = (v || "").trim();
    if (!s) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(s);
  }

  const emailInput = form.querySelector('input[name="0-1/email"]');
  if (emailInput) {
    const field = emailInput.closest(".hsfc-EmailField");

    emailInput.addEventListener("input", () => {
      clearError(field, emailInput);
    });

    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();
      if (!v) {
        showError(field, emailInput, REQUIRED_MSG);
      } else if (!isEmailStrict(v)) {
        showError(field, emailInput, EMAIL_INVALID_MSG);
      }
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
  // Submit validation
  // -------------------------
  form.addEventListener(
    "submit",
    (e) => {
      const invalidTargets = [];

      if (firstNameInput) {
        const field = firstNameInput.closest(".hsfc-TextField");
        if (!firstNameInput.value.trim()) {
          showError(field, firstNameInput, REQUIRED_MSG);
          invalidTargets.push(firstNameInput);
        }
      }

      const cityHidden2 = form.querySelector(
        'input[type="hidden"][name="0-1/location_"]'
      );
      if (cityHidden2) {
        const cityField = cityHidden2.closest(".hsfc-DropdownField");
        const cityCombobox = cityField.querySelector("input.hsfc-TextInput--button");
        if (!cityHidden2.value.trim()) {
          showError(cityField, cityCombobox, REQUIRED_MSG);
          invalidTargets.push(cityCombobox);
        }
      }

      if (phoneCtx?.field && phoneCtx?.input && typeof phoneCtx.validate === "function") {
        const res = phoneCtx.validate();
        if (!res.ok) {
          showError(phoneCtx.field, phoneCtx.input, res.message);
          invalidTargets.push(phoneCtx.input);
        }
      }

      if (emailInput) {
        const field = emailInput.closest(".hsfc-EmailField");
        const v = emailInput.value.trim();
        if (!v) {
          showError(field, emailInput, REQUIRED_MSG);
          invalidTargets.push(emailInput);
        } else if (!isEmailStrict(v)) {
          showError(field, emailInput, EMAIL_INVALID_MSG);
          invalidTargets.push(emailInput);
        }
      }

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



/* =========================
   ACCESSIBILITY PATCH (HubSpot Forms):
   Fixes Lighthouse: "[aria-*] attributes do not match their roles"

   HubSpot sometimes renders dropdown inputs like:
     <input type="text" role="button" aria-expanded aria-haspopup ...>

   That is invalid because role="button" does not support those aria-* attributes.
   We patch it AFTER render by switching the role to "combobox"
   (which DOES support aria-expanded/aria-haspopup/listbox patterns).
   ========================= */
//(function () {
//  "use strict";

//  function patchHubSpotDropdownA11y(root) {
//    if (!root || root.nodeType !== 1) return;

    // Target the HubSpot dropdown input pattern seen in your Lighthouse screenshot.
    // Example classes: .hsfc-DropdownInput .hsfc-TextInput--button
//    var inputs = root.querySelectorAll(
//      'input.hsfc-TextInput[role="button"][aria-haspopup="listbox"], ' +
//      'input.hsfc-TextInput--button[role="button"], ' +
//      'div.hsfc-DropdownInput input[role="button"]'
//    );

//    inputs.forEach(function (el) {
      // Avoid re-patching
//      if (el.dataset && el.dataset.samA11yPatched === "1") return;

      // Switch invalid role="button" to a valid dropdown text-entry control pattern.
      // This resolves Lighthouse ARIA role mismatch warnings.
//      el.setAttribute("role", "combobox");

      // Ensure autocomplete semantics are coherent for combobox.
//      if (!el.hasAttribute("aria-autocomplete")) {
//        el.setAttribute("aria-autocomplete", "list");
//      }

      // Keep aria-haspopup="listbox" if present; it's valid for combobox.
      // Keep aria-expanded if present; it's valid for combobox.

      // Mark patched
//      if (el.dataset) el.dataset.samA11yPatched = "1";
//    });
//  }

//  function initNewsletterA11yFix() {
    // Limit patching to the newsletter module area first.
//    var newsletterRoot = document.querySelector(".newsletter-form");
//    if (newsletterRoot) patchHubSpotDropdownA11y(newsletterRoot);

    // Also observe future form injections/re-renders (HubSpot can do late hydration).
//    var mo = new MutationObserver(function (mutations) {
//      for (var i = 0; i < mutations.length; i++) {
//        var m = mutations[i];
//        if (m.addedNodes && m.addedNodes.length) {
//          m.addedNodes.forEach(function (node) {
//            if (node && node.nodeType === 1) {
              // Patch within the added subtree
//              patchHubSpotDropdownA11y(node);
//            }
//          });
//        }
//      }
//    });

//    mo.observe(document.documentElement, { childList: true, subtree: true });
//  }

//  if (document.readyState === "loading") {
//    document.addEventListener("DOMContentLoaded", initNewsletterA11yFix);
//  } else {
//    initNewsletterA11yFix();
//  }
//})();