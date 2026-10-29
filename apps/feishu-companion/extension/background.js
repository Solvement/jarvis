chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id });
  if (/^https:\/\/[^/]+\.feishu\.cn\/(wiki|docx|docs)\//.test(tab.url || '')) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js', 'content.js'] }).catch(() => {});
  }
});
