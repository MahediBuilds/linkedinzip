// Passes messages from the Zip page to auto_play.py, which listens on
// localhost and presses the arrow keys outside the browser.
const PLAYER_URL = "http://127.0.0.1:8765";

// "Google Chrome", "Microsoft Edge", ... for auto_play.py's messages.
const browserName = () =>
  navigator.userAgentData?.brands
    .map(b => b.brand)
    .find(b => !/chromium|not.?a.?brand/i.test(b)) || "Chromium";

function call(path, body) {
  const init = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  return fetch(PLAYER_URL + path, init)
    .then(r => r.json())
    .catch(e => ({ ok: false, error: e.message }));
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.kind === "zip-ping") call("/status").then(reply);
  else if (msg.kind === "zip-hello") call("/hello", { browser: browserName() }).then(reply);
  else if (msg.kind === "zip-play") call("/play", { moves: msg.moves }).then(reply);
  else if (msg.kind === "zip-moved") call("/moved", {}).then(reply);
  else return;
  return true; // reply asynchronously
});
