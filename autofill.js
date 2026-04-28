// autofill.js — injected on demand, never runs automatically

(function () {

  // ── Keyword map: profile key → signals to match against ──
  const FIELD_MAP = [
    { key: "first_name",     signals: ["first name", "firstname", "first-name", "fname", "given name"] },
    { key: "last_name",      signals: ["last name", "lastname", "last-name", "lname", "surname", "family name"] },
    { key: "email",          signals: ["email", "e-mail", "emailaddress"] },
    { key: "phone",          signals: ["phone", "mobile", "cell", "telephone", "tel"] },
    { key: "street",         signals: ["street", "address1", "address 1", "addr1", "street address"] },
    { key: "city",           signals: ["city", "town", "locality"] },
    { key: "state",          signals: ["state", "province", "region"] },
    { key: "country",        signals: ["country", "nation"] },
    { key: "zip",            signals: ["zip", "postal", "postcode", "zip code", "postal code"] },
    { key: "desired_salary", signals: ["salary", "compensation", "pay", "wage", "desired salary", "expected salary"] },
    { key: "race",           signals: ["race", "ethnicity", "ethnic"] },
    { key: "veteran",        signals: ["veteran", "military", "service member"] },
    { key: "disability",     signals: ["disability", "disabled", "accommodation"] },
  ];

  // ── Collect all signals from a form element ───────────
  function getSignals(el) {
    const parts = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("data-field"),
      el.getAttribute("data-label"),
    ];

    // Associated <label> text
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl) parts.push(lbl.innerText);
    }
    // Wrapping label
    const parentLabel = el.closest("label");
    if (parentLabel) parts.push(parentLabel.innerText);

    // Nearest preceding label/div text (common in custom UIs)
    let prev = el.previousElementSibling;
    if (prev) parts.push(prev.innerText || prev.textContent);

    return parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[_\-*]/g, " ");
  }

  // ── Match signals to a profile key ───────────────────
  function matchKey(el) {
    const signals = getSignals(el);
    for (const { key, signals: keywords } of FIELD_MAP) {
      if (keywords.some((kw) => signals.includes(kw))) return key;
    }
    return null;
  }

  // ── Dispatch native events so React/Vue/Angular pick up the change ──
  function nativeSet(el, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    )?.set;
    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, "value"
    )?.set;

    if (el.tagName === "TEXTAREA" && nativeTextareaSetter) {
      nativeTextareaSetter.call(el, value);
    } else if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── Fill a <select> by fuzzy-matching option text ────
  function fillSelect(el, value) {
    if (!value) return false;
    const v = value.toLowerCase();
    for (const opt of el.options) {
      const t = opt.text.toLowerCase();
      const ov = opt.value.toLowerCase();
      if (t === v || ov === v || t.includes(v) || v.includes(t)) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ── Fill a radio group by fuzzy-matching label text ──
  function fillRadio(radios, value) {
    if (!value) return false;
    const v = value.toLowerCase();
    for (const radio of radios) {
      const signals = getSignals(radio);
      // also check the radio's own value attribute
      const rv = (radio.value || "").toLowerCase();
      if (signals.includes(v) || rv === v || rv.includes(v) || v.includes(rv)) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // ── Skip fields the site has already filled or autocompleted ──
  function alreadyFilled(el) {
    if (el.tagName === "SELECT") return el.value && el.value !== "";
    return el.value && el.value.trim() !== "";
  }

  // ── Main autofill ─────────────────────────────────────
  function autofill(profile) {
    let filled = 0;
    const handledRadioNames = new Set();

    const elements = document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file]):not([type=checkbox]), select, textarea"
    );

    for (const el of elements) {
      // Skip hidden, disabled, readonly
      if (el.disabled || el.readOnly) continue;
      if (el.offsetParent === null) continue; // not visible

      // Skip if site already filled it (avoid collision)
      if (alreadyFilled(el)) continue;

      // Handle radio groups separately
      if (el.type === "radio") {
        const name = el.name;
        if (!name || handledRadioNames.has(name)) continue;
        handledRadioNames.add(name);
        const group = document.querySelectorAll(`input[type=radio][name="${name}"]`);
        const key = matchKey(el) || matchKey(group[0]);
        if (key && profile[key]) {
          if (fillRadio(group, profile[key])) filled++;
        }
        continue;
      }

      const key = matchKey(el);
      if (!key || !profile[key]) continue;

      if (el.tagName === "SELECT") {
        if (fillSelect(el, profile[key])) filled++;
      } else {
        nativeSet(el, profile[key]);
        filled++;
      }
    }

    return filled;
  }

  // ── Listen for trigger message ────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "AUTOFILL") return;
    const count = autofill(message.profile);
    sendResponse({ filled: count });
  });

})();
