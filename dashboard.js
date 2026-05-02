const API_BASE = "http://localhost:8000";

const tbody         = document.getElementById("jobs-tbody");
const tableWrap     = document.getElementById("table-wrap");
const loadingEl     = document.getElementById("loading");
const emptyEl       = document.getElementById("empty");
const modal         = document.getElementById("modal");
const modalTitle    = document.getElementById("modal-title");
const modalCompany  = document.getElementById("modal-company");
const modalUrl      = document.getElementById("modal-url");
const modalDate     = document.getElementById("modal-date");
const modalStatus   = document.getElementById("modal-status-select");
const modalStatusMsg = document.getElementById("modal-status-msg");
const tabDesc       = document.getElementById("tab-description");
const tabCL         = document.getElementById("tab-cover-letter");
const tabSQ         = document.getElementById("tab-special-qa");

const searchWrap    = document.getElementById("search-wrap");
const searchInput   = document.getElementById("search-input");

let currentJobId = null;

// Helpers
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(s) {
  return `status-badge status-${s || "Applied"}`;
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

// Load and render jobs
async function loadJobs() {
  loadingEl.style.display = "block";
  tableWrap.style.display = "none";
  emptyEl.style.display   = "none";

  try {
    const jobs = await apiFetch("/jobs");

    loadingEl.style.display = "none";

    if (!jobs.length) {
      emptyEl.style.display = "block";
      return;
    }

    tbody.innerHTML = "";
    jobs.forEach((job, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="num-cell">${jobs.length - idx}</td>
        <td class="date-cell">${formatDate(job.created_at)}</td>
        <td class="title-cell" title="${job.title || ""}">${job.title || "—"}</td>
        <td class="company-cell" title="${job.company || ""}">${job.company || "—"}</td>
        <td><span class="${statusClass(job.status)}">${job.status || "Applied"}</span></td>
        <td><button class="btn-view" data-id="${job.id}">View</button></td>
        <td><button class="btn-delete" data-id="${job.id}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });

    // Store jobs for modal lookup
    window._jobs = jobs;
    tableWrap.style.display = "block";
    searchWrap.style.display = "block";

    // Attach view and delete button listeners
    function attachListeners() {
      tbody.querySelectorAll(".btn-view").forEach((btn) => {
        btn.addEventListener("click", () => openModal(btn.dataset.id));
      });
      tbody.querySelectorAll(".btn-delete").forEach((btn) => {
        btn.addEventListener("click", () => deleteJob(btn.dataset.id));
      });
    }
    attachListeners();

    // Search
    searchInput.value = "";
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase();
      tbody.querySelectorAll("tr").forEach((tr) => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(q) ? "" : "none";
      });
    };

  } catch (err) {
    loadingEl.textContent = `Error: ${err.message}`;
  }
}

// Delete job
async function deleteJob(jobId) {
  if (!confirm("Delete this job and its cover letter?")) return;
  try {
    await apiFetch(`/jobs/${jobId}`, { method: "DELETE" });
    window._jobs = window._jobs.filter((j) => j.id !== jobId);
    tbody.querySelector(`[data-id="${jobId}"]`)?.closest("tr")?.remove();
    if (!window._jobs.length) {
      tableWrap.style.display = "none";
      emptyEl.style.display   = "block";
    }
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
}

// Open modal
function openModal(jobId) {
  const job = window._jobs.find((j) => j.id === jobId);
  if (!job) return;

  currentJobId = jobId;

  modalTitle.textContent   = job.title   || "—";
  modalCompany.textContent = job.company || "—";
  modalDate.textContent    = formatDate(job.created_at);
  modalUrl.href            = job.url || "#";
  modalUrl.textContent     = job.url ? "Open Job Posting ↗" : "No URL saved";

  modalStatus.value = job.status || "Applied";
  modalStatusMsg.textContent = "";

  tabDesc.textContent = job.description || "";
  tabDesc.className   = `tab-panel${job.description ? "" : " empty"}`;
  if (!job.description) tabDesc.textContent = "No description saved.";

  tabCL.textContent = job.cover_letter || "";
  tabCL.className   = `tab-panel${job.cover_letter ? "" : " empty"}`;
  if (!job.cover_letter) tabCL.textContent = "No cover letter saved for this job.";

  // Special Q&A
  tabSQ.innerHTML = "";
  const qa = job.special_qa || [];
  if (!qa.length) {
    tabSQ.innerHTML = `<div class="tab-panel empty">No special Q&amp;A saved for this job.</div>`;
  } else {
    qa.forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "qa-item";
      div.innerHTML = `
        <div class="qa-q">Q${i + 1}: ${item.prompt}</div>
        <div class="qa-a">${item.answer}</div>
      `;
      tabSQ.appendChild(div);
    });
  }

  // Reset to description tab
  switchTab("description");

  modal.style.display = "flex";
}

// Tab switching
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
  tabDesc.style.display = name === "description" ? "block" : "none";
  tabCL.style.display   = name === "cover-letter" ? "block" : "none";
  tabSQ.style.display   = name === "special-qa"   ? "block" : "none";
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Status update
modalStatus.addEventListener("change", async () => {
  if (!currentJobId) return;
  const status = modalStatus.value;
  try {
    await apiFetch(`/jobs/${currentJobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    modalStatusMsg.textContent = "Saved!";
    setTimeout(() => { modalStatusMsg.textContent = ""; }, 2000);

    // Update badge in table row without full reload
    const job = window._jobs.find((j) => j.id === currentJobId);
    if (job) {
      job.status = status;
      const badge = tbody.querySelector(`[data-id="${currentJobId}"]`)
        ?.closest("tr")
        ?.querySelector(".status-badge");
      if (badge) {
        badge.className   = statusClass(status);
        badge.textContent = status;
      }
    }
  } catch (err) {
    modalStatusMsg.style.color = "#f87171";
    modalStatusMsg.textContent = err.message;
  }
});

// Close modal
document.getElementById("btn-modal-close").addEventListener("click", () => {
  modal.style.display = "none";
});

modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.style.display = "none";
});

// Refresh
document.getElementById("btn-refresh").addEventListener("click", loadJobs);

// Init
loadJobs();
