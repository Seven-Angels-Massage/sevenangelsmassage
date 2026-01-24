function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : "";
}

function buildHsContext() {
  const urlParams = {};
  for (const [k, v] of new URLSearchParams(window.location.search).entries()) urlParams[k] = v;

  const hutk = getCookie("hubspotutk");

  const ctx = {
    source: "forms-embed-static",
    sourceName: "forms-embed",
    sourceVersion: "1.0",
    sourceVersionMajor: "1",
    sourceVersionMinor: "0",
    referrer: document.referrer || "",
    userAgent: navigator.userAgent,
    urlParams,
    canonicalUrl: window.location.origin,
    contentType: "standard-page",
    locale: "en",
    pageUrl: window.location.href,
    pageTitle: document.title || "",
  };

  if (hutk) ctx.hutk = hutk;

  return ctx;
}

function setError(alertsEl, message) {
  if (!alertsEl) return;
  alertsEl.innerHTML = `<div data-hsfc-id="ErrorAlert" class="hsfc-ErrorAlert">${message}</div>`;
}

function clearError(alertsEl) {
  if (!alertsEl) return;
  alertsEl.innerHTML = "";
}

function closeDropdown(dropdownOptions, comboboxInput) {
  if (!dropdownOptions) return;
  dropdownOptions.style.display = "none";
  dropdownOptions.style.top = "";
  dropdownOptions.style.left = "";
  dropdownOptions.style.right = "";
  dropdownOptions.style.width = "";
  if (comboboxInput) comboboxInput.setAttribute("aria-expanded", "false");

  // clear search + reset filter
  const search = dropdownOptions.querySelector('.hsfc-DropdownOptions__Search input');
  if (search) search.value = "";

  const items = dropdownOptions.querySelectorAll(".hsfc-DropdownOptions__List__ListItem");
  items.forEach((li) => (li.style.display = ""));
}

function openDropdown(dropdownOptions, comboboxInput, positionFn) {
  if (!dropdownOptions) return;
  dropdownOptions.style.display = "flex";
  if (comboboxInput) comboboxInput.setAttribute("aria-expanded", "true");

  if (typeof positionFn === "function") positionFn(dropdownOptions);

  const search = dropdownOptions.querySelector('.hsfc-DropdownOptions__Search input');
  if (search) search.focus();
}

function filterDropdown(dropdownOptions, query) {
  const q = (query || "").trim().toLowerCase();
  const items = dropdownOptions.querySelectorAll(".hsfc-DropdownOptions__List__ListItem");
  items.forEach((li) => {
    const text = (li.textContent || "").toLowerCase();
    li.style.display = text.includes(q) ? "" : "none";
  });
}

function selectListItem(listRoot, selectedLi) {
  const items = listRoot.querySelectorAll(".hsfc-DropdownOptions__List__ListItem");
  items.forEach((li) => {
    li.classList.remove("hsfc-DropdownOptions__List__ListItem--selected");
    li.setAttribute("aria-selected", "false");
  });

  selectedLi.classList.add("hsfc-DropdownOptions__List__ListItem--selected");
  selectedLi.setAttribute("aria-selected", "true");
}

function setupCityDropdown(formRoot) {
  const field = formRoot.querySelector("#hs_form_target_form_725511019-2089118563845");
  if (!field) return;

  const comboboxInput = field.querySelector("#hs_form_target_form_725511019-2089118563845-input");
  const hiddenInput = field.querySelector('input[type="hidden"][name="0-1/location_"]');
  const caret = field.querySelector(".hsfc-DropdownInput__Caret");
  const dropdownOptions = field.querySelector('.hsfc-DropdownOptions');
  const searchInput = dropdownOptions?.querySelector('.hsfc-DropdownOptions__Search input');
  const list = dropdownOptions?.querySelector(".hsfc-DropdownOptions__List");

  if (!comboboxInput || !hiddenInput || !dropdownOptions || !list) return;

  const positionOptions = (opts) => {
    const wrap = field.querySelector(".hsfc-DropdownInput");
    if (!wrap) return;
    opts.style.left = "0";
    opts.style.top = (wrap.offsetHeight + 4) + "px";
  };

  const toggle = () => {
    const isOpen = dropdownOptions.style.display !== "none";
    if (isOpen) closeDropdown(dropdownOptions, comboboxInput);
    else openDropdown(dropdownOptions, comboboxInput, positionOptions);
  };

  comboboxInput.addEventListener("click", toggle);
  caret?.addEventListener("click", toggle);

  searchInput?.addEventListener("input", (e) => {
    filterDropdown(dropdownOptions, e.target.value);
  });

  list.addEventListener("click", (e) => {
    const li = e.target.closest(".hsfc-DropdownOptions__List__ListItem");
    if (!li) return;

    selectListItem(list, li);
    comboboxInput.value = (li.textContent || "").trim();
    hiddenInput.value = (li.textContent || "").trim();
    closeDropdown(dropdownOptions, comboboxInput);
    comboboxInput.focus();
  });

  // keyboard support (basic)
  comboboxInput.addEventListener("keydown", (e) => {
    const isOpen = dropdownOptions.style.display !== "none";

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) openDropdown(dropdownOptions, comboboxInput, positionOptions);
      const first = Array.from(list.querySelectorAll(".hsfc-DropdownOptions__List__ListItem")).find(li => li.style.display !== "none");
      first?.focus();
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown(dropdownOptions, comboboxInput);
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (!isOpen) openDropdown(dropdownOptions, comboboxInput, positionOptions);
    }
  });

  list.addEventListener("keydown", (e) => {
    const items = Array.from(list.querySelectorAll(".hsfc-DropdownOptions__List__ListItem")).filter(li => li.style.display !== "none");
    const idx = items.indexOf(document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(idx + 1, items.length - 1)]?.focus();
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(idx - 1, 0)]?.focus();
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const li = document.activeElement?.closest(".hsfc-DropdownOptions__List__ListItem");
      if (li) {
        selectListItem(list, li);
        comboboxInput.value = (li.textContent || "").trim();
        hiddenInput.value = (li.textContent || "").trim();
        closeDropdown(dropdownOptions, comboboxInput);
        comboboxInput.focus();
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown(dropdownOptions, comboboxInput);
      comboboxInput.focus();
    }
  });

  // click outside closes
  document.addEventListener("click", (e) => {
    if (!field.contains(e.target)) closeDropdown(dropdownOptions, comboboxInput);
  });
}

function setupPhoneDropdown(formRoot) {
  const field = formRoot.querySelector("#hs_form_target_form_725511019-2232189162782");
  if (!field) return;

  const phoneWrap = field.querySelector(".hsfc-PhoneInput");
  const flagCaretBtn = field.querySelector(".hsfc-PhoneInput__FlagAndCaret");
  const flagSpan = field.querySelector(".hsfc-PhoneInput__FlagAndCaret__Flag");
  const phoneInput = field.querySelector("#hs_form_target_form_725511019-2232189162782-input");
  const hiddenPhone = field.querySelector('input[type="hidden"][name="0-1/phone"]');
  const dropdownOptions = field.querySelector('.hsfc-PhoneInput .hsfc-DropdownOptions');
  const searchInput = dropdownOptions?.querySelector('.hsfc-DropdownOptions__Search input');
  const list = dropdownOptions?.querySelector(".hsfc-DropdownOptions__List");

  if (!phoneWrap || !flagCaretBtn || !flagSpan || !phoneInput || !hiddenPhone || !dropdownOptions || !list) return;

  const positionOptions = (opts) => {
    const fieldRect = field.getBoundingClientRect();
    const wrapRect = phoneWrap.getBoundingClientRect();

    opts.style.left = (wrapRect.left - fieldRect.left) + "px";
    opts.style.top = (wrapRect.bottom - fieldRect.top + 4) + "px";
    opts.style.width = wrapRect.width + "px";
  };

  const toggle = () => {
    const isOpen = dropdownOptions.style.display !== "none";
    if (isOpen) closeDropdown(dropdownOptions);
    else openDropdown(dropdownOptions, null, positionOptions);
  };

  flagCaretBtn.addEventListener("click", toggle);
  flagCaretBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown(dropdownOptions);
    }
  });

  searchInput?.addEventListener("input", (e) => {
    filterDropdown(dropdownOptions, e.target.value);
  });

  list.addEventListener("click", (e) => {
    const li = e.target.closest(".hsfc-DropdownOptions__List__ListItem");
    if (!li) return;

    selectListItem(list, li);

    const text = (li.textContent || "").trim();
    const flag = text.split(" ")[0] || "🏳️";
    const m = text.match(/\+(\d+)\s*$/);
    const code = m ? m[1] : "";

    flagSpan.textContent = flag;

    if (code) {
      // replace existing +digits prefix, or set a new one
      const current = phoneInput.value || "";
      if (/^\+\d+/.test(current)) {
        phoneInput.value = current.replace(/^\+\d+/, `+${code}`);
      } else {
        phoneInput.value = `+${code}`;
      }
    }

    // keep hidden value synced
    hiddenPhone.value = phoneInput.value;

    closeDropdown(dropdownOptions);
    phoneInput.focus();
  });

  phoneInput.addEventListener("input", () => {
    hiddenPhone.value = phoneInput.value;
  });

  // click outside closes
  document.addEventListener("click", (e) => {
    if (!field.contains(e.target)) closeDropdown(dropdownOptions);
  });
}

function setupCheckboxSync(formRoot) {
  const cb = formRoot.querySelector('#hs_form_target_form_725511019-2228651451587-input');
  if (!cb) return;

  const sync = () => {
    cb.value = cb.checked ? "true" : "false";
  };

  cb.addEventListener("change", sync);
  sync();
}

function setupSubmitFlow(formRoot) {
  const form = formRoot.querySelector('#hs_form_target_form_725511019-a8e00675-911e-492c-807c-4e00fdfff76a');
  if (!form) return;

  const alerts = form.querySelector("#hs_form_target_form_725511019-37-a");
  const submitBtn = form.querySelector("#hs_form_target_form_725511019-15");
  const iframe = form.querySelector('iframe[name^="submission_handler_hs_form_target_form_725511019"]');

  const firstName = form.querySelector("#hs_form_target_form_725511019-6-input");
  const cityHidden = form.querySelector('input[type="hidden"][name="0-1/location_"]');
  const cityVisible = form.querySelector("#hs_form_target_form_725511019-2089118563845-input");
  const phoneVisible = form.querySelector("#hs_form_target_form_725511019-2232189162782-input");
  const phoneHidden = form.querySelector('input[type="hidden"][name="0-1/phone"]');
  const email = form.querySelector("#hs_form_target_form_725511019-3-input");
  const checkbox = form.querySelector("#hs_form_target_form_725511019-2228651451587-input");
  const hsContext = form.querySelector('input[name="hs_context"]');

  const postSubmit = document.getElementById("hs_form_target_form_725511019-postsubmit");
  const formWrapper = formRoot.querySelector(".hsfc-FormWrapper");

  // fill hs_context once
  if (hsContext) {
    hsContext.value = JSON.stringify(buildHsContext());
  }

  let submitted = false;

  iframe?.addEventListener("load", () => {
    if (!submitted) return;
    submitted = false;

    // stop loading state
    if (submitBtn) {
      submitBtn.classList.remove("hsfc-Button--loading");
      submitBtn.setAttribute("aria-busy", "false");
      submitBtn.disabled = false;
    }

    clearError(alerts);

    // show post submit
    if (formWrapper) formWrapper.style.display = "none";
    if (postSubmit) postSubmit.style.display = "block";
  });

  form.addEventListener("submit", (e) => {
    clearError(alerts);

    // sync hidden values before submit
    if (phoneHidden && phoneVisible) phoneHidden.value = phoneVisible.value;
    if (checkbox) checkbox.value = checkbox.checked ? "true" : "false";

    const problems = [];

    if (!firstName || !firstName.value.trim()) problems.push("Please complete this required field: First Name.");
    if (!cityHidden || !cityHidden.value.trim()) problems.push("Please complete this required field: City / Location.");
    if (!phoneVisible || !phoneVisible.value.trim() || phoneVisible.value.trim() === "+") problems.push("Please complete this required field: Mobile Number.");
    if (!email || !email.value.trim() || !email.checkValidity()) problems.push("Please enter a valid email address.");
    if (!checkbox || !checkbox.checked) problems.push("Please confirm: Yes, send me updates…");

    if (problems.length) {
      e.preventDefault();
      setError(alerts, problems.join("<br>"));
      return;
    }

    // loading state
    if (submitBtn) {
      submitBtn.classList.add("hsfc-Button--loading");
      submitBtn.setAttribute("aria-busy", "true");
      submitBtn.disabled = true;
    }

    submitted = true;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const formRoot = document.getElementById("hs_form_target_form_725511019-r") || document;

  setupCityDropdown(formRoot);
  setupPhoneDropdown(formRoot);
  setupCheckboxSync(formRoot);
  setupSubmitFlow(formRoot);
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