// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'INIT') {
    // Respond immediately to keep the message channel open
    sendResponse({ status: 'initialized' });
  }
}); 