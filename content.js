let isProcessing = false;
const FPS = 15;
let videoCounter = 0;

console.log('Content script loaded');

// Load TensorFlow.js and Face Detection dynamically
async function loadScripts() {
    console.log('Starting to load scripts...');
    
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

function wrapVideo(videoElement) {
    if (videoElement.parentElement.classList.contains('video-container')) {
        console.log('Video already wrapped, skipping');
        return;
    }

    console.log('Wrapping video element:', videoElement);
    const container = document.createElement('div');
    container.className = 'video-container';
    videoElement.parentNode.insertBefore(container, videoElement);
    container.appendChild(videoElement);

    // Assign a unique ID to the video if it doesn't have one
    if (!videoElement.id) {
        videoElement.id = `blur-safety-video-${videoCounter++}`;
        console.log('Assigned video ID:', videoElement.id);
    }

    const blurOverlay = document.createElement('div');
    blurOverlay.className = 'blur-overlay';
    container.appendChild(blurOverlay);
    console.log('Added blur overlay to video:', videoElement.id);
}

function updateFaceCutouts(container, faces) {
    console.log('Updating face cutouts for container, faces found:', faces.length);
    
    // Remove existing cutouts
    const existingCutouts = container.querySelectorAll('.face-cutout');
    console.log('Removing existing cutouts:', existingCutouts.length);
    existingCutouts.forEach(el => el.remove());

    // Add new cutouts
    faces.forEach((face, index) => {
        console.log(`Creating cutout ${index} at:`, face);
        const cutout = document.createElement('div');
        cutout.className = 'face-cutout';
        cutout.style.left = `${face.x}px`;
        cutout.style.top = `${face.y}px`;
        cutout.style.width = `${face.width}px`;
        cutout.style.height = `${face.height}px`;
        container.appendChild(cutout);
    });
}

function processFaceDetection(videoElement) {
    if (!videoElement || isProcessing) {
        console.log('Skipping face detection:', !videoElement ? 'no video' : 'already processing');
        return;
    }
    
    console.log('Processing face detection for video:', videoElement.id);
    isProcessing = true;
    window.postMessage({ 
        type: 'DETECT_FACES',
        videoSelector: `#${videoElement.id}`
    }, '*');
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
                wrapVideo(video);
                setInterval(() => processFaceDetection(video), 1000 / FPS);
            });
            break;

        case 'FACE_DETECTION_ERROR':
            console.error('Face detection error:', event.data.error);
            break;

        case 'FACE_DETECTION_RESULT':
            console.log('Received face detection result for:', event.data.videoSelector);
            const video = document.querySelector(event.data.videoSelector);
            if (video && video.parentElement) {
                console.log('Updating face cutouts with faces:', event.data.faces.length);
                updateFaceCutouts(video.parentElement, event.data.faces);
            } else {
                console.log('Could not find video or parent element');
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
                wrapVideo(node);
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