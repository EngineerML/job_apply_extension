let jobData = null;

const elTitle    = document.getElementById("job-title");
const elCompany  = document.getElementById("job-company");
const elTextarea = document.getElementById("cover-letter");
const btnGen     = document.getElementById("btn-generate");
const btnSave    = document.getElementById("btn-save");
const btnDl      = document.getElementById("btn-download");
const elStatus   = document.getElementById("status");

function setStatus(msg, isError = false) {
  elStatus.textContent = msg;
  elStatus.className = isError ? "error" : "";
}

// On popup open, scrape the active tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_JOB" }, (data) => {
    if (chrome.runtime.lastError || !data) {
      setStatus("Could not scrape page.", true);
      return;
    }
    jobData = data;
    elTitle.textContent   = data.title   || "Not found";
    elCompany.textContent = data.company || "Not found";
  });
});

// Generate
btnGen.addEventListener("click", () => {
  if (!jobData) return setStatus("No job data found.", true);

  btnGen.disabled = true;
  setStatus("Generating…");

  chrome.runtime.sendMessage(
    {
      type: "GENERATE",
      payload: {
        job_title:       jobData.title,
        company:         jobData.company,
        job_description: jobData.description,
      },
    },
    (res) => {
      btnGen.disabled = false;
      if (!res.ok) return setStatus(res.error, true);

      elTextarea.value = res.data.cover_letter;
      btnSave.disabled = false;
      btnDl.disabled   = false;
      setStatus("Done! Edit as needed.");
    }
  );
});

// Save
btnSave.addEventListener("click", () => {
  const content = elTextarea.value.trim();
  if (!content) return setStatus("Nothing to save.", true);

  btnSave.disabled = true;
  setStatus("Saving…");

  chrome.runtime.sendMessage(
    {
      type: "SAVE",
      payload: {
        job_title:       jobData.title,
        company:         jobData.company,
        job_description: jobData.description,
        job_url:         jobData.url,
        cover_letter:    content,
      },
    },
    (res) => {
      btnSave.disabled = false;
      if (!res.ok) return setStatus(res.error, true);
      setStatus("Saved ✓");
    }
  );
});

// Download
btnDl.addEventListener("click", () => {
  const content = elTextarea.value.trim();
  if (!content) return;

  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const name = `cover-letter-${(jobData?.company || "job").replace(/\s+/g, "-").toLowerCase()}.txt`;

  a.href     = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
});
