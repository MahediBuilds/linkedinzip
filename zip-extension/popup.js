// Shows whether auto_play.py is running and what happened on the Zip tab.
const ZIP_URL = "https://www.linkedin.com/games/zip/";
const isZip = url => /^https:\/\/www\.linkedin\.com\/games\/(view\/)?zip/i.test(url || "");

const $ = id => document.getElementById(id);

async function init() {
  chrome.runtime.sendMessage({ kind: "zip-ping" }).then(res => {
    $("dot").className = `dot ${res?.ok ? "on" : "off"}`;
    $("player").textContent = res?.ok ? "auto_play.py connected" : "auto_play.py not running";
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (!isZip(tab.url)) {
    $("open").hidden = false;
    $("open").onclick = () => {
      chrome.tabs.update(tab.id, { url: ZIP_URL });
      window.close();
    };
    return;
  }
  chrome.tabs.sendMessage(tab.id, { kind: "zip-status" }, res => {
    void chrome.runtime.lastError; // no content script: tab loaded before the extension
    $("status").textContent = res?.status || "Reload this tab.";
  });
}

init();
