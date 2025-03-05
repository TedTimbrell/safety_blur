let isProcessing = false;
const FPS = 15;
let videoCounter = 0;
let overlayContainer = null;
let processingTimeout = null;

console.log('Content script loaded');

// Create the overlay container
function createOverlay() {
    if (!overlayContainer) {
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'blur-safety-overlay';
        document.body.appendChild(overlayContainer);
        console.log('Created overlay container');
    }
}

// Load TensorFlow.js and Face Detection dynamically
async function loadScripts() {
    console.log('Starting to load scripts...');
    createOverlay();
    
    // Load core TensorFlow.js
    const tfScript = document.createElement('script');
    tfScript.src = chrome.runtime.getURL('lib/tensorflow.min.js');
    console.log('Loading TensorFlow from:', tfScript.src);
    
    // Load TensorFlow.js face detection model
    const faceDetectionScript = document.createElement('script');
    faceDetectionScript.src = chrome.runtime.getURL('lib/face-detection.min.js');
    console.log('Loading Face Detection from:', faceDetectionScript.src);

    // Load MediaPipe face detection
    const mediapipeScript = document.createElement('script');
    mediapipeScript.src = chrome.runtime.getURL('lib/face-detection-mediapipe.min.js');
    console.log('Loading MediaPipe Face Detection from:', mediapipeScript.src);
    
    const detectionLogicScript = document.createElement('script');
    detectionLogicScript.src = chrome.runtime.getURL('face-detection.js');
    console.log('Loading Detection Logic from:', detectionLogicScript.src);
    
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
    console.log('All scripts loaded, initializing face detection with solution path:', extensionUrl);
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
    console.log('Updating face cutouts for video, faces found:', faces.length);
    
    // Remove existing cutouts for this video
    const existingCutouts = overlayContainer.querySelectorAll(`.face-cutout[data-video-id="${videoElement.id}"]`);
    console.log('Removing existing cutouts:', existingCutouts.length);
    existingCutouts.forEach(el => el.remove());

    // Get video position and scale
    const { rect, scale } = getVideoPosition(videoElement);

    // Add new cutouts
    faces.forEach((face, index) => {
        console.log(`Creating cutout ${index} at:`, face);
        const cutout = document.createElement('div');
        cutout.className = 'face-cutout';
        cutout.dataset.videoId = videoElement.id;

        // Calculate position relative to viewport
        const left = rect.left + (face.x / scale);
        const top = rect.top + (face.y / scale);
        const width = face.width / scale;
        const height = face.height / scale;

        cutout.style.left = `${left}px`;
        cutout.style.top = `${top}px`;
        cutout.style.width = `${width}px`;
        cutout.style.height = `${height}px`;
        
        // Add debug label
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
        cutout.appendChild(label);

        overlayContainer.appendChild(cutout);
    });
}

function processFaceDetection(videoElement) {
    if (!videoElement) {
        console.log('Skipping face detection: no video');
        return;
    }
    
    // Ensure video has an ID
    if (!videoElement.id) {
        videoElement.id = `blur-safety-video-${videoCounter++}`;
        console.log('Assigned video ID:', videoElement.id);
    }

    // Clear any existing processing timeout
    if (processingTimeout) {
        clearTimeout(processingTimeout);
    }

    // If already processing, schedule a retry
    if (isProcessing) {
        console.log('Already processing face detection, will retry in 1s');
        processingTimeout = setTimeout(() => {
            console.log('Resetting processing flag due to timeout');
            isProcessing = false;
            processFaceDetection(videoElement);
        }, 1000);
        return;
    }

    // Wait for video to be ready
    if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA
        console.log('Video not ready yet, waiting for metadata...');
        const onceHandler = () => {
            console.log('Video data loaded, retrying face detection');
            videoElement.removeEventListener('loadeddata', onceHandler);
            processFaceDetection(videoElement);
        };
        videoElement.addEventListener('loadeddata', onceHandler);
        return;
    }

    // Check if video is visible and playing
    const rect = videoElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !isElementInViewport(videoElement)) {
        console.log('Video not visible or has zero dimensions, skipping detection');
        return;
    }

    if (videoElement.paused || videoElement.ended || !videoElement.currentTime) {
        console.log('Video is not actively playing, skipping detection');
        return;
    }
    
    console.log('Processing face detection for video:', videoElement.id, {
        readyState: videoElement.readyState,
        paused: videoElement.paused,
        currentTime: videoElement.currentTime,
        dimensions: `${rect.width}x${rect.height}`
    });

    isProcessing = true;
    
    // Set a safety timeout to reset the processing flag
    processingTimeout = setTimeout(() => {
        console.log('Resetting processing flag due to timeout');
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

// Listen for messages from the page script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    console.log('Received message:', event.data.type);

    switch (event.data.type) {
        case 'FACE_DETECTION_READY':
            console.log('Face detection model loaded, processing existing videos');
            const videos = document.querySelectorAll('video');
            console.log('Found existing videos:', videos.length);
            videos.forEach(video => {
                setInterval(() => processFaceDetection(video), 1000 / FPS);
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
            console.log('Received face detection result for:', event.data.videoSelector);
            if (processingTimeout) {
                clearTimeout(processingTimeout);
            }
            const video = document.querySelector(event.data.videoSelector);
            if (video) {
                console.log('Updating face cutouts with faces:', event.data.faces.length);
                updateFaceCutouts(video, event.data.faces);
            } else {
                console.log('Could not find video element');
            }
            isProcessing = false;
            break;
    }
});

// Initialize scripts
console.log('Starting script initialization');
loadScripts();

// Monitor for video elements
console.log('Setting up video element observer');
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'VIDEO') {
                console.log('New video element detected:', node);
                setInterval(() => processFaceDetection(node), 1000 / FPS);
            }
        });
    });
});

// Start observing the document
observer.observe(document.body, {
    childList: true,
    subtree: true
});
console.log('Observer started');

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