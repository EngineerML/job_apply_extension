const API_BASE = "http://localhost:8000";

// ── DOM refs ──────────────────────────────────────────
const views = {
  welcome:     document.getElementById("view-welcome"),
  setup:       document.getElementById("view-setup"),
  scan:        document.getElementById("view-scan"),
  pinned:      document.getElementById("view-pinned"),
  coverLetter: document.getElementById("view-cover-letter"),
};

const headerUser     = document.getElementById("header-user");
const headerUserName = document.getElementById("header-user-name");

// Welcome
const welcomeUserName = document.getElementById("welcome-user-name");
const btnContinueAs   = document.getElementById("btn-continue-as");
const btnUseDifferent = document.getElementById("btn-use-different");

// Setup
const inputName     = document.getElementById("input-name");
const inputResume   = document.getElementById("resume-input");
const btnSaveUser   = document.getElementById("btn-save-user");
const btnSetupBack  = document.getElementById("btn-setup-back");
const setupTitle    = document.getElementById("setup-title");
const setupSubtitle = document.getElementById("setup-subtitle");
const statusSetup   = document.getElementById("status-setup");

// Profile autofill fields
const inputFirstName  = document.getElementById("input-first-name");
const inputLastName   = document.getElementById("input-last-name");
const inputEmail      = document.getElementById("input-email");
const inputPhone      = document.getElementById("input-phone");
const inputStreet     = document.getElementById("input-street");
const inputCity       = document.getElementById("input-city");
const inputState      = document.getElementById("input-state");
const inputCountry    = document.getElementById("input-country");
const inputZip        = document.getElementById("input-zip");
const inputSalary     = document.getElementById("input-salary");
const inputRace       = document.getElementById("input-race");
const inputVeteran    = document.getElementById("input-veteran");
const inputDisability = document.getElementById("input-disability");

// Scan
const scanTitle      = document.getElementById("scan-title");
const scanCompany    = document.getElementById("scan-company");
const scanRowDesc    = document.getElementById("scan-row-desc");
const btnPin         = document.getElementById("btn-pin");
const statusScan     = document.getElementById("status-scan");

// Pinned
const pinnedTitle    = document.getElementById("pinned-title");
const pinnedCompany  = document.getElementById("pinned-company");
const pinnedRowDesc  = document.getElementById("pinned-row-desc");
const pinnedClPreview = document.getElementById("pinned-cl-preview");
const pinnedClText   = document.getElementById("pinned-cl-text");
const btnGoCoverLetter = document.getElementById("btn-go-cover-letter");
const btnAutofill    = document.getElementById("btn-autofill");
const btnComplete    = document.getElementById("btn-complete");
const statusPinned   = document.getElementById("status-pinned");

// Cover letter
const clTitle        = document.getElementById("cl-title");
const clCompany      = document.getElementById("cl-company");
const elTextarea     = document.getElementById("cover-letter");
const btnGenerate    = document.getElementById("btn-generate");
const btnDownload    = document.getElementById("btn-download");
const btnDownloadPdf = document.getElementById("btn-download-pdf");
const statusCL       = document.getElementById("status-cl");

// Modal
const modalDesc     = document.getElementById("modal-desc");
const modalDescText = document.getElementById("modal-desc-text");

// ── State ─────────────────────────────────────────────
let scannedJob    = null;   // job detected on current page (scan view)
let pinnedJob     = null;   // locked-in job (pinned view)
let coverLetter   = "";     // current cover letter text
let currentUsername = "";

// ── Helpers ───────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("active"));
  views[name].classList.add("active");
}

function setStatus(el, msg, type = "") {
  el.textContent = msg;
  el.className = `status ${type}`;
}

function setHeaderUser(name) {
  headerUserName.textContent = name;
  headerUser.style.display   = "flex";
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

function showDescModal(text) {
  modalDescText.textContent = text || "No description available.";
  modalDesc.style.display   = "flex";
}

// ── Persist pin across panel close/reopen ─────────────
function savePin(job) {
  chrome.storage.session.set({ pinnedJob: job });
}

function clearPin() {
  chrome.storage.session.remove("pinnedJob");
}

// ── Scrape current tab ────────────────────────────────
function scrapeCurrentTab() {
  setStatus(statusScan, "Detecting job...");
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
    if (!tab) { setStatus(statusScan, "Could not find active tab.", "error"); return; }
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ["content.js"] },
      () => {
        chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_JOB" }, (data) => {
          if (chrome.runtime.lastError || !data) {
            setStatus(statusScan, "Could not detect job. Try refreshing.", "error");
            return;
          }
          scannedJob = data;
          scanTitle.textContent   = data.title   || "Not found";
          scanCompany.textContent = data.company || "Not found";
          scanRowDesc.style.display = data.description ? "flex" : "none";
          if (data.title || data.company) {
            btnPin.disabled = false;
            setStatus(statusScan, "Job detected — pin it to start.", "success");
          } else {
            setStatus(statusScan, "No job detected on this page.", "");
          }
        });
      }
    );
  });
}

// ── Pin ───────────────────────────────────────────────
btnPin.addEventListener("click", () => {
  if (!scannedJob) return;
  pinnedJob = scannedJob;
  savePin(pinnedJob);
  coverLetter = "";
  loadPinnedView();
  showView("pinned");
});

function loadPinnedView() {
  pinnedTitle.textContent   = pinnedJob.title   || "—";
  pinnedCompany.textContent = pinnedJob.company || "—";
  pinnedRowDesc.style.display = pinnedJob.description ? "block" : "none";
  refreshClPreview();
  setStatus(statusPinned, "");
}

function refreshClPreview() {
  if (coverLetter) {
    pinnedClText.textContent    = coverLetter.slice(0, 120) + (coverLetter.length > 120 ? "…" : "");
    pinnedClPreview.style.display = "block";
  } else {
    pinnedClPreview.style.display = "none";
  }
}

// ── Complete ──────────────────────────────────────────
btnComplete.addEventListener("click", async () => {
  btnComplete.disabled = true;
  setStatus(statusPinned, "Saving...");

  try {
    const job_id = await apiFetch("/save-job", {
      method: "POST",
      body: JSON.stringify({
        job_title:       pinnedJob.title,
        company:         pinnedJob.company,
        job_description: pinnedJob.description,
        job_url:         pinnedJob.url,
      }),
    }).then(d => d.job_id);

    if (coverLetter) {
      await apiFetch("/save-cover-letter-by-id", {
        method: "POST",
        body: JSON.stringify({ job_id, cover_letter: coverLetter }),
      });
    }

    clearPin();
    pinnedJob   = null;
    coverLetter = "";
    setStatus(statusScan, "Application saved! Ready for next job.", "success");
    showView("scan");
    scrapeCurrentTab();
  } catch (err) {
    setStatus(statusPinned, err.message, "error");
  } finally {
    btnComplete.disabled = false;
  }
});

// ── Back from pinned view ─────────────────────────────
document.getElementById("btn-pinned-back").addEventListener("click", () => {
  clearPin();
  pinnedJob = null;
  coverLetter = "";
  setStatus(statusPinned, "");
  showView("scan");
  scrapeCurrentTab();
});

// ── Autofill ──────────────────────────────────────────
btnAutofill.addEventListener("click", async () => {
  btnAutofill.disabled = true;
  setStatus(statusPinned, "Filling form...");
  try {
    const profile = await apiFetch("/profile");
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
      if (!tab) { setStatus(statusPinned, "No active tab.", "error"); btnAutofill.disabled = false; return; }
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["autofill.js"] },
        () => {
          chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL", profile }, (res) => {
            btnAutofill.disabled = false;
            if (chrome.runtime.lastError || !res) {
              setStatus(statusPinned, "Autofill failed. Try refreshing.", "error");
              return;
            }
            setStatus(statusPinned, `Filled ${res.filled} field(s).`, res.filled > 0 ? "success" : "");
          });
        }
      );
    });
  } catch (err) {
    btnAutofill.disabled = false;
    setStatus(statusPinned, err.message, "error");
  }
});

// ── Cover letter view ─────────────────────────────────
btnGoCoverLetter.addEventListener("click", () => {
  clTitle.textContent   = pinnedJob.title   || "—";
  clCompany.textContent = pinnedJob.company || "—";
  elTextarea.value      = coverLetter;
  btnDownload.disabled    = !coverLetter;
  btnDownloadPdf.disabled = !coverLetter;
  setStatus(statusCL, "");
  showView("coverLetter");
});

btnGenerate.addEventListener("click", async () => {
  if (!pinnedJob) return;
  btnGenerate.disabled = true;
  setStatus(statusCL, "Generating...");
  try {
    const data = await apiFetch("/generate-cover-letter", {
      method: "POST",
      body: JSON.stringify({
        job_title:       pinnedJob.title,
        company:         pinnedJob.company,
        job_description: pinnedJob.description,
      }),
    });
    coverLetter             = data.cover_letter;
    elTextarea.value        = coverLetter;
    btnDownload.disabled    = false;
    btnDownloadPdf.disabled = false;
    setStatus(statusCL, "Done! Edit as needed.", "success");
  } catch (err) {
    setStatus(statusCL, err.message, "error");
  } finally {
    btnGenerate.disabled = false;
  }
});

// Keep coverLetter in sync if user edits the textarea
elTextarea.addEventListener("input", () => {
  coverLetter = elTextarea.value;
  btnDownload.disabled    = !coverLetter.trim();
  btnDownloadPdf.disabled = !coverLetter.trim();
});

// Back from cover letter → pinned
document.getElementById("btn-cl-back").addEventListener("click", () => {
  coverLetter = elTextarea.value.trim();
  refreshClPreview();
  showView("pinned");
});

// ── Downloads ─────────────────────────────────────────
btnDownload.addEventListener("click", () => {
  const content = elTextarea.value.trim();
  if (!content) return;
  const blob = new Blob([content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `cover-letter-${(pinnedJob?.company || "job").replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

btnDownloadPdf.addEventListener("click", () => {
  const content = elTextarea.value.trim();
  if (!content) return;

  const { jsPDF } = window.jspdf;
  const doc      = new jsPDF({ unit: "mm", format: "a4" });
  const margin   = 20;
  const maxWidth = 210 - margin * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(currentUsername, margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Cover Letter — ${pinnedJob?.title || "Job"}`, margin, margin + 7);

  let y = margin + 16;
  content.split("\n\n").forEach((para) => {
    const lines = doc.splitTextToSize(para.replace(/\n/g, " ").trim(), maxWidth);
    if (y + lines.length * 6 > 280) { doc.addPage(); y = margin; }
    doc.text(lines, margin, y);
    y += lines.length * 6 + 4;
  });

  const filename = `${currentUsername}_${pinnedJob?.title || "job"}_coverletter.pdf`.replace(/\s+/g, "_");
  doc.save(filename);
  setStatus(statusCL, "PDF downloaded!", "success");
});

// ── Description modal ─────────────────────────────────
document.getElementById("btn-scan-show-desc").addEventListener("click", () => {
  showDescModal(scannedJob?.description);
});

document.getElementById("btn-pinned-show-desc").addEventListener("click", () => {
  showDescModal(pinnedJob?.description);
});

document.getElementById("btn-close-modal").addEventListener("click", () => {
  modalDesc.style.display = "none";
});

modalDesc.addEventListener("click", (e) => {
  if (e.target === modalDesc) modalDesc.style.display = "none";
});

// ── JOB_UPDATED from content.js — only update scan view ──
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "JOB_UPDATED") return;
  if (pinnedJob) return; // ignore while pinned
  if (!views.scan.classList.contains("active")) return;

  const data = message.data;
  if (scannedJob && scannedJob.url === data.url && scannedJob.title === data.title) return;

  scannedJob = data;
  scanTitle.textContent   = data.title   || "Not found";
  scanCompany.textContent = data.company || "Not found";
  scanRowDesc.style.display = data.description ? "flex" : "none";
  btnPin.disabled = !(data.title || data.company);
  setStatus(statusScan, data.title ? "Job detected — pin it to start." : "", data.title ? "success" : "");
});

// ── Welcome ───────────────────────────────────────────
btnContinueAs.addEventListener("click", () => {
  showView("scan");
  scrapeCurrentTab();
});

btnUseDifferent.addEventListener("click", () => {
  inputName.value   = "";
  inputResume.value = "";
  setStatus(statusSetup, "");
  showView("setup");
});

// ── Setup ─────────────────────────────────────────────
btnSetupBack.addEventListener("click", () => showView("welcome"));

btnSaveUser.addEventListener("click", async () => {
  const name   = inputName.value.trim();
  const resume = inputResume.value.trim();
  if (!name)   return setStatus(statusSetup, "Please enter your name.", "error");
  if (!resume) return setStatus(statusSetup, "Please paste your resume.", "error");

  btnSaveUser.disabled = true;
  setStatus(statusSetup, "Saving...");
  try {
    const [userData] = await Promise.all([
      apiFetch("/save-user", {
        method: "POST",
        body: JSON.stringify({ name, base_resume_text: resume }),
      }),
      apiFetch("/profile", {
        method: "POST",
        body: JSON.stringify({
          first_name:     inputFirstName.value.trim()  || null,
          last_name:      inputLastName.value.trim()   || null,
          email:          inputEmail.value.trim()      || null,
          phone:          inputPhone.value.trim()      || null,
          street:         inputStreet.value.trim()     || null,
          city:           inputCity.value.trim()       || null,
          state:          inputState.value.trim()      || null,
          country:        inputCountry.value.trim()    || null,
          zip:            inputZip.value.trim()        || null,
          desired_salary: inputSalary.value.trim()     || null,
          race:           inputRace.value.trim()       || null,
          veteran:        inputVeteran.value.trim()    || null,
          disability:     inputDisability.value.trim() || null,
        }),
      }),
    ]);
    currentUsername = userData.name;
    setHeaderUser(userData.name);
    welcomeUserName.textContent = userData.name;
    showView("welcome");
  } catch (err) {
    setStatus(statusSetup, err.message, "error");
  } finally {
    btnSaveUser.disabled = false;
  }
});

document.getElementById("btn-view-jobs").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("btn-edit-profile").addEventListener("click", async () => {
  setupTitle.textContent    = "Edit Profile";
  setupSubtitle.textContent = "Update your name or resume below.";
  try {
    const [user, profile] = await Promise.all([apiFetch("/user/full"), apiFetch("/profile")]);
    inputName.value         = user.name || "";
    inputResume.value       = user.base_resume_text || "";
    inputFirstName.value    = profile.first_name    || "";
    inputLastName.value     = profile.last_name     || "";
    inputEmail.value        = profile.email         || "";
    inputPhone.value        = profile.phone         || "";
    inputStreet.value       = profile.street        || "";
    inputCity.value         = profile.city          || "";
    inputState.value        = profile.state         || "";
    inputCountry.value      = profile.country       || "";
    inputZip.value          = profile.zip           || "";
    inputSalary.value       = profile.desired_salary || "";
    inputRace.value         = profile.race          || "";
    inputVeteran.value      = profile.veteran       || "";
    inputDisability.value   = profile.disability    || "";
  } catch {
    inputName.value = "";
    inputResume.value = "";
  }
  setStatus(statusSetup, "");
  showView("setup");
});

// ── Init ──────────────────────────────────────────────
apiFetch("/user")
  .then((data) => {
    if (!data.exists) { showView("setup"); return; }
    currentUsername = data.name;
    setHeaderUser(data.name);

    welcomeUserName.textContent = data.name;

    // Restore pin if panel was closed mid-application
    chrome.storage.session.get("pinnedJob", ({ pinnedJob: saved }) => {
      if (saved) {
        pinnedJob = saved;
        loadPinnedView();
        showView("pinned");
      } else {
        showView("welcome");
      }
    });
  })
  .catch(() => showView("setup"));
