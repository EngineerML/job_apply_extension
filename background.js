const API_BASE = "http://localhost:8000"; // Change to Koyeb URL after deployment

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GENERATE") {
    fetch(`${API_BASE}/generate-cover-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));

    return true; // keep channel open for async response
  }

  if (message.type === "SAVE") {
    fetch(`${API_BASE}/save-cover-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));

    return true;
  }
});
