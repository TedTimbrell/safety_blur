document.getElementById('refreshButton').addEventListener('click', async () => {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send refresh message to content script
    chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_VIDEO_DETECTION' });
    
    // Provide visual feedback
    const button = document.getElementById('refreshButton');
    button.textContent = 'Refreshing...';
    button.disabled = true;
    
    // Reset button after a short delay
    setTimeout(() => {
        button.textContent = 'Refresh Video Detection';
        button.disabled = false;
    }, 2000);
}); 