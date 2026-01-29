// /assets/js/modules/Newsletter.module.js
// Merged version:
// ✅ Keeps LIVE script behaviors (incl. First Name listeners + required UX)
// ✅ Keeps latest improvements:
//    - showEl/hideEl used consistently (prebuilt HTML nodes, style.display = "")
//    - Prevent Enter in dropdown search from submitting form
//    - Email strict validation + typo suggestion: gentle on blur, strict on submit
//    - DNS MX/A check is "lighter": only for domains NOT in COMMON_EMAIL_DOMAINS
// ✅ Assumes you removed aria-hidden="true" from HTML; JS relies on hidden + display only.

document.addEventListener("DOMContentLoaded", () => {
  const ROOT = document.querySelector(".newsletter-form");
  if (!ROOT) return;

  const form = ROOT.querySelector("form.hsfc-Form");
  if (!form) return;

  // -------------------------
  // HubSpot endpoint
  // ✅ Use the form's action as source of truth
  // -------------------------
  const HS_FORMSNEXT_ENDPOINT = form.getAttribute("action") || "";
  if (!HS_FORMSNEXT_ENDPOINT) return;

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

  const HS_GLOBAL_ERRORS = {
    BLOCKED_EMAIL: "Please change your email address to continue.",
    FIELD_ERRORS: "The form could not be submitted because some fields contain errors.",
    MISSING_REQUIRED: FORM_REQUIRED_MSG,
    TOO_MANY_REQUESTS:
      "There was an issue submitting your form. Please wait a few seconds and try again.",
  };

  const openDropdowns = new Set();
  const toArray = (x) => Array.prototype.slice.call(x || []);
  const norm = (s) => (s || "").toString().trim().toLowerCase();

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
  // Display helpers
  // ✅ HTML is prebuilt with style="display:none;" where needed
  // ✅ Use style.display = "" when showing prebuilt nodes
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
  // Form-level error + post-submit helpers
  // -------------------------
  function getNavAlertsEl() {
    return (
      form.querySelector(".hsfc-NavigationRow__Alerts") ||
      form.querySelector('[data-hsfc-id="NavigationRow"] .hsfc-NavigationRow__Alerts') ||
      null
    );
  }

  function getFormErrorEl() {
    const navAlerts = getNavAlertsEl();
    if (navAlerts) return navAlerts.querySelector(".hsfc-ErrorAlert") || null;
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
    if (el) {
      el.textContent = "";
      hideEl(el);
    }

    const navAlerts = getNavAlertsEl();
    const info = navAlerts ? navAlerts.querySelector(".hsfc-InfoAlert") : null;
    if (info) {
      info.textContent = "";
      hideEl(info);
    }
  }

  function showPostSubmit() {
    const postSubmit = ROOT.querySelector(".hsfc-PostSubmit");
    if (!postSubmit) return;

    hideEl(form);
    showEl(postSubmit);

    try {
      postSubmit.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {}
  }

  function hidePostSubmit() {
    const postSubmit = ROOT.querySelector(".hsfc-PostSubmit");
    if (postSubmit) hideEl(postSubmit);
    showEl(form);
  }

  // -------------------------
  // Error/Info helpers
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

  function showEmailSuggestion(fieldEl, inputEl, suggestion) {
    const infoEl = getInfoEl(fieldEl);
    if (!infoEl) return;

    let btn = infoEl.querySelector(".hsfc-LinkButton") || null;

    if (!btn || btn.tagName !== "BUTTON") {
      btn = document.createElement("button");
      btn.className = "hsfc-LinkButton";
      infoEl.innerHTML = "";
      infoEl.appendChild(btn);
    }

    btn.type = "button";
    btn.textContent = `Did you mean ${suggestion}?`;

    // Rebind safely
    const newBtn = btn.cloneNode(true);
    newBtn.type = "button";
    btn.parentNode.replaceChild(newBtn, btn);

    const applySuggestion = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function")
          e.stopImmediatePropagation();
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
    onListRestored,
  }) {
    let isOpen = false;

    const originalListTemplate = listEl ? listEl.cloneNode(true) : null;
    let showingNoMatches = false;
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

      if (!showingNoMatches) {
        bindOptionItems();
        return;
      }

      const restored = originalListTemplate.cloneNode(true);
      currentListEl.replaceWith(restored);
      currentListEl = restored;
      showingNoMatches = false;

      bindOptionItems();
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
      if (!anyVisible) showNoMatchesList();
    }

    function clearSearchAndNormalizeList() {
      if (searchEl) searchEl.value = "";
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

        showEl(optionsEl);
        setExpanded(true);

        positionDropdownOptions(optionsEl, anchorElForPosition || toggleEl, offsetParentEl);

        clearSearchAndNormalizeList();
        bindOptionItems();
        if (typeof onListRestored === "function") onListRestored(currentListEl);

        if (typeof onOpen === "function") onOpen();
        if (searchEl) setTimeout(() => searchEl.focus(), 0);
      },
      close() {
        if (!isOpen) return;
        isOpen = false;

        hideEl(optionsEl);
        setExpanded(false);

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

      // ✅ Prevent Enter inside dropdown search from submitting the form
      searchEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function")
            e.stopImmediatePropagation();
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          api.close();
          toggleEl.focus();
        }
      });
    }

    bindOptionItems();
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

      function getLiveCityListEl() {
        return cityOptions.querySelector('ul[role="listbox"]');
      }
      function getLiveCityOptionEls() {
        const ul = getLiveCityListEl();
        if (!ul) return [];
        return Array.from(ul.querySelectorAll('li[role="option"]'));
      }

      function setCitySelected(li) {
        const value = (li.textContent || "").trim();
        cityCombobox.value = value;
        cityHidden.value = value;

        const items = getLiveCityOptionEls();
        items.forEach((item) => {
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

      if (cityHidden.value.trim()) clearError(cityField, cityCombobox);
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
      // ✅ manual selection lock so shared-code typing logic doesn't override dropdown selection
      let manualCountryLock = false;

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

      // dynamic dial list
      let dialCodesSortedDesc = [];

      function findDialMatch(v) {
        if (!v) return "";
        return dialCodesSortedDesc.find((dc) => v.startsWith(dc)) || "";
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

      const PREFERRED_COUNTRY_BY_DIAL = {
        "+1": "United States",
        "+7": "Russia",
        "+44": "United Kingdom",
        "+61": "Australia",
        "+672": "Norfolk Island",
      };

      const MIN_NATIONAL_DIGITS_BY_DIAL = {
        "+63": 10,
        "+1": 10,
        "+7": 10,
        "+65": 8,
        "+852": 8,
        "+44": 9,
        "+61": 9,
        "+672": 5,
      };
      const DEFAULT_MIN_NATIONAL_DIGITS = 7;

      function digitsOnly(s) {
        return (s || "").toString().replace(/\D/g, "");
      }

      function nationalDigitsFromE164ish(dialCode, normalizedPlusDigits) {
        const dAll = digitsOnly(normalizedPlusDigits);
        const dDial = digitsOnly(dialCode);
        if (!dAll.startsWith(dDial)) return "";
        return dAll.slice(dDial.length);
      }

      const CANADA_AREA_CODES = new Set([
        "204","226","236","249","250","263","289","306","343","354","365","367","368",
        "403","416","418","431","437","438","450","468","474","506","514","519","548",
        "579","581","584","587","604","613","639","647","672","683","705","709","742",
        "753","778","780","782","807","819","825","867","873","902","905"
      ]);

      const NANP_OVERRIDES = [
        { countryName: "Puerto Rico", areaCodes: new Set(["787", "939"]) },
        { countryName: "Dominican Republic", areaCodes: new Set(["809", "829", "849"]) },
        { countryName: "Canada", areaCodes: CANADA_AREA_CODES }
      ];

      const ISO2_TO_COUNTRY_NAME = {
        US: "United States",
        CA: "Canada",
        PR: "Puerto Rico",
        DO: "Dominican Republic",

        RU: "Russia",
        KZ: "Kazakhstan",

        GB: "United Kingdom",
        JE: "Jersey",
        GG: "Guernsey",
        IM: "Isle of Man",

        AU: "Australia",
        CX: "Christmas Island",
        CC: "Cocos (Keeling) Islands",

        NF: "Norfolk Island",
        AQ: "Australian Antarctic Territory",
      };

      function nanpAreaFromNormalized(normalizedPlusDigits) {
        const d = digitsOnly(normalizedPlusDigits);
        if (!d.startsWith("1")) return "";
        const rest = d.slice(1);
        if (rest.length < 3) return "";
        return rest.slice(0, 3);
      }

      function detectCountryNameForDial(dialCode, normalizedPlusDigits) {
        if (parsePhoneNumberFromString) {
          try {
            const parsed = parsePhoneNumberFromString(normalizedPlusDigits);
            const iso2 = parsed?.country || "";
            const mapped = ISO2_TO_COUNTRY_NAME[iso2] || "";
            if (mapped) return mapped;
          } catch (_) {}
        }

        const nat = nationalDigitsFromE164ish(dialCode, normalizedPlusDigits);

        if (dialCode === "+1") {
          const area = nanpAreaFromNormalized(normalizedPlusDigits);
          if (area) {
            for (const o of NANP_OVERRIDES) {
              if (o.areaCodes && o.areaCodes.has(area)) return o.countryName;
            }
          }
          return "United States";
        }

        if (dialCode === "+7") {
          const first = (nat || "")[0] || "";
          if (first === "6" || first === "7") return "Kazakhstan";
          return "Russia";
        }

        if (dialCode === "+44") {
          if ((nat || "").startsWith("1534")) return "Jersey";
          if ((nat || "").startsWith("1481")) return "Guernsey";
          if ((nat || "").startsWith("1624")) return "Isle of Man";
          return "United Kingdom";
        }

        if (dialCode === "+61") {
          if ((nat || "").startsWith("89162")) return "Cocos (Keeling) Islands";
          if ((nat || "").startsWith("89164")) return "Christmas Island";
          return "Australia";
        }

        if (dialCode === "+672") {
          const first = (nat || "")[0] || "";
          if (first === "1") return "Australian Antarctic Territory";
          if (first === "3") return "Norfolk Island";
          return "Norfolk Island";
        }

        return "";
      }

      function isSharedDialCode(dialCode) {
        return (
          dialCode === "+1" ||
          dialCode === "+7" ||
          dialCode === "+44" ||
          dialCode === "+61" ||
          dialCode === "+672"
        );
      }

      let countryLis = [];
      let countries = [];
      let countriesByDial = new Map();
      let countryByLi = new Map();
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

      function pickCountryByNameAndDial(dialCode, countryName) {
        if (!dialCode || !countryName) return null;
        const list = countriesByDial.get(dialCode) || [];
        const nameNorm = norm(countryName);
        return list.find((c) => norm(c.text).includes(nameNorm)) || null;
      }

      function pickDefaultCountryForDial(dialCode, normalizedPlusDigits) {
        const list = countriesByDial.get(dialCode) || [];
        if (!list.length) return null;

        if (isSharedDialCode(dialCode)) {
          const name = detectCountryNameForDial(dialCode, normalizedPlusDigits || "");
          const byName = pickCountryByNameAndDial(dialCode, name);
          if (byName) return byName;

          const preferredName = PREFERRED_COUNTRY_BY_DIAL[dialCode];
          if (preferredName) {
            const hit = list.find((c) => (c.text || "").includes(preferredName));
            if (hit) return hit;
          }
          return list[0] || null;
        }

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

        const digitsOnlyVal = normalized.replace(/\D/g, "");
        if (digitsOnlyVal.length > 15)
          return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

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
        const nationalDigits = Math.max(0, digitsOnlyVal.length - dialDigits.length);

        if (nationalDigits === 0) return { ok: false, message: REQUIRED_MSG };

        const minNat = getMinNationalDigits(dialCode);
        if (nationalDigits < minNat)
          return { ok: false, message: PHONE_INVALID_FORMAT_MSG };

        return { ok: true, message: "" };
      }

      function setSelectedCountry(country, rewriteInputPrefix, isManualPick) {
        selectedCountry = country || null;

        if (isManualPick) {
          manualCountryLock = true;
        }

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
          manualCountryLock = false;
          selectedCountry = null;
          updateCountrySelectionUI(null);
          return;
        }

        const dialCode = findDialMatch(normalized);
        if (!dialCode) {
          manualCountryLock = false;
          selectedCountry = null;
          updateCountrySelectionUI(null);
          return;
        }

        // If user changed dial code, unlock manual selection
        if (selectedCountry && selectedCountry.dialCode !== dialCode) {
          manualCountryLock = false;
        }

        // If user manually selected a country and dial code is shared,
        // DO NOT override their selection while dial code remains the same.
        if (
          isSharedDialCode(dialCode) &&
          manualCountryLock &&
          selectedCountry &&
          selectedCountry.dialCode === dialCode
        ) {
          updateCountrySelectionUI(selectedCountry);
          return;
        }

        // Typing-based detection (shared dial codes) only when not locked
        if (isSharedDialCode(dialCode)) {
          const picked = pickDefaultCountryForDial(dialCode, normalized);
          if (picked && (!selectedCountry || selectedCountry.li !== picked.li)) {
            selectedCountry = picked;
            updateCountrySelectionUI(selectedCountry);
            return;
          }
          updateCountrySelectionUI(selectedCountry);
          return;
        }

        // Normal behavior for non-shared dial codes
        if (selectedCountry && selectedCountry.dialCode === dialCode) {
          updateCountrySelectionUI(selectedCountry);
          return;
        }

        const picked = pickDefaultCountryForDial(dialCode, normalized);
        selectedCountry = picked;
        updateCountrySelectionUI(selectedCountry);
      }

      phoneCtx = {
        field: phoneField,
        input: phoneInput,
        validate() {
          return validatePhoneValue(phoneInput.value || "");
        },
      };

      // Initial sync (typing logic applies on load)
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
          setSelectedCountry(c, true, true);
        },

        anchorElForPosition: phoneUI,
        offsetParentEl: phoneField,

        onOpen: () => {
          clearError(phoneField, phoneInput);
          clearFormError();
        },

        onListRestored: (ul) => {
          if (!ul) return;
          rebuildCountryIndex(ul);

          if (selectedCountry) {
            const match = countries.find(
              (c) =>
                c.dialCode === selectedCountry.dialCode &&
                c.display === selectedCountry.display
            );
            if (match) selectedCountry = match;
          }

          // Do NOT auto-switch shared-dial selections if user manually picked
          if (!manualCountryLock) {
            const normalized = normalizePhoneE164ish(phoneInput.value || "");
            const dial = findDialMatch(normalized);
            if (dial && isSharedDialCode(dial)) {
              const picked = pickDefaultCountryForDial(dial, normalized);
              if (picked) selectedCountry = picked;
            }
          }

          updateCountrySelectionUI(selectedCountry);
        },
      });

      phoneInput.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.metaKey) return;

        const k = e.key;
        const okKeys = [
          "Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown",
          "Home","End","Tab","Enter","Escape",
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

          if ((start === 0 && !v.includes("+")) || replacingAll || replacingFirstChar)
            return;

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
  // First Name (KEEP LIVE BEHAVIOR)
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
  // Email: strict format + suggestion + DNS existence check (submit only)
  // Option B: Gentle on blur (suggest only), strict on submit (block if needed)
  // ✅ Lighter: DNS check only if domain NOT in COMMON_EMAIL_DOMAINS
  // -------------------------
  function isEmailBasicFormat(v) {
    const s = (v || "").trim();
    if (!s) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return re.test(s);
  }

  const COMMON_EMAIL_DOMAINS = [
    "gmail.com","yahoo.com","yahoo.com.ph","ymail.com","outlook.com","hotmail.com",
    "live.com","icloud.com","me.com","proton.me","protonmail.com","aol.com","gmx.com",
  ];

  const COMMON_TLDS = [
    "com","net","org","edu","gov","io","co","me","ph","asia","info","biz","app","dev",
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

    if (/\s/.test(v)) return { ok: false, reason: "format" };

    if (local.startsWith(".") || local.endsWith(".")) return { ok: false, reason: "format" };
    if (domain.startsWith(".") || domain.endsWith(".")) return { ok: false, reason: "format" };

    if (v.includes("..")) return { ok: false, reason: "format" };

    if (!domain.includes(".")) return { ok: false, reason: "format" };

    if (!isEmailBasicFormat(v)) return { ok: false, reason: "format" };

    return { ok: true, reason: "" };
  }

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

    emailInput.addEventListener("input", () => {
      clearError(field, emailInput);
      clearInfo(field);
      clearFormError();
      hidePostSubmit();
    });

    emailInput.addEventListener("blur", () => {
      const v = emailInput.value.trim();
      clearInfo(field);

      // On blur: only show required/format errors (not the typo as a hard error)
      const strict = isEmailStrictEnough(v);
      if (!strict.ok) {
        if (strict.reason === "required") showError(field, emailInput, REQUIRED_MSG);
        else showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
        return;
      }

      // Gentle suggestion on blur (no red error)
      const suggestion = getEmailSuggestion(v);
      const tldIsKnown = isKnownCommonTld(v);

      if (!tldIsKnown && suggestion) {
        clearError(field, emailInput);
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

    checkboxInput.addEventListener("change", () => {
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
  // HubSpot AJAX submit helpers
  // -------------------------
  function hsGetCookie(name) {
    const m = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : "";
  }

  function hsBuildContextJSON() {
    const hutk = hsGetCookie("hubspotutk");
    const ctx = {
      source: "forms-embed-static",
      sourceName: "forms-embed",
      sourceVersion: "1.0",
      sourceVersionMajor: "1",
      sourceVersionMinor: "0",
      hutk: hutk || undefined,
      pageUri: window.location.href,
      pageName: document.title,
      referrer: document.referrer || "",
      userAgent: navigator.userAgent,
    };
    Object.keys(ctx).forEach((k) => ctx[k] === undefined && delete ctx[k]);
    return JSON.stringify(ctx);
  }

  function setButtonLoading(loading) {
    const btn =
      form.querySelector('button[type="submit"]') || form.querySelector(".hsfc-Button");
    if (!btn) return;
    btn.disabled = !!loading;
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    btn.classList.toggle("hsfc-Button--loading", !!loading);
  }

  async function hsSubmitToHubSpot() {
    const fd = new FormData(form);

    fd.set("hs_context", hsBuildContextJSON());

    if (checkboxInput) {
      fd.set(checkboxInput.name, checkboxInput.checked ? "true" : "false");
    }

    const res = await fetch(HS_FORMSNEXT_ENDPOINT, {
      method: "POST",
      mode: "cors",
      body: fd,
    });

    let payload = null;
    const contentType = res.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) payload = await res.json();
      else payload = await res.text();
    } catch (_) {
      payload = null;
    }

    return { res, payload };
  }

  // -------------------------
  // Submit validation + HubSpot AJAX submission
  // -------------------------
  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      e.stopPropagation();

      hidePostSubmit();

      const invalidTargets = [];
      clearFormError();

      // First Name (use the already-cached reference from LIVE section)
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

      // Email (strict + suggestion gate + lighter DNS)
      if (emailInput) {
        const field = emailInput.closest(".hsfc-EmailField");
        const v = emailInput.value.trim();

        clearInfo(field);

        const strict = isEmailStrictEnough(v);
        if (!strict.ok) {
          if (strict.reason === "required") showError(field, emailInput, REQUIRED_MSG);
          else showError(field, emailInput, EMAIL_INVALID_FORMAT_MSG);
          invalidTargets.push(emailInput);
        } else {
          const suggestion = getEmailSuggestion(v);
          const tldIsKnown = isKnownCommonTld(v);

          // On submit: if strong typo suggestion exists, block until corrected
          if (!tldIsKnown && suggestion) {
            showError(field, emailInput, EMAIL_INVALID_MSG);
            showEmailSuggestion(field, emailInput, suggestion);
            invalidTargets.push(emailInput);
          } else {
            const domain = getEmailDomain(v);

            // ✅ Lighter: only DNS-check unknown domains (skip Gmail/Yahoo/Outlook/etc.)
            const shouldDnsCheck =
              !!domain && !COMMON_EMAIL_DOMAINS.includes(domain.toLowerCase());

            if (shouldDnsCheck) {
              try {
                const hasMxOrA = await checkDomainHasMxOrA(domain);
                if (!hasMxOrA) {
                  showError(field, emailInput, EMAIL_INVALID_MSG);
                  invalidTargets.push(emailInput);
                }
              } catch (_) {
                // Soft-pass on DNS failures (blocked/timeout) so we don't reject legit users.
              }
            }
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
        closeAllDropdowns(null);
        showFormError(HS_GLOBAL_ERRORS.MISSING_REQUIRED);
        invalidTargets[0].focus();
        return;
      }

      closeAllDropdowns(null);
      clearFormError();
      setButtonLoading(true);

      try {
        const { res, payload } = await hsSubmitToHubSpot();

        if (res.ok) {
          showPostSubmit();
          return;
        }

        if (res.status === 429) {
          showFormError(HS_GLOBAL_ERRORS.TOO_MANY_REQUESTS);
          return;
        }

        const text = typeof payload === "string" ? payload : JSON.stringify(payload || {});
        const lowered = (text || "").toLowerCase();

        if (lowered.includes("blocked") && lowered.includes("email")) {
          showFormError(HS_GLOBAL_ERRORS.BLOCKED_EMAIL);
        } else {
          showFormError(HS_GLOBAL_ERRORS.FIELD_ERRORS);
        }
      } catch (_) {
        showFormError(HS_GLOBAL_ERRORS.TOO_MANY_REQUESTS);
      } finally {
        setButtonLoading(false);
      }
    },
    true
  );
});