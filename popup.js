const API_BASE = "http://localhost:8000";

// ── DOM refs ──────────────────────────────────────────────
const views = {
  setup:       document.getElementById("view-setup"),
  main:        document.getElementById("view-main"),
  coverLetter: document.getElementById("view-cover-letter"),
};

const headerUser      = document.getElementById("header-user");
const headerUserName  = document.getElementById("header-user-name");

function setHeaderUser(name) {
  headerUserName.textContent = name;
  headerUser.style.display   = "flex";
}
const inputName   = document.getElementById("input-name");
const inputResume = document.getElementById("resume-input");
const btnSaveUser = document.getElementById("btn-save-user");
const statusSetup = document.getElementById("status-setup");

const elTitle     = document.getElementById("job-title");
const elCompany   = document.getElementById("job-company");
const elTextarea  = document.getElementById("cover-letter");
const btnGenerate   = document.getElementById("btn-generate");
const btnSaveCL     = document.getElementById("btn-save-cl");
const btnDownload   = document.getElementById("btn-download");
const btnDownloadPdf = document.getElementById("btn-download-pdf");
const statusCL      = document.getElementById("status-cl");
const btnBack       = document.getElementById("btn-back");

let jobData = null;
let currentUsername = "";

// ── Helpers ───────────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
}

function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = `status ${type}`;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

// ── Init: check if user exists ────────────────────────────
apiFetch("/user")
  .then((data) => {
    if (data.exists) {
      setHeaderUser(data.name);
      currentUsername = data.name;
    } else {
      showView("setup");
    }
  })
  .catch(() => showView("setup"));

// ── Setup: save user ──────────────────────────────────────
btnSaveUser.addEventListener("click", async () => {
  const name   = inputName.value.trim();
  const resume = inputResume.value.trim();

  if (!name)   return setStatus(statusSetup, "Please enter your name.", "error");
  if (!resume) return setStatus(statusSetup, "Please paste your resume.", "error");

  btnSaveUser.disabled = true;
  setStatus(statusSetup, "Saving…");

  try {
    const data = await apiFetch("/save-user", {
      method: "POST",
      body: JSON.stringify({ name, base_resume_text: resume }),
    });
      setHeaderUser(data.name);
      currentUsername = data.name;
      showView("main");
  } catch (err) {
    setStatus(statusSetup, err.message, "error");
  } finally {
    btnSaveUser.disabled = false;
  }
});

// ── Edit profile ─────────────────────────────────────────
document.getElementById("btn-edit-profile").addEventListener("click", async () => {
  try {
    const data = await apiFetch("/user/full");
    inputName.value   = data.name || "";
    inputResume.value = data.base_resume_text || "";
  } catch {
    inputName.value   = "";
    inputResume.value = "";
  }
  setStatus(statusSetup, "");
  showView("setup");
});

// ── Nav: cover letter card ────────────────────────────────
document.getElementById("nav-cover-letter").addEventListener("click", () => {
  showView("coverLetter");

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_JOB" }, (data) => {
      if (chrome.runtime.lastError || !data) {
        setStatus(statusCL, "Could not scrape page.", "error");
        return;
      }
      jobData = data;
      elTitle.textContent   = data.title   || "Not found";
      elCompany.textContent = data.company || "Not found";
    });
  });
});

// ── Back ──────────────────────────────────────────────────
btnBack.addEventListener("click", () => showView("main"));

// ── Generate cover letter ─────────────────────────────────
btnGenerate.addEventListener("click", async () => {
  if (!jobData) return setStatus(statusCL, "No job data found.", "error");

  btnGenerate.disabled = true;
  setStatus(statusCL, "Generating…");

  try {
    const data = await apiFetch("/generate-cover-letter", {
      method: "POST",
      body: JSON.stringify({
        job_title:       jobData.title,
        company:         jobData.company,
        job_description: jobData.description,
      }),
    });
    elTextarea.value        = data.cover_letter;
    btnSaveCL.disabled      = false;
    btnDownload.disabled    = false;
    btnDownloadPdf.disabled = false;
    setStatus(statusCL, "Done! Edit as needed.", "success");
  } catch (err) {
    setStatus(statusCL, err.message, "error");
  } finally {
    btnGenerate.disabled = false;
  }
});

// ── Save cover letter ─────────────────────────────────────
btnSaveCL.addEventListener("click", async () => {
  const content = elTextarea.value.trim();
  if (!content) return setStatus(statusCL, "Nothing to save.", "error");

  btnSaveCL.disabled = true;
  setStatus(statusCL, "Saving…");

  try {
    await apiFetch("/save-cover-letter", {
      method: "POST",
      body: JSON.stringify({
        job_title:       jobData.title,
        company:         jobData.company,
        job_description: jobData.description,
        job_url:         jobData.url,
        cover_letter:    content,
      }),
    });
    setStatus(statusCL, "Saved ✓", "success");
  } catch (err) {
    setStatus(statusCL, err.message, "error");
  } finally {
    btnSaveCL.disabled = false;
  }
});

// ── Download .txt ─────────────────────────────────────────
btnDownload.addEventListener("click", () => {
  const content = elTextarea.value.trim();
  if (!content) return;

  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `cover-letter-${(jobData?.company || "job").replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Download PDF ──────────────────────────────────────────
btnDownloadPdf.addEventListener("click", async () => {
  const content = elTextarea.value.trim();
  if (!content) return;

  btnDownloadPdf.disabled = true;
  setStatus(statusCL, "Generating PDF…");

  try {
    const res = await fetch(`${API_BASE}/download-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        username:  currentUsername,
        job_title: jobData?.title || "job",
      }),
    });
    if (!res.ok) throw new Error("PDF generation failed");

    const blob     = await res.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    const filename = `${currentUsername}_${jobData?.title || "job"}_coverletter.pdf`.replace(/\s+/g, "_");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(statusCL, "PDF downloaded ✓", "success");
  } catch (err) {
    setStatus(statusCL, err.message, "error");
  } finally {
    btnDownloadPdf.disabled = false;
  }
});
