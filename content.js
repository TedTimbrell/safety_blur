let isProcessing = false;
const FPS = 15;
let videoCounter = 0;
let overlayContainer = null;
let processingTimeout = null;

// Face detection history tracking
const faceDetectionHistory = new Map(); // Map<videoId, Array<{timestamp: number, faces: Array<face>}>>
const HISTORY_DURATION = 1000; // 1 second history
const FACE_MATCH_THRESHOLD = 0.2; // 20% of face width/height for position matching
const REQUIRED_MATCH_RATIO = 0.8; // Must appear in 50% of frames

// Check if two faces match (roughly same position and size)
function doFacesMatch(face1, face2) {
    const xDiff = Math.abs(face1.x - face2.x);
    const yDiff = Math.abs(face1.y - face2.y);
    const widthDiff = Math.abs(face1.width - face2.width);
    const heightDiff = Math.abs(face1.height - face2.height);
    
    const threshold = Math.max(face1.width, face1.height) * FACE_MATCH_THRESHOLD;
    
    return xDiff < threshold && 
           yDiff < threshold && 
           widthDiff < threshold && 
           heightDiff < threshold;
}

// Check if a face has consistent detection history
function hasFaceConsistentHistory(videoId, face, currentTime) {
    const history = faceDetectionHistory.get(videoId) || [];
    const minTimestamp = currentTime - HISTORY_DURATION;
    
    // Remove old entries
    while (history.length > 0 && history[0].timestamp < minTimestamp) {
        history.shift();
    }
    
    // Count how many frames in the last second had this face
    let matchCount = 0;
    history.forEach(entry => {
        if (entry.faces.some(f => doFacesMatch(face, f))) {
            matchCount++;
        }
    });
    
    // Calculate the ratio of frames where the face was found
    const matchRatio = history.length > 0 ? matchCount / history.length : 0;
    return matchRatio >= REQUIRED_MATCH_RATIO;
}

// Update face detection history
function updateFaceHistory(videoId, faces) {
    if (!faceDetectionHistory.has(videoId)) {
        faceDetectionHistory.set(videoId, []);
    }
    
    const history = faceDetectionHistory.get(videoId);
    const currentTime = Date.now();
    
    // Add new entry
    history.push({
        timestamp: currentTime,
        faces: faces
    });
    
    // Remove old entries
    const minTimestamp = currentTime - HISTORY_DURATION;
    while (history.length > 0 && history[0].timestamp < minTimestamp) {
        history.shift();
    }
}

console.log('Content script loaded');

// Create the overlay container
function createOverlay() {
    if (!overlayContainer) {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'blur-safety-overlay';
        document.body.appendChild(overlayContainer);
        console.debug('Created overlay container');
    }
}

// Load TensorFlow.js and Face Detection dynamically
async function loadScripts() {
    console.debug('Starting to load scripts...');
    createOverlay();
    
    // Load core TensorFlow.js
    const tfScript = document.createElement('script');
    tfScript.src = chrome.runtime.getURL('lib/tensorflow.min.js');
    console.debug('Loading TensorFlow from:', tfScript.src);
    
    // Load TensorFlow.js face detection model
    const faceDetectionScript = document.createElement('script');
    faceDetectionScript.src = chrome.runtime.getURL('lib/face-detection.min.js');
    console.debug('Loading Face Detection from:', faceDetectionScript.src);

    // Load MediaPipe face detection
    const mediapipeScript = document.createElement('script');
    mediapipeScript.src = chrome.runtime.getURL('lib/face-detection-mediapipe.min.js');
    console.debug('Loading MediaPipe Face Detection from:', mediapipeScript.src);
    
    const detectionLogicScript = document.createElement('script');
    detectionLogicScript.src = chrome.runtime.getURL('face-detection.js');
    console.debug('Loading Detection Logic from:', detectionLogicScript.src);
    
    document.head.appendChild(tfScript);
    await new Promise(resolve => {
        tfScript.onload = () => {
            console.log('TensorFlow loaded successfully');
            resolve();
        };
        tfScript.onerror = (error) => {
            console.error('Error loading TensorFlow:', error);
            resolve();
        };
    });
    
    document.head.appendChild(faceDetectionScript);
    await new Promise(resolve => {
        faceDetectionScript.onload = () => {
            console.log('Face Detection loaded successfully');
            resolve();
        };
        faceDetectionScript.onerror = (error) => {
            console.error('Error loading Face Detection:', error);
            resolve();
        };
    });

    document.head.appendChild(mediapipeScript);
    await new Promise(resolve => {
        mediapipeScript.onload = () => {
            console.log('MediaPipe Face Detection loaded successfully');
            resolve();
        };
        mediapipeScript.onerror = (error) => {
            console.error('Error loading MediaPipe Face Detection:', error);
            resolve();
        };
    });
    
    document.head.appendChild(detectionLogicScript);
    await new Promise(resolve => {
        detectionLogicScript.onload = () => {
            console.log('Detection Logic loaded successfully');
            resolve();
        };
        detectionLogicScript.onerror = (error) => {
            console.error('Error loading Detection Logic:', error);
            resolve();
        };
    });
    
    // Get the base URL for the extension
    const extensionUrl = chrome.runtime.getURL('').replace(/\/$/, '');
    console.debug('All scripts loaded, initializing face detection with solution path:', extensionUrl);
    window.postMessage({ 
        type: 'INIT_FACE_DETECTION',
        solutionPath: extensionUrl
    }, '*');
}

function getVideoPosition(videoElement) {
    const rect = videoElement.getBoundingClientRect();
    const scale = videoElement.videoWidth ? videoElement.videoWidth / rect.width : 1;
    return { rect, scale };
}

function updateFaceCutouts(videoElement, faces) {
    console.debug('Updating face cutouts for video, faces found:', faces.length);
    console.debug('Faces:', faces);
    
    // Update face detection history
    updateFaceHistory(videoElement.id, faces);
    
    // Filter faces based on temporal consistency
    const currentTime = Date.now();
    const consistentFaces = faces.filter(face => 
        hasFaceConsistentHistory(videoElement.id, face, currentTime)
    );
    
    console.debug('Consistent faces after temporal filtering:', consistentFaces.length);
    
    // Remove existing cutouts and overlay for this video
    const existingElements = overlayContainer.querySelectorAll(`[data-video-id="${videoElement.id}"]`);
    console.debug('Removing existing elements:', existingElements.length);
    existingElements.forEach(el => el.remove());

    // Get video position and scale
    const { rect, scale } = getVideoPosition(videoElement);

    // Create a container for this video's overlay and cutouts
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.dataset.videoId = videoElement.id;
    videoContainer.style.position = 'fixed';
    videoContainer.style.left = `${rect.left}px`;
    videoContainer.style.top = `${rect.top}px`;
    videoContainer.style.width = `${rect.width}px`;
    videoContainer.style.height = `${rect.height}px`;
    videoContainer.style.zIndex = '2147483647';
    videoContainer.style.pointerEvents = 'none';

    // Create the blur overlay
    const blurOverlay = document.createElement('div');
    blurOverlay.className = 'video-blur-overlay';
    blurOverlay.dataset.videoId = videoElement.id;

    // Create clip path for the cutouts
    if (consistentFaces.length > 0) {
        let clipPath = 'polygon(';
        
        // Start with the outer rectangle
        clipPath += '0% 0%, 100% 0%, 100% 100%, 0% 100%';
        
        // Add each face cutout
        consistentFaces.forEach(face => {
            const left = (face.x / scale) / rect.width * 100;
            const top = (face.y / scale) / rect.height * 100;
            const width = (face.width / scale) / rect.width * 100;
            const height = (face.height / scale) / rect.height * 100;
            
            // Move to the start of this cutout (creates a 0-width line)
            clipPath += `, 0% ${top}%`;
            
            // Draw the cutout
            clipPath += `, ${left}% ${top}%`;
            clipPath += `, ${left}% ${top + height}%`;
            clipPath += `, ${left + width}% ${top + height}%`;
            clipPath += `, ${left + width}% ${top}%`;
            clipPath += `, ${left}% ${top}%`;
            
            // Return to the edge (creates a 0-width line)
            clipPath += `, 0% ${top}%`;
        });
        
        clipPath += ')';
        console.debug('Generated clip path:', clipPath);
        blurOverlay.style.clipPath = clipPath;
        blurOverlay.style.webkitClipPath = clipPath;
    }

    videoContainer.appendChild(blurOverlay);

    // Add face boxes
    consistentFaces.forEach((face, index) => {
        console.debug(`Creating face box ${index} at:`, face);
        const faceBox = document.createElement('div');
        faceBox.className = 'face-cutout';
        faceBox.dataset.videoId = videoElement.id;

        // Calculate position relative to video container
        const left = face.x / scale;
        const top = face.y / scale;
        const width = face.width / scale;
        const height = face.height / scale;

        faceBox.style.left = `${left}px`;
        faceBox.style.top = `${top}px`;
        faceBox.style.width = `${width}px`;
        faceBox.style.height = `${height}px`;
        
        // Add debug label if needed
        if (true) { // Change to a debug flag if needed
            const label = document.createElement('div');
            label.style.position = 'absolute';
            label.style.top = '-20px';
            label.style.left = '0';
            label.style.background = 'rgba(0, 0, 0, 0.7)';
            label.style.color = '#fff';
            label.style.padding = '2px 4px';
            label.style.fontSize = '10px';
            label.style.borderRadius = '2px';
            label.textContent = `Face ${index + 1} (${Math.round(width)}x${Math.round(height)})`;
            faceBox.appendChild(label);
        }

        videoContainer.appendChild(faceBox);
    });

    overlayContainer.appendChild(videoContainer);
}

function processFaceDetection(videoElement) {
    if (!videoElement) {
        console.debug('Skipping face detection: no video');
        return;
    }
    
    // Ensure video has an ID
    if (!videoElement.id) {
        videoElement.id = `blur-safety-video-${videoCounter++}`;
        console.debug('Assigned video ID:', videoElement.id);
    }

    // Clear any existing processing timeout
    if (processingTimeout) {
        clearTimeout(processingTimeout);
    }

    // If already processing, schedule a retry
    if (isProcessing) {
        console.debug('Already processing face detection, will retry in 1s');
        processingTimeout = setTimeout(() => {
            console.debug('Resetting processing flag due to timeout');
            isProcessing = false;
            processFaceDetection(videoElement);
        }, 1000);
        return;
    }

    // Wait for video to be ready
    if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA
        console.debug('Video not ready yet, waiting for metadata...');
        const onceHandler = () => {
            console.debug('Video data loaded, retrying face detection');
            videoElement.removeEventListener('loadeddata', onceHandler);
            processFaceDetection(videoElement);
        };
        videoElement.addEventListener('loadeddata', onceHandler);
        return;
    }

    // Check if video is visible and playing
    const rect = videoElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !isElementInViewport(videoElement)) {
        console.debug('Video not visible or has zero dimensions, skipping detection');
        return;
    }

    if (videoElement.paused || videoElement.ended || !videoElement.currentTime) {
        console.debug('Video is not actively playing, skipping detection');
        return;
    }
    
    console.debug('Processing face detection for video:', videoElement.id, {
        readyState: videoElement.readyState,
        paused: videoElement.paused,
        currentTime: videoElement.currentTime,
        dimensions: `${rect.width}x${rect.height}`
    });

    isProcessing = true;
    
    // Set a safety timeout to reset the processing flag
    processingTimeout = setTimeout(() => {
        console.debug('Resetting processing flag due to timeout');
        isProcessing = false;
    }, 5000);

    window.postMessage({ 
        type: 'DETECT_FACES',
        videoSelector: `#${videoElement.id}`
    }, '*');
}

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

// Function to reinitialize video detection
function reinitializeVideoDetection() {
    console.debug('Reinitializing video detection');
    
    // Clear existing intervals and cutouts
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (video.blurSafetyInterval) {
            clearInterval(video.blurSafetyInterval);
            delete video.blurSafetyInterval;
        }
    });
    
    // Clear existing cutouts
    if (overlayContainer) {
        overlayContainer.innerHTML = '';
    }
    
    // Reset processing state
    isProcessing = false;
    if (processingTimeout) {
        clearTimeout(processingTimeout);
    }
    
    // Reinitialize face detection
    console.debug('Reloading scripts and reinitializing face detection');
    loadScripts();
    
    // Set up detection for all videos
    videos.forEach(video => {
        video.blurSafetyInterval = setInterval(() => processFaceDetection(video), 1000 / FPS);
    });
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug('Received extension message:', message.type);
    if (message.type === 'REFRESH_VIDEO_DETECTION') {
        reinitializeVideoDetection();
    }
});

// Listen for messages from the page script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    console.debug('Received message:', event.data.type);

    switch (event.data.type) {
        case 'FACE_DETECTION_READY':
            console.log('Face detection model loaded, processing existing videos');
            const videos = document.querySelectorAll('video');
            console.debug('Found existing videos:', videos.length);
            videos.forEach(video => {
                video.blurSafetyInterval = setInterval(() => processFaceDetection(video), 1000 / FPS);
            });
            break;

        case 'FACE_DETECTION_ERROR':
            console.error('Face detection error:', event.data.error);
            if (processingTimeout) {
                clearTimeout(processingTimeout);
            }
            isProcessing = false;
            break;

        case 'FACE_DETECTION_RESULT':
            console.debug('Received face detection result for:', event.data.videoSelector);
            if (processingTimeout) {
                clearTimeout(processingTimeout);
            }
            const video = document.querySelector(event.data.videoSelector);
            if (video) {
                console.debug('Updating face cutouts with faces:', event.data.faces.length);
                updateFaceCutouts(video, event.data.faces);
            } else {
                console.debug('Could not find video element');
            }
            isProcessing = false;
            break;
    }
});

// Initialize scripts
console.log('Starting script initialization');
console.debug('Setting up video element observer');
loadScripts();

// Monitor for video elements
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'VIDEO') {
                console.debug('New video element detected:', node);
                node.blurSafetyInterval = setInterval(() => processFaceDetection(node), 1000 / FPS);
            }
        });
    });
});

// Start observing the document
observer.observe(document.body, {
    childList: true,
    subtree: true
});
console.debug('Observer started');

// Handle window resize and scroll events
window.addEventListener('resize', () => {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (video.id) {
            const cutouts = overlayContainer.querySelectorAll(`.face-cutout[data-video-id="${video.id}"]`);
            if (cutouts.length > 0) {
                processFaceDetection(video);
            }
        }
    });
});

// Throttled scroll handler
let scrollTimeout;
window.addEventListener('scroll', () => {
    if (scrollTimeout) {
        return;
    }
    scrollTimeout = setTimeout(() => {
        const videos = document.querySelectorAll('video');
        videos.forEach(video => {
            if (video.id) {
                const cutouts = overlayContainer.querySelectorAll(`.face-cutout[data-video-id="${video.id}"]`);
                if (cutouts.length > 0) {
                    processFaceDetection(video);
                }
            }
        });
        scrollTimeout = null;
    }, 100);
}); 