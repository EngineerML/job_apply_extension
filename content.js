function scrapeJobData() {
  const get = (selectors) => {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim()) return el.innerText.trim();
      } catch (_) {}
    }
    return "";
  };

  let title = get([
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title h1",
    ".t-24.t-bold",
    "h1.jobsearch-JobInfoHeader-title",
    "[data-testid='jobsearch-JobInfoHeader-title']",
    "[data-test='job-title']",
    "h1.job-title",
    "h1[class*='title']",
    "h1[class*='job']",
    "h1",
  ]);

  let company = get([
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    "[data-testid='inlineHeader-companyName'] a",
    ".jobsearch-InlineCompanyRating-companyName",
    "[data-test='employer-name']",
    "[class*='company-name']",
    "[class*='companyName']",
    "[data-company-name]",
  ]);

  let description = get([
    "#job-details",
    ".jobs-description__content .jobs-box__html-content",
    ".jobs-description-content__text",
    "#jobDescriptionText",
    ".jobsearch-jobDescriptionText",
    "[data-testid='jobsearch-jobDescriptionText']",
    "[data-test='description']",
    ".jobDescriptionContent",
    "[class*='job-description']",
    "[class*='jobDescription']",
    "[id*='job-description']",
    "[id*='jobDescription']",
    "article",
    "[role='main']",
  ]);

  if (!description) {
    const candidates = document.querySelectorAll("div, section, article");
    let best = { el: null, len: 0 };
    candidates.forEach((el) => {
      const len = el.innerText?.trim().length || 0;
      if (len > best.len && len < 20000) best = { el, len };
    });
    if (best.el) description = best.el.innerText.trim();
  }

  return {
    title: title || "",
    company: company || "",
    description: (description || "").slice(0, 4000),
    url: window.location.href,
  };
}

// Respond to manual scrape requests from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_JOB") {
    sendResponse(scrapeJobData());
  }
});

// Dynamic detection: watch for URL changes and DOM mutations
let lastUrl = location.href;
let debounceTimer = null;

function notifyIfChanged() {
  const data = scrapeJobData();
  // Only notify if something meaningful actually changed
  if (data.title || data.description) {
    try {
      chrome.runtime.sendMessage({ type: "JOB_UPDATED", data });
    } catch (err) {
      console.log("[Scraper] Could not send message (extension context may be invalidated)");
    }
  }
}

function scheduleNotify() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(notifyIfChanged, 800);
}

// Watch for URL changes (SPA navigation — LinkedIn, Indeed use this)
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scheduleNotify();
  }
});

urlObserver.observe(document.body, { childList: true, subtree: true });

// Also watch for significant content changes in the main area
const contentObserver = new MutationObserver((mutations) => {
  const significant = mutations.some(
    (m) => m.addedNodes.length > 2 || m.removedNodes.length > 2
  );
  if (significant) scheduleNotify();
});

contentObserver.observe(document.body, { childList: true, subtree: true });
