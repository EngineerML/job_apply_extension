// Scrapes job data from the current page.
// Tries common selectors used by LinkedIn, Indeed, and generic pages.

function scrapeJobData() {
  const get = (selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return "";
  };

  const title = get([
    "h1.job-title",
    "h1.jobsearch-JobInfoHeader-title",
    ".job-details-jobs-unified-top-card__job-title h1",
    "h1",
  ]);

  const company = get([
    ".job-details-jobs-unified-top-card__company-name",
    ".jobsearch-InlineCompanyRating-companyName",
    "[data-company-name]",
    ".company-name",
  ]);

  const description = get([
    "#job-details",
    ".jobsearch-jobDescriptionText",
    ".jobs-description__content",
    ".job-description",
    "article",
  ]);

  return {
    title,
    company,
    description: description.slice(0, 3000), // cap to avoid huge payloads
    url: window.location.href,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCRAPE_JOB") {
    sendResponse(scrapeJobData());
  }
});
