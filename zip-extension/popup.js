const ZIP_URL = "https://www.linkedin.com/games/zip/";
const ARROWS = { Up: "↑", Down: "↓", Left: "←", Right: "→" };

const mainBtn = document.getElementById("main");
const autoEl = document.getElementById("auto");
const statusEl = document.getElementById("status");
const keysEl = document.getElementById("keys");
const fmtEl = document.getElementById("fmt");
const rawEl = document.getElementById("raw");
const copyBtn = document.getElementById("copy");

const isZip = url => /^https:\/\/www\.linkedin\.com\/games\/(view\/)?zip/i.test(url || "");

let formats = null;

function send(tabId, msg) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, msg, res => {
      void chrome.runtime.lastError; // no content script yet
      resolve(res);
    });
  });
}

// The content script is injected on demand, the first time the popup is
// opened on a Zip tab (and again after the extension is reloaded).
async function ensureInjected(tabId) {
  if (await send(tabId, { kind: "zip-status" })) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["solver.js", "content.js"] });
  } catch (e) {
    statusEl.textContent = `Couldn't attach to the page: ${e.message}`;
    return false;
  }
  return !!(await send(tabId, { kind: "zip-status" }));
}

function renderRaw() {
  document.getElementById("copyRow").classList.toggle("on", !!formats);
  rawEl.textContent = formats ? formats[fmtEl.value] : "";
}

// Draw the key groups, dimming the ones already played and highlighting the
// next one.
function renderKeys(groups, done) {
  keysEl.textContent = "";
  for (const g of groups || []) {
    const chip = document.createElement("span");
    chip.className = "key";
    if (done >= 0) {
      if (done >= g.start + g.count) chip.classList.add("done");
      else if (done >= g.start) chip.classList.add("next");
    }
    const left = done >= g.start && done < g.start + g.count ? g.start + g.count - done : g.count;
    const arrow = document.createElement("b");
    arrow.textContent = ARROWS[g.dir];
    chip.append(arrow, ` ${g.dir}${left > 1 ? ` ×${left}` : ""}`);
    keysEl.appendChild(chip);
  }
}

function show(res) {
  statusEl.textContent = res?.status || "Couldn't reach the page. Reload it and try again.";
  formats = res?.formats || null;
  renderKeys(res?.groups, res?.done ?? 0);
  renderRaw();
}

chrome.storage.local.get(["zipAuto", "zipFormat"], ({ zipAuto, zipFormat }) => {
  autoEl.checked = !!zipAuto;
  if ([...fmtEl.options].some(o => o.value === zipFormat)) fmtEl.value = zipFormat;
  renderRaw();
});

fmtEl.addEventListener("change", () => {
  chrome.storage.local.set({ zipFormat: fmtEl.value });
  renderRaw();
});

copyBtn.addEventListener("click", async () => {
  if (!formats) return;
  await navigator.clipboard.writeText(formats[fmtEl.value]);
  copyBtn.textContent = "Copied ✓";
  setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  if (!isZip(tab.url)) {
    mainBtn.textContent = "Open Zip";
    statusEl.textContent = "Not on the Zip game page.";
    mainBtn.onclick = () => {
      chrome.tabs.update(tab.id, { url: ZIP_URL });
      window.close();
    };
    autoEl.onchange = () => chrome.storage.local.set({ zipAuto: autoEl.checked });
    return;
  }

  if (!(await ensureInjected(tab.id))) return;
  const solve = async () => show(await send(tab.id, { kind: "zip-show" }));
  mainBtn.onclick = solve;
  autoEl.onchange = () => {
    chrome.storage.local.set({ zipAuto: autoEl.checked });
    if (autoEl.checked) solve();
  };

  const { zipAuto } = await chrome.storage.local.get("zipAuto");
  if (zipAuto) solve();
  else show(await send(tab.id, { kind: "zip-status" }));
}

init();
