const API_BASE = "http://localhost:8000";

// DOM refs
const views = {
  welcome:     document.getElementById("view-welcome"),
  setup:       document.getElementById("view-setup"),
  main:        document.getElementById("view-main"),
  coverLetter: document.getElementById("view-cover-letter"),
};

const headerUser     = document.getElementById("header-user");
const headerUserName = document.getElementById("header-user-name");

const welcomeUserName = document.getElementById("welcome-user-name");
const btnContinueAs   = document.getElementById("btn-continue-as");
const btnUseDifferent = document.getElementById("btn-use-different");

const inputName   = document.getElementById("input-name");
const inputResume = document.getElementById("resume-input");
const btnSaveUser = document.getElementById("btn-save-user");
const btnSetupBack = document.getElementById("btn-setup-back");
const setupTitle   = document.getElementById("setup-title");
const setupSubtitle = document.getElementById("setup-subtitle");
const statusSetup  = document.getElementById("status-setup");

const elTitle        = document.getElementById("job-title");
const elCompany      = document.getElementById("job-company");
const elTextarea     = document.getElementById("cover-letter");
const btnGenerate    = document.getElementById("btn-generate");
const btnSaveCL      = document.getElementById("btn-save-cl");
const btnDownload    = document.getElementById("btn-download");
const btnDownloadPdf = document.getElementById("btn-download-pdf");
const statusCL       = document.getElementById("status-cl");
const btnBack        = document.getElementById("btn-back");

const rowShowDesc   = document.getElementById("row-show-desc");
const btnShowDesc   = document.getElementById("btn-show-desc");
const modalDesc     = document.getElementById("modal-desc");
const modalDescText = document.getElementById("modal-desc-text");
const btnCloseModal = document.getElementById("btn-close-modal");

let jobData         = null;
let currentUsername = "";
let setupReturnView = "welcome";

async function checkExistingJob() {
  if (!jobData?.url) return;
  try {
    const data = await apiFetch("/check-job", {
      method: "POST",
      body: JSON.stringify({ job_url: jobData.url }),
    });
    if (data.found && data.cover_letter) {
      elTextarea.value        = data.cover_letter;
      btnSaveCL.disabled      = true;
      btnDownload.disabled    = false;
      btnDownloadPdf.disabled = false;
      setStatus(statusCL, "Previously saved cover letter loaded.", "success");
    }
  } catch {
    // silently ignore — user can still generate manually
  }
}

// Helpers
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

// Fix for side panel: inject scraper directly via scripting API
// instead of messaging content script (which may not be injected yet)
function scrapeCurrentTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
    if (!tab) {
      setStatus(statusCL, "Could not find active tab.", "error");
      return;
    }
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ["content.js"] },
      () => {
        chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_JOB" }, (data) => {
          if (chrome.runtime.lastError || !data) {
            setStatus(statusCL, "Could not scrape page. Try refreshing the tab.", "error");
            return;
          }
          jobData = data;
          elTitle.textContent   = data.title   || "Not found";
          elCompany.textContent = data.company || "Not found";
          rowShowDesc.style.display = data.description ? "flex" : "none";
          setStatus(statusCL, "Job data detected.", "success");
          checkExistingJob();
        });
      }
    );
  });
}

// Listen for dynamic job updates pushed from content.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "JOB_UPDATED") return;
  const data = message.data;
  // Only update if cover letter view is active and data is different
  if (!views.coverLetter.classList.contains("active")) return;
  if (jobData && jobData.url === data.url && jobData.title === data.title) return;

  jobData = data;
  elTitle.textContent   = data.title   || "Not found";
  elCompany.textContent = data.company || "Not found";
  rowShowDesc.style.display = data.description ? "flex" : "none";
  setStatus(statusCL, "Job updated — ready to generate.", "success");

  // Reset cover letter area for the new job
  elTextarea.value     = "";
  btnSaveCL.disabled   = true;
  btnDownload.disabled = true;
  btnDownloadPdf.disabled = true;
  checkExistingJob();
});

// Init: check if user exists
apiFetch("/user")
  .then((data) => {
    if (data.exists) {
      currentUsername = data.name;
      setHeaderUser(data.name);
      welcomeUserName.textContent = data.name;
      showView("welcome");
    } else {
      setupReturnView = "welcome";
      showView("setup");
    }
  })
  .catch(() => {
    setupReturnView = "welcome";
    showView("setup");
  });

// Welcome: continue
btnContinueAs.addEventListener("click", () => showView("main"));

// Welcome: use different account
btnUseDifferent.addEventListener("click", () => {
  setupReturnView           = "welcome";
  setupTitle.textContent    = "Set up your profile";
  setupSubtitle.textContent = "Enter your name and resume to get started.";
  inputName.value   = "";
  inputResume.value = "";
  setStatus(statusSetup, "");
  showView("setup");
});

// Setup: back button — returns to wherever we came from
btnSetupBack.addEventListener("click", () => showView(setupReturnView));

// Setup: save user
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
    showView("main");
  } catch (err) {
    setStatus(statusSetup, err.message, "error");
  } finally {
    btnSaveUser.disabled = false;
  }
});

// Main: view jobs dashboard
document.getElementById("btn-view-jobs").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// Main: edit profile
document.getElementById("btn-edit-profile").addEventListener("click", async () => {
  setupReturnView           = "main";
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

// Nav: cover letter card
document.getElementById("nav-cover-letter").addEventListener("click", () => {
  showView("coverLetter");
  scrapeCurrentTab();
});

// Cover letter: back
btnBack.addEventListener("click", () => showView("main"));

// Job description modal
btnShowDesc.addEventListener("click", () => {
  modalDescText.textContent = jobData?.description || "No description available.";
  modalDesc.style.display   = "flex";
});

btnCloseModal.addEventListener("click", () => {
  modalDesc.style.display = "none";
});

modalDesc.addEventListener("click", (e) => {
  if (e.target === modalDesc) modalDesc.style.display = "none";
});

// Generate cover letter
btnGenerate.addEventListener("click", async () => {
  if (!jobData) return setStatus(statusCL, "No job data found.", "error");

  btnGenerate.disabled = true;
  setStatus(statusCL, "Generating...");

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

// Save cover letter
btnSaveCL.addEventListener("click", async () => {
  const content = elTextarea.value.trim();
  if (!content) return setStatus(statusCL, "Nothing to save.", "error");

  btnSaveCL.disabled = true;
  setStatus(statusCL, "Saving...");

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
    setStatus(statusCL, "Saved!", "success");
    btnSaveCL.disabled = true;
  } catch (err) {
    setStatus(statusCL, err.message, "error");
  } finally {
    btnSaveCL.disabled = false;
  }
});

// Download .txt
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

// Download PDF
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
  doc.text(`Cover Letter — ${jobData?.title || "Job"}`, margin, margin + 7);

  let y = margin + 16;
  content.split("\n\n").forEach((para) => {
    const lines = doc.splitTextToSize(para.replace(/\n/g, " ").trim(), maxWidth);
    if (y + lines.length * 6 > 280) { doc.addPage(); y = margin; }
    doc.text(lines, margin, y);
    y += lines.length * 6 + 4;
  });

  const filename = `${currentUsername}_${jobData?.title || "job"}_coverletter.pdf`.replace(/\s+/g, "_");
  doc.save(filename);
  setStatus(statusCL, "PDF downloaded!", "success");
});
