// Set the side panel to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DOWNLOAD_PDF") {
    chrome.downloads.download(
      { url: message.dataUrl, filename: message.filename, saveAs: false },
      () => sendResponse({ ok: true })
    );
    return true;
  }

  if (message.type === "FETCH_PDF") {
    fetch(message.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.body),
    })
      .then((res) => {
        if (!res.ok) throw new Error("PDF generation failed");
        return res.arrayBuffer();
      })
      .then((buffer) => {
        // Convert to base64 in background worker
        const bytes = new Uint8Array(buffer);
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        const base64 = btoa(binary);
        const dataUrl = "data:application/pdf;base64," + base64;
        chrome.downloads.download(
          { url: dataUrl, filename: message.filename, saveAs: false },
          () => sendResponse({ ok: true })
        );
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
