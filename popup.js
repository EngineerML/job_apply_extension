const API_BASE = "http://localhost:8000";

// ── DOM refs ──────────────────────────────────────────
const views = {
  welcome:     document.getElementById("view-welcome"),
  setup:       document.getElementById("view-setup"),
  scan:        document.getElementById("view-scan"),
  pinned:      document.getElementById("view-pinned"),
  coverLetter: document.getElementById("view-cover-letter"),
  specialQ:    document.getElementById("view-special-q"),
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
let scannedJob      = null;
let pinnedJob       = null;
let coverLetter     = "";
let specialQList    = [];  // [{ prompt, answer }]
let currentUsername = "";

// ── Helpers ───────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach((v) => v && v.classList.remove("active"));
  if (views[name]) views[name].classList.add("active");
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
          scanTitle.value   = data.title   || "";
          scanCompany.value = data.company || "";
          scanRowDesc.style.display = data.description ? "block" : "none";
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

// Enable pin button when user types manually
[scanTitle, scanCompany].forEach((el) => {
  el.addEventListener("input", () => {
    btnPin.disabled = !scanTitle.value.trim() && !scanCompany.value.trim();
  });
});

// ── Pin ───────────────────────────────────────────────
btnPin.addEventListener("click", () => {
  // Allow pinning even if nothing was auto-detected (manual entry)
  if (!scannedJob) scannedJob = { title: "", company: "", description: "", url: window?.location?.href || "" };
  scannedJob.title   = scanTitle.value.trim()   || scannedJob.title;
  scannedJob.company = scanCompany.value.trim() || scannedJob.company;
  pinnedJob = scannedJob;
  savePin(pinnedJob);
  coverLetter = "";
  specialQList = [];
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

    if (specialQList.length) {
      await apiFetch("/save-special-qa", {
        method: "POST",
        body: JSON.stringify({ job_id, items: specialQList }),
      });
    }

    clearPin();
    pinnedJob    = null;
    coverLetter  = "";
    specialQList = [];
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

// ── Special Questions view ────────────────────────────────
function renderSQList() {
  const sqList   = document.getElementById("sq-list");
  const statusSQ = document.getElementById("status-sq");
  if (!sqList) return;
  sqList.innerHTML = "";
  specialQList.forEach((item, i) => {
    const block = document.createElement("div");
    block.className = "sq-block";
    block.innerHTML = `
      <div class="sq-block-header">
        <span class="sq-num">Q${i + 1}</span>
        <button class="sq-remove" data-i="${i}">×</button>
      </div>
      <textarea class="sq-prompt" data-i="${i}" placeholder="e.g. Explain your recent experience in Java…">${item.prompt}</textarea>
      <button class="btn-primary sq-generate" data-i="${i}">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Generate Answer
      </button>
      <textarea class="sq-answer" data-i="${i}" placeholder="Answer will appear here…">${item.answer}</textarea>
    `;
    sqList.appendChild(block);
  });

  // Sync prompt edits
  sqList.querySelectorAll(".sq-prompt").forEach((el) => {
    el.addEventListener("input", () => {
      specialQList[+el.dataset.i].prompt = el.value;
    });
  });

  // Sync answer edits
  sqList.querySelectorAll(".sq-answer").forEach((el) => {
    el.addEventListener("input", () => {
      specialQList[+el.dataset.i].answer = el.value;
    });
  });

  // Remove
  sqList.querySelectorAll(".sq-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      specialQList.splice(+btn.dataset.i, 1);
      renderSQList();
    });
  });

  // Generate
  sqList.querySelectorAll(".sq-generate").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const i = +btn.dataset.i;
      const prompt = specialQList[i].prompt.trim();
      if (!prompt) return setStatus(statusSQ, "Enter a question first.", "error");
      btn.disabled = true;
      setStatus(statusSQ, "Generating...");
      try {
        const data = await apiFetch("/generate-answer", {
          method: "POST",
          body: JSON.stringify({
            job_title:       prompt,
            company:         pinnedJob.company,
            job_description: pinnedJob.description,
          }),
        });
        specialQList[i].answer = data.answer;
        renderSQList();
        setStatus(document.getElementById("status-sq"), "Done!", "success");
      } catch (err) {
        setStatus(document.getElementById("status-sq"), err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

document.getElementById("btn-go-special-q").addEventListener("click", () => {
  const statusSQ = document.getElementById("status-sq");
  if (statusSQ) setStatus(statusSQ, "");
  if (specialQList.length === 0) specialQList.push({ prompt: "", answer: "" });
  renderSQList();
  showView("specialQ");
});

document.getElementById("btn-sq-back").addEventListener("click", () => showView("pinned"));

document.getElementById("btn-sq-add").addEventListener("click", () => {
  specialQList.push({ prompt: "", answer: "" });
  renderSQList();
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
  scanTitle.value   = data.title   || "";
  scanCompany.value = data.company || "";
  scanRowDesc.style.display = data.description ? "block" : "none";
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
    const data = await apiFetch("/save-user", {
      method: "POST",
      body: JSON.stringify({ name, base_resume_text: resume }),
    });
    currentUsername = data.name;
    setHeaderUser(data.name);
    welcomeUserName.textContent = data.name;
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
