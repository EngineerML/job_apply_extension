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

  // Title
  const title = get([
    // LinkedIn
    ".job-details-jobs-unified-top-card__job-title h1",
    ".jobs-unified-top-card__job-title h1",
    ".t-24.t-bold",
    // Indeed
    "h1.jobsearch-JobInfoHeader-title",
    "[data-testid='jobsearch-JobInfoHeader-title']",
    // Glassdoor
    "[data-test='job-title']",
    // Generic
    "h1.job-title",
    "h1[class*='title']",
    "h1[class*='job']",
    "h1",
  ]);

  // Company
  const company = get([
    // LinkedIn
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name a",
    // Indeed
    "[data-testid='inlineHeader-companyName'] a",
    ".jobsearch-InlineCompanyRating-companyName",
    // Glassdoor
    "[data-test='employer-name']",
    // Generic
    "[class*='company-name']",
    "[class*='companyName']",
    "[data-company-name]",
  ]);

  // Description — try known selectors first, then fall back to largest text block
  const description = get([
    // LinkedIn
    "#job-details",
    ".jobs-description__content .jobs-box__html-content",
    ".jobs-description-content__text",
    // Indeed
    "#jobDescriptionText",
    ".jobsearch-jobDescriptionText",
    "[data-testid='jobsearch-jobDescriptionText']",
    // Glassdoor
    "[data-test='description']",
    ".jobDescriptionContent",
    // Generic
    "[class*='job-description']",
    "[class*='jobDescription']",
    "[id*='job-description']",
    "[id*='jobDescription']",
    "article",
    "[role='main']",
  ]);

  // Smart fallback: find the element with the most text on the page
  if (!description) {
    const candidates = document.querySelectorAll("div, section, article");
    let best = { el: null, len: 0 };
    candidates.forEach((el) => {
      const len = el.innerText?.trim().length || 0;
      if (len > best.len && len < 20000) best = { el, len };
    });
    if (best.el) {
      return {
        title,
        company,
        description: best.el.innerText.trim().slice(0, 4000),
        url: window.location.href,
      };
    }
  }

  return {
    title,
    company,
    description: description.slice(0, 4000),
    url: window.location.href,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_JOB") {
    sendResponse(scrapeJobData());
  }
});
