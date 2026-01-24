// /assets/js/modules/Newsletter.module.js

document.addEventListener("DOMContentLoaded", () => {
  const ROOT = document.querySelector(".newsletter-form");
  if (!ROOT) return;

  const form = ROOT.querySelector("form.hsfc-Form");
  if (!form) return;

  const REQUIRED_MSG = "Please complete this required field.";
  const EMAIL_INVALID_MSG = "Email must be formatted correctly.";
  const PHONE_INVALID_CHARS_MSG =
    "Must start with an extension and contain only numbers, +()-. and x.";

  const openDropdowns = new Set();
  const toArray = (x) => Array.prototype.slice.call(x || []);
  const norm = (s) => (s || "").toString().trim().toLowerCase();

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

  function setListMaxHeight(listEl, px = 260) {
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

  function createDropdown({
    toggleEl,
    optionsEl,
    searchEl,
    listEl,
    items,
    ariaExpandedEl,
    onSelect,
  }) {
    let isOpen = false;

    const api = {
      open() {
        if (isOpen) return;
        isOpen = true;

        closeAllDropdowns(api);

        optionsEl.style.display = "flex";
        if (ariaExpandedEl) ariaExpandedEl.setAttribute("aria-expanded", "true");
        if (toggleEl) toggleEl.setAttribute("aria-expanded", "true");

        // Force HubSpot-like scrollbar behavior
        setListMaxHeight(listEl, 260);

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
  const cityHidden = form.querySelector('input[type="hidden"][name="0-1/location_"]');
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
      listEl: cityList,
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
      if (!cityHidden.value.trim()) showError(cityField, cityCombobox, REQUIRED_MSG);
    });
  }

  // -------------------------
  // Phone (country + dial code)
  // -------------------------
  const phoneHidden = form.querySelector('input[type="hidden"][name="0-1/phone"]');
  if (phoneHidden) {
    const phoneField = phoneHidden.closest(".hsfc-PhoneField");
    const phoneInput = phoneField.querySelector('input[type="tel"]');
    const phoneUI = phoneField.querySelector(".hsfc-PhoneInput");
    const flagAndCaret = phoneUI.querySelector(".hsfc-PhoneInput__FlagAndCaret");
    const flagSpan = phoneUI.querySelector(".hsfc-PhoneInput__FlagAndCaret__Flag");
    const phoneOptions = phoneUI.querySelector(".hsfc-DropdownOptions");
    const phoneSearch = phoneOptions.querySelector('input[role="searchbox"]');
    const phoneList = phoneOptions.querySelector('ul[role="listbox"]');
    const countryLis = toArray(phoneList.querySelectorAll('li[role="option"]'));

    function parseDialCode(text) {
      const m = (text || "").trim().match(/\+[\d]+$/);
      return m ? m[0] : "";
    }

    // Map countries from LI text
    const countries = countryLis
      .map((li) => {
        const text = (li.textContent || "").trim();
        const dialCode = parseDialCode(text);
        const flag = text.split(/\s+/)[0] || "";
        return { li, text, dialCode, flag };
      })
      .filter((c) => c.dialCode);

    const dialCodesSortedDesc = [...new Set(countries.map((c) => c.dialCode))].sort(
      (a, b) => b.length - a.length
    );

    const countryByDial = new Map();
    countries.forEach((c) => {
      if (!countryByDial.has(c.dialCode)) countryByDial.set(c.dialCode, c);
    });

    // initial selected
    let selectedCountry =
      countries.find(
        (c) =>
          c.li.getAttribute("aria-selected") === "true" ||
          c.li.classList.contains("hsfc-DropdownOptions__List__ListItem--selected")
      ) || countries[0];

    function updateCountrySelectionUI(country) {
      if (!country) return;

      countries.forEach((c) => {
        const selected = c === country;
        c.li.setAttribute("aria-selected", selected ? "true" : "false");
        c.li.classList.toggle(
          "hsfc-DropdownOptions__List__ListItem--selected",
          selected
        );
      });

      if (flagSpan) flagSpan.textContent = country.flag || "";
    }

    function splitDialAndRest(rawValue) {
      const v = (rawValue || "").trim();
      if (!v) return { dialCode: "", rest: "" };

      const normalized = v.startsWith("+") ? v : `+${v}`;
      const match = dialCodesSortedDesc.find((dc) => normalized.startsWith(dc));
      if (match) return { dialCode: match, rest: normalized.slice(match.length) };

      const m = normalized.match(/^\+\d{1,4}/);
      if (m) return { dialCode: m[0], rest: normalized.slice(m[0].length) };

      return { dialCode: "", rest: normalized };
    }

    function syncHiddenPhone() {
      phoneHidden.value = (phoneInput.value || "").trim();
    }

    function setSelectedCountry(country, rewriteInputPrefix) {
      if (!country) return;
      selectedCountry = country;
      updateCountrySelectionUI(country);

      if (rewriteInputPrefix) {
        const current = phoneInput.value || "";
        const { rest } = splitDialAndRest(current);

        if (!current.trim()) {
          phoneInput.value = country.dialCode;
        } else {
          phoneInput.value = `${country.dialCode}${rest}`;
        }
      }

      syncHiddenPhone();
      clearError(phoneField, phoneInput);
    }

    // initial sync
    setSelectedCountry(selectedCountry, false);
    syncHiddenPhone();

    // dropdown setup
    createDropdown({
      toggleEl: flagAndCaret,
      optionsEl: phoneOptions,
      searchEl: phoneSearch,
      listEl: phoneList,
      items: countryLis,
      ariaExpandedEl: flagAndCaret,
      onSelect: (li) => {
        const dc = parseDialCode(li.textContent);
        setSelectedCountry(countryByDial.get(dc), true);
      },
    });

    // typing dial code auto-selects country
    phoneInput.addEventListener("input", () => {
      const raw = (phoneInput.value || "").trim();

      // clear lone "+"
      if (raw === "+") {
        phoneInput.value = "";
        syncHiddenPhone();
        return;
      }

      syncHiddenPhone();

      // auto-prefix +
      if (raw && !raw.startsWith("+") && /^\d/.test(raw)) {
        const pos = phoneInput.selectionStart;
        phoneInput.value = `+${raw}`;
        if (typeof pos === "number") phoneInput.setSelectionRange(pos + 1, pos + 1);
      }

      const { dialCode } = splitDialAndRest(phoneInput.value);
      if (dialCode) {
        const found = countryByDial.get(dialCode);
        if (found && found !== selectedCountry) {
          // do not rewrite input while typing (avoid cursor jump)
          setSelectedCountry(found, false);
        }
      }

      if ((phoneInput.value || "").trim()) clearError(phoneField, phoneInput);
    });

    phoneInput.addEventListener("blur", () => {
      const v = (phoneInput.value || "").trim();

      if (v && !/^[+\d().\-\sx]+$/i.test(v)) {
        showError(phoneField, phoneInput, PHONE_INVALID_CHARS_MSG);
        return;
      }

      const digits = v.replace(/\D/g, "");
      const dialDigits = (selectedCountry?.dialCode || "").replace(/\D/g, "");
      const nationalDigits = dialDigits
        ? Math.max(0, digits.length - dialDigits.length)
        : digits.length;

      if (!v || nationalDigits < 4) {
        showError(phoneField, phoneInput, REQUIRED_MSG);
      }
    });
  }

  // -------------------------
  // First name + Email + Checkbox
  // -------------------------
  const firstNameInput = form.querySelector('input[name="0-1/firstname"]');
  if (firstNameInput) {
    const field = firstNameInput.closest(".hsfc-TextField");
    firstNameInput.addEventListener("input", () => {
      if (firstNameInput.value.trim()) clearError(field, firstNameInput);
    });
    firstNameInput.addEventListener("blur", () => {
      if (!firstNameInput.value.trim()) showError(field, firstNameInput, REQUIRED_MSG);
    });
  }

  const emailInput = form.querySelector('input[name="0-1/email"]');
  if (emailInput) {
    const field = emailInput.closest(".hsfc-EmailField");
    emailInput.addEventListener("input", () => {
      if (emailInput.value.trim()) clearError(field, emailInput);
    });
    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();
      if (!v) showError(field, emailInput, REQUIRED_MSG);
      else if (!emailInput.checkValidity()) showError(field, emailInput, EMAIL_INVALID_MSG);
    });
  }

  const checkboxInput = form.querySelector('input[type="checkbox"][name="0-1/confirmation_checkbox"]');
  if (checkboxInput) {
    const field = checkboxInput.closest(".hsfc-CheckboxField");

    // Make checkbox submit "true" when checked
    checkboxInput.value = checkboxInput.checked ? "true" : "false";

    checkboxInput.addEventListener("change", () => {
      checkboxInput.value = checkboxInput.checked ? "true" : "false";
      if (checkboxInput.checked) clearError(field, checkboxInput);
    });
  }

  // -------------------------
  // Submit validation (required text in red)
  // -------------------------
  form.addEventListener("submit", (e) => {
    const invalidTargets = [];

    // First Name
    if (firstNameInput) {
      const field = firstNameInput.closest(".hsfc-TextField");
      if (!firstNameInput.value.trim()) {
        showError(field, firstNameInput, REQUIRED_MSG);
        invalidTargets.push(firstNameInput);
      }
    }

    // City (uses hidden value)
    const cityHidden2 = form.querySelector('input[type="hidden"][name="0-1/location_"]');
    if (cityHidden2) {
      const cityField = cityHidden2.closest(".hsfc-DropdownField");
      const cityCombobox = cityField.querySelector("input.hsfc-TextInput--button");
      if (!cityHidden2.value.trim()) {
        showError(cityField, cityCombobox, REQUIRED_MSG);
        invalidTargets.push(cityCombobox);
      }
    }

    // Phone (hidden is synced; validate visible)
    const phoneHidden2 = form.querySelector('input[type="hidden"][name="0-1/phone"]');
    if (phoneHidden2) {
      const phoneField = phoneHidden2.closest(".hsfc-PhoneField");
      const phoneInput = phoneField.querySelector('input[type="tel"]');
      const v = (phoneInput.value || "").trim();

      const digits = v.replace(/\D/g, "");
      const possibleDial = ((v.startsWith("+") ? v : `+${v}`).match(/^\+\d{1,4}/) || [])[0] || "";
      const dialDigits = possibleDial.replace(/\D/g, "");
      const nationalDigits = dialDigits
        ? Math.max(0, digits.length - dialDigits.length)
        : digits.length;

      if (!v || v === "+" || nationalDigits < 4) {
        showError(phoneField, phoneInput, REQUIRED_MSG);
        invalidTargets.push(phoneInput);
      }
    }

    // Email
    if (emailInput) {
      const field = emailInput.closest(".hsfc-EmailField");
      const v = emailInput.value.trim();
      if (!v) {
        showError(field, emailInput, REQUIRED_MSG);
        invalidTargets.push(emailInput);
      } else if (!emailInput.checkValidity()) {
        showError(field, emailInput, EMAIL_INVALID_MSG);
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
      invalidTargets[0].focus();
    }
  });
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
(function () {
  "use strict";

  function patchHubSpotDropdownA11y(root) {
    if (!root || root.nodeType !== 1) return;

    // Target the HubSpot dropdown input pattern seen in your Lighthouse screenshot.
    // Example classes: .hsfc-DropdownInput .hsfc-TextInput--button
    var inputs = root.querySelectorAll(
      'input.hsfc-TextInput[role="button"][aria-haspopup="listbox"], ' +
      'input.hsfc-TextInput--button[role="button"], ' +
      'div.hsfc-DropdownInput input[role="button"]'
    );

    inputs.forEach(function (el) {
      // Avoid re-patching
      if (el.dataset && el.dataset.samA11yPatched === "1") return;

      // Switch invalid role="button" to a valid dropdown text-entry control pattern.
      // This resolves Lighthouse ARIA role mismatch warnings.
      el.setAttribute("role", "combobox");

      // Ensure autocomplete semantics are coherent for combobox.
      if (!el.hasAttribute("aria-autocomplete")) {
        el.setAttribute("aria-autocomplete", "list");
      }

      // Keep aria-haspopup="listbox" if present; it's valid for combobox.
      // Keep aria-expanded if present; it's valid for combobox.

      // Mark patched
      if (el.dataset) el.dataset.samA11yPatched = "1";
    });
  }

  function initNewsletterA11yFix() {
    // Limit patching to the newsletter module area first.
    var newsletterRoot = document.querySelector(".newsletter-form");
    if (newsletterRoot) patchHubSpotDropdownA11y(newsletterRoot);

    // Also observe future form injections/re-renders (HubSpot can do late hydration).
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(function (node) {
            if (node && node.nodeType === 1) {
              // Patch within the added subtree
              patchHubSpotDropdownA11y(node);
            }
          });
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNewsletterA11yFix);
  } else {
    initNewsletterA11yFix();
  }
})();