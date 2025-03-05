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
        console.debug('Created overlay container');
    }
}

// Load TensorFlow.js and Pose Detection dynamically
async function loadScripts() {
    console.debug('Starting to load scripts...');
    createOverlay();
    
    // Load core TensorFlow.js
    const tfScript = document.createElement('script');
    tfScript.src = chrome.runtime.getURL('lib/tensorflow.min.js');
    console.debug('Loading TensorFlow from:', tfScript.src);
    
    // Load TensorFlow.js pose detection model
    const poseDetectionScript = document.createElement('script');
    poseDetectionScript.src = chrome.runtime.getURL('lib/pose-detection.min.js');
    console.debug('Loading Pose Detection from:', poseDetectionScript.src);
    
    const poseDetectionLogicScript = document.createElement('script');
    poseDetectionLogicScript.src = chrome.runtime.getURL('pose-detection.js');
    console.debug('Loading Pose Detection Logic from:', poseDetectionLogicScript.src);
    
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

    document.head.appendChild(poseDetectionScript);
    await new Promise(resolve => {
        poseDetectionScript.onload = () => {
            console.log('Pose Detection loaded successfully');
            resolve();
        };
        poseDetectionScript.onerror = (error) => {
            console.error('Error loading Pose Detection:', error);
            resolve();
        };
    });

    document.head.appendChild(poseDetectionLogicScript);
    await new Promise(resolve => {
        poseDetectionLogicScript.onload = () => {
            console.log('Pose Detection Logic loaded successfully');
            resolve();
        };
        poseDetectionLogicScript.onerror = (error) => {
            console.error('Error loading Pose Detection Logic:', error);
            resolve();
        };
    });
    
    // Get the base URL for the extension
    const extensionUrl = chrome.runtime.getURL('').replace(/\/$/, '');
    console.debug('All scripts loaded, initializing pose detection with solution path:', extensionUrl);
    window.postMessage({ 
        type: 'INIT_POSE_DETECTION',
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
    if (faces.length > 0) {
        let clipPath = 'polygon(';
        
        // Start with the outer rectangle
        clipPath += '0% 0%, 100% 0%, 100% 100%, 0% 100%';
        
        // Add each face cutout
        faces.forEach(face => {
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
    faces.forEach((face, index) => {
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
    
    // Reinitialize detection
    console.debug('Reloading scripts and reinitializing detection');
    loadScripts();
    
    // Set up detection for all videos
    videos.forEach(video => {
        if (!video.id) {
            video.id = `blur-safety-video-${videoCounter++}`;
        }
        video.blurSafetyInterval = setInterval(() => {
            if (!isProcessing) {
                window.postMessage({ 
                    type: 'DETECT_POSES',
                    videoSelector: `#${video.id}`
                }, '*');
            }
        }, 1000 / FPS);
    });
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug('Received extension message:', message.type);
    if (message.type === 'REFRESH_VIDEO_DETECTION') {
        reinitializeVideoDetection();
    }
});

function calculateFaceBoxFromPoseKeypoints(keypoints) {
    // Get facial keypoints
    const facePoints = ['nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear'].map(name => 
        keypoints.find(kp => kp.name === name)
    ).filter(kp => kp && kp.score > 0.3); // Only use points with confidence > 0.3

    if (facePoints.length < 2) {
        return null; // Not enough points to make a reliable box
    }

    // Find the bounding box of the face points
    const xs = facePoints.map(p => p.x);
    const ys = facePoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2; // Use center point of detected Y coordinates

    // Calculate base width
    const width = maxX - minX;
    
    // Add horizontal padding (25% of width on each side)
    const paddedWidth = width * 1.5; // Original width + 25% padding on each side
    
    // Set height to exactly 1.5 times the padded width
    const height = paddedWidth * 1.5;
    
    return {
        x: Math.max(0, minX - width * 0.25), // Add 25% padding on each side
        y: Math.max(0, centerY - height / 2), // Center the box vertically around the detected points
        width: paddedWidth,
        height: height
    };
}

// Listen for messages from the page script
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    console.debug('Received message:', event.data.type);

    switch (event.data.type) {
        case 'POSE_DETECTION_READY':
            console.log('Pose detection model loaded, processing existing videos');
            const videos = document.querySelectorAll('video');
            console.debug('Found existing videos:', videos.length);
            videos.forEach(video => {
                if (!video.id) {
                    video.id = `blur-safety-video-${videoCounter++}`;
                }
                video.blurSafetyInterval = setInterval(() => {
                    if (!isProcessing) {
                        window.postMessage({ 
                            type: 'DETECT_POSES',
                            videoSelector: `#${video.id}`
                        }, '*');
                    }
                }, 1000 / FPS);
            });
            break;

        case 'POSE_DETECTION_ERROR':
            console.error('Pose detection error:', event.data.error);
            if (processingTimeout) {
                clearTimeout(processingTimeout);
            }
            isProcessing = false;
            break;

        case 'POSE_DETECTION_SKIP':
            console.debug('Skipping pose detection:', event.data.reason);
            isProcessing = false;
            break;

        case 'POSE_DETECTION_RESULT':
            console.debug('Received pose detection result for:', event.data.videoSelector);
            const poseVideo = document.querySelector(event.data.videoSelector);
            if (poseVideo) {
                const faces = event.data.poses
                    .map(pose => calculateFaceBoxFromPoseKeypoints(pose.keypoints))
                    .filter(face => face !== null);
                
                // Always update cutouts, even when no faces are found
                console.debug('Updating face cutouts with faces from pose detection:', faces.length);
                updateFaceCutouts(poseVideo, faces);
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
                if (!node.id) {
                    node.id = `blur-safety-video-${videoCounter++}`;
                }
                node.blurSafetyInterval = setInterval(() => {
                    if (!isProcessing) {
                        window.postMessage({ 
                            type: 'DETECT_POSES',
                            videoSelector: `#${node.id}`
                        }, '*');
                    }
                }, 1000 / FPS);
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
            if (cutouts.length > 0 && !isProcessing) {
                window.postMessage({ 
                    type: 'DETECT_POSES',
                    videoSelector: `#${video.id}`
                }, '*');
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
                if (cutouts.length > 0 && !isProcessing) {
                    window.postMessage({ 
                        type: 'DETECT_POSES',
                        videoSelector: `#${video.id}`
                    }, '*');
                }
            }
        });
        scrollTimeout = null;
    }, 100);
}); 