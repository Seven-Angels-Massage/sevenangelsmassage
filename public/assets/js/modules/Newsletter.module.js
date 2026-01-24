// /assets/js/modules/Newsletter.module.js

document.addEventListener("DOMContentLoaded", () => {
  const ROOT = document.querySelector(".newsletter-form");
  if (!ROOT) return;

  const form = ROOT.querySelector("form.hsfc-Form");
  if (!form) return;

  const REQUIRED_MSG = "Please complete this required field.";
  const EMAIL_INVALID_MSG = "Email must be formatted correctly.";
  const PHONE_INVALID_MSG =
    "This phone number is either invalid or is in the wrong format.";

  const openDropdowns = new Set();
  const toArray = (x) => Array.prototype.slice.call(x || []);
  const norm = (s) => (s || "").toString().trim().toLowerCase();

  /* ------------------------------
     Error helpers
  ------------------------------ */
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

  /* ------------------------------
     Dropdown engine
  ------------------------------ */
  function setListMaxHeight(listEl, px = 260) {
    if (!listEl) return;
    listEl.style.maxHeight = `${px}px`;
    listEl.style.overflowY = "auto";
  }

  function filterItems(items, q) {
    const query = norm(q);
    items.forEach((li) => {
      li.style.display =
        !query || norm(li.textContent).includes(query) ? "" : "none";
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
        toggleEl.setAttribute("aria-expanded", "true");
        setListMaxHeight(listEl);
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
        toggleEl.setAttribute("aria-expanded", "false");
        if (searchEl) searchEl.value = "";
        openDropdowns.delete(api);
      },
      toggle() {
        isOpen ? api.close() : api.open();
      },
      contains(t) {
        return toggleEl.contains(t) || optionsEl.contains(t);
      },
    };

    toggleEl.addEventListener("click", (e) => {
      e.preventDefault();
      api.toggle();
    });

    if (searchEl) {
      searchEl.addEventListener("input", () =>
        filterItems(items, searchEl.value)
      );
    }

    items.forEach((li) => {
      li.addEventListener("click", () => {
        onSelect(li);
        api.close();
      });
    });

    return api;
  }

  document.addEventListener("pointerdown", (e) => {
    for (const dd of openDropdowns) {
      if (dd.contains(e.target)) return;
    }
    closeAllDropdowns(null);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns(null);
  });

  /* ------------------------------
     PHONE FIELD (HubSpot-accurate)
  ------------------------------ */
  const phoneHidden = form.querySelector('input[name="0-1/phone"]');
  if (phoneHidden) {
    const field = phoneHidden.closest(".hsfc-PhoneField");
    const input = field.querySelector('input[type="tel"]');
    const flag = field.querySelector(".hsfc-PhoneInput__FlagAndCaret__Flag");
    const options = field.querySelector(".hsfc-DropdownOptions");
    const search = options.querySelector('input[role="searchbox"]');
    const list = options.querySelector("ul");
    const lis = toArray(list.querySelectorAll("li"));

    const countries = lis.map((li) => {
      const text = li.textContent.trim();
      const dial = (text.match(/\+\d+$/) || [""])[0];
      return {
        li,
        dial,
        flag: text.split(" ")[0],
      };
    });

    let selected = countries.find((c) =>
      c.li.classList.contains("hsfc-DropdownOptions__List__ListItem--selected")
    );

    function updateFlag(country) {
      flag.textContent = country ? country.flag : "";
    }

    function syncHidden() {
      phoneHidden.value = input.value.trim();
    }

    function setCountry(country, rewrite = true) {
      if (!country) {
        selected = null;
        updateFlag(null);
        return;
      }
      selected = country;
      lis.forEach((li) =>
        li.classList.toggle(
          "hsfc-DropdownOptions__List__ListItem--selected",
          li === country.li
        )
      );
      updateFlag(country);

      if (rewrite) {
        const rest = input.value.replace(/^\+\d+/, "");
        input.value = country.dial + rest;
      }
      syncHidden();
      clearError(field, input);
    }

    createDropdown({
      toggleEl: field.querySelector(".hsfc-PhoneInput__FlagAndCaret"),
      optionsEl: options,
      searchEl: search,
      listEl: list,
      items: lis,
      onSelect: (li) => {
        const c = countries.find((x) => x.li === li);
        setCountry(c, true);
      },
    });

    input.addEventListener("input", () => {
      let v = input.value;

      // enforce + only at start
      v = v.replace(/[^\d+]/g, "");
      if (v.indexOf("+") > 0) v = v.replace(/\+/g, "");
      if (v && v[0] !== "+") v = "+" + v;

      input.value = v;
      syncHidden();

      if (!v || v === "+") {
        setCountry(null);
        return;
      }

      const match = countries.find((c) => v.startsWith(c.dial));
      if (match) setCountry(match, false);

      clearError(field, input);
    });

    input.addEventListener("blur", () => {
      const v = input.value.trim();
      if (!v || v === "+") {
        showError(field, input, REQUIRED_MSG);
        return;
      }
      const digits = v.replace(/\D/g, "");
      if (digits.length < 7) {
        showError(field, input, PHONE_INVALID_MSG);
      }
    });
  }

  /* ------------------------------
     CHECKBOX (missing error fixed)
  ------------------------------ */
  const checkbox = form.querySelector(
    'input[type="checkbox"][name="0-1/confirmation_checkbox"]'
  );
  if (checkbox) {
    const field = checkbox.closest(".hsfc-CheckboxField");
    checkbox.addEventListener("change", () => {
      checkbox.value = checkbox.checked ? "true" : "false";
      if (checkbox.checked) clearError(field, checkbox);
    });
  }

  /* ------------------------------
     SUBMIT VALIDATION
  ------------------------------ */
  form.addEventListener("submit", (e) => {
    let invalid = null;

    form
      .querySelectorAll("[aria-required='true']")
      .forEach((input) => {
        const field = input.closest(
          ".hsfc-TextField,.hsfc-EmailField,.hsfc-PhoneField,.hsfc-CheckboxField,.hsfc-DropdownField"
        );

        if (input.type === "checkbox" && !input.checked) {
          showError(field, input, REQUIRED_MSG);
          invalid ||= input;
        } else if (input.type !== "checkbox" && !input.value.trim()) {
          showError(field, input, REQUIRED_MSG);
          invalid ||= input;
        }
      });

    if (invalid) {
      e.preventDefault();
      invalid.focus();
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