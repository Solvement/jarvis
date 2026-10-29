(() => {
  if (globalThis.__feishuCompanionLoaded) return;
  globalThis.__feishuCompanionLoaded = true;
  let remembered = null;
  function remember() {
    if (!document.hasFocus()) return;
    const value = FeishuCapture.captureSelection(document, window);
    if (value) remembered = value;
    else if (remembered?.url !== FeishuCapture.documentUrl(window)) remembered = null;
  }
  for (const event of ['selectionchange', 'input', 'compositionend', 'keyup', 'pointerup']) {
    document.addEventListener(event, remember, { passive: true });
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'capture-context') return;
    try { sendResponse({ context: FeishuCapture.collect(document, window, remembered) }); }
    catch (error) { sendResponse({ error: error.message }); }
  });
})();
