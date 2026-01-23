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