(() => {
  // ---------- Dropdown: City ----------
  const display = document.getElementById('hs_city_display');
  const hidden = document.getElementById('hs_city_value');
  const optionsBox = document.getElementById('hs_city_options');
  const caret = document.querySelector('#hs_city_wrap .hsfc-DropdownInput__Caret');
  const search = document.getElementById('hs_city_search');
  const listbox = document.getElementById('hs_city_listbox');

  function openCity() {
    optionsBox.style.display = 'flex';
    display.setAttribute('aria-expanded', 'true');
    // focus search for better UX
    setTimeout(() => search?.focus(), 0);
  }
  function closeCity() {
    optionsBox.style.display = 'none';
    display.setAttribute('aria-expanded', 'false');
    search.value = '';
    filterCity('');
  }
  function filterCity(q) {
    q = (q || '').toLowerCase().trim();
    [...listbox.querySelectorAll('li')].forEach(li => {
      li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }

  display.addEventListener('click', () => {
    const isOpen = optionsBox.style.display !== 'none';
    isOpen ? closeCity() : openCity();
  });
  caret?.addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = optionsBox.style.display !== 'none';
    isOpen ? closeCity() : openCity();
  });

  search?.addEventListener('input', (e) => filterCity(e.target.value));

  listbox.addEventListener('click', (e) => {
    const li = e.target.closest('li[role="option"]');
    if (!li) return;
    const value = li.textContent.trim();
    display.value = value;
    hidden.value = value;
    closeCity();
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('hs_city_wrap').contains(e.target)) closeCity();
  });

  // ---------- Submission to HubSpot ----------
  const form = document.getElementById('hs_form_target_form_725511019-a8e00675-911e-492c-807c-4e00fdfff76a');
  const submitBtn = document.getElementById('hs_submit_btn');

  // Messages
  const okBox = document.getElementById('hs_success_message');
  const errBox = document.getElementById('hs_error_message');

  // Field refs
  const firstName = document.getElementById('hs_firstname');
  const lastName  = document.getElementById('hs_lastname');
  const phoneDisp = document.getElementById('hs_phone_display');
  const phoneVal  = document.getElementById('hs_phone_value');
  const email     = document.getElementById('hs_email');
  const consent   = document.getElementById('hs_consent');

  // Inline errors
  const eFirst = document.getElementById('hs_err_firstname');
  const eCity  = document.getElementById('hs_err_city');
  const ePhone = document.getElementById('hs_err_phone');
  const eEmail = document.getElementById('hs_err_email');
  const eCons  = document.getElementById('hs_err_consent');

  function show(el, msg) {
    if (!el) return;
    if (msg) el.textContent = msg;
    el.style.display = 'block';
  }
  function hide(el) {
    if (!el) return;
    el.style.display = 'none';
  }

  function normalizePhone(v) {
    // keep + and digits only
    v = (v || '').trim();
    v = v.replace(/[^\d+]/g, '');
    // if user deletes +63, try to help
    if (v && v[0] !== '+') v = '+' + v;
    return v;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
  }

  function validate() {
    let ok = true;
    hide(errBox);
    [eFirst, eCity, ePhone, eEmail, eCons].forEach(hide);

    if (!firstName.value.trim()) { show(eFirst); ok = false; }
    if (!hidden.value.trim())    { show(eCity);  ok = false; }

    const p = normalizePhone(phoneDisp.value);
    phoneVal.value = p;
    if (!p || p.length < 4) { show(ePhone); ok = false; }

    if (!validEmail(email.value)) { show(eEmail, "Email must be formatted correctly."); ok = false; }

    if (!consent.checked) { show(eCons); ok = false; }

    return ok;
  }

  async function submitToHubSpot(payload) {
    // Using Forms API endpoint (JSON)
    const portalId = "243726556";
    const formId   = "a8e00675-911e-492c-807c-4e00fdfff76a";
    const endpoint = `https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // HubSpot returns 200/204 on success; errors are JSON
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (_) {}
      const msg = data?.message || "There was an issue submitting your form. Please try again.";
      throw new Error(msg);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(okBox); hide(errBox);

    if (!validate()) {
      show(errBox, "Please complete all required fields.");
      return;
    }

    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.classList.add('hsfc-Button--loading');

    const payload = {
      fields: [
        { name: "firstname", value: firstName.value.trim() },
        { name: "lastname", value: lastName.value.trim() },
        { name: "location_", value: hidden.value.trim() },
        { name: "phone", value: phoneVal.value.trim() },
        { name: "email", value: email.value.trim() },
        { name: "confirmation_checkbox", value: "true" },
      ],
      context: {
        pageUri: window.location.href,
        pageName: document.title,
      }
    };

    try {
      await submitToHubSpot(payload);
      show(okBox, "You're officially on our wellness list. Thanks — we’ll send calm updates, 1–2x/month.");
      form.reset();
      // restore phone default
      phoneDisp.value = "+63";
      phoneVal.value = "";
      display.value = "";
      hidden.value = "";
    } catch (err) {
      show(errBox, err.message || "There was an issue submitting your form. Please try again.");
    } finally {
      submitBtn.setAttribute('aria-busy', 'false');
      submitBtn.classList.remove('hsfc-Button--loading');
    }
  });

})();


  (function () {
    function initNewsletterCheckboxFix() {
      var cb = document.getElementById("hs_form_target_form_725511019-2228651451587-input");
      if (!cb) return;

      function syncValue() {
        // HubSpot sometimes uses boolean checkbox fields; keep it explicit.
        cb.value = cb.checked ? "true" : "false";
      }

      cb.addEventListener("change", syncValue);
      syncValue();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initNewsletterCheckboxFix);
    } else {
      initNewsletterCheckboxFix();
    }
  })();



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