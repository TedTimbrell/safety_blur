console.log('Face detection script loaded');
let faceDetectionModel = null;

async function initFaceDetection(solutionPath) {
    console.log('Initializing face detection...', { solutionPath });
    try {
        console.log('Creating face detector...');
        const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
        const detectorConfig = {
            runtime: 'mediapipe',
            maxFaces: 10,
            modelType: 'short',
            solutionPath: `${solutionPath}/lib`,
            wasmSettings: {
                wasmPaths: {
                    'face_detection_solution_simd_wasm_bin.wasm': `${solutionPath}/lib/face_detection_solution_simd_wasm_bin.wasm`,
                    'face_detection_solution_wasm_bin.wasm': `${solutionPath}/lib/face_detection_solution_wasm_bin.wasm`
                }
            }
        };
        console.log('Detector config:', JSON.stringify(detectorConfig, null, 2));
        const detector = await faceDetection.createDetector(model, detectorConfig);
        console.log('Face detector created successfully');
        faceDetectionModel = detector;
        window.postMessage({ type: 'FACE_DETECTION_READY' }, '*');
    } catch (error) {
        console.error('Face detection initialization error:', error);
        window.postMessage({ type: 'FACE_DETECTION_ERROR', error: error.message }, '*');
    }
}

async function detectFaces(videoSelector) {
    if (!faceDetectionModel) {
        console.log('Face detection model not initialized');
        window.postMessage({ type: 'FACE_DETECTION_ERROR', error: 'Model not initialized' }, '*');
        return;
    }
    try {
        console.log('Looking for video element:', videoSelector);
        const videoElement = document.querySelector(videoSelector);
        if (!videoElement) {
            console.log('Video element not found');
            window.postMessage({ type: 'FACE_DETECTION_ERROR', error: 'Video element not found' }, '*');
            return;
        }

        // Check if video is ready
        if (!videoElement.videoWidth || !videoElement.videoHeight) {
            console.log('Video not ready - dimensions not available');
            window.postMessage({ type: 'FACE_DETECTION_ERROR', error: 'Video dimensions not available' }, '*');
            return;
        }

        // Check if video is visible and has non-zero dimensions
        const rect = videoElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            console.log('Video has zero dimensions in viewport');
            window.postMessage({ type: 'FACE_DETECTION_ERROR', error: 'Video has zero dimensions' }, '*');
            return;
        }

        // Check if video is actually playing
        if (videoElement.paused || videoElement.ended || !videoElement.currentTime) {
            console.log('Video is not actively playing');
            window.postMessage({ type: 'FACE_DETECTION_ERROR', error: 'Video is not playing' }, '*');
            return;
        }
        
        console.log('Running face detection on video:', {
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
            displayWidth: rect.width,
            displayHeight: rect.height,
            currentTime: videoElement.currentTime,
            readyState: videoElement.readyState,
            paused: videoElement.paused,
            ended: videoElement.ended
        });

        const predictions = await faceDetectionModel.estimateFaces(videoElement, {
            flipHorizontal: false,
            staticImageMode: false
        });
        console.log('Face detection complete, faces found:', predictions.length);
        
        window.postMessage({
            type: 'FACE_DETECTION_RESULT',
            faces: predictions.map(pred => ({
                x: pred.box.xMin,
                y: pred.box.yMin,
                width: pred.box.width,
                height: pred.box.height
            })),
            videoSelector
        }, '*');
    } catch (error) {
        console.error('Detection error:', error);
        window.postMessage({ 
            type: 'FACE_DETECTION_ERROR', 
            error: error.message || 'Unknown error during face detection'
        }, '*');
    }
}

// Listen for messages from the content script
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    console.log('Face detection script received message:', event.data.type);

    switch (event.data.type) {
        case 'INIT_FACE_DETECTION':
            console.log('Received initialization request');
            await initFaceDetection(event.data.solutionPath);
            break;
        case 'DETECT_FACES':
            console.log('Received face detection request for:', event.data.videoSelector);
            await detectFaces(event.data.videoSelector);
            break;
    }
});

window.initFaceDetection = initFaceDetection;
window.detectFaces = detectFaces; 
window.detectFaces = detectFaces; 