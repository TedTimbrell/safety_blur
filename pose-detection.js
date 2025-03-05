console.log('Pose detection script loaded');
let poseDetectionModel = null;

async function initPoseDetection(solutionPath) {
    console.debug('Initializing pose detection...', { solutionPath });
    try {
        console.debug('Creating pose detector...');
        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = {
            modelType: 'MultiPose.Lightning',
            enableSmoothing: true,
            minPoseScore: 0.3,
            multiPoseMaxDimension: 256
        };
        console.debug('Detector config:', JSON.stringify(detectorConfig, null, 2));
        const detector = await poseDetection.createDetector(model, detectorConfig);
        console.log('Pose detector created successfully');
        poseDetectionModel = detector;
        window.postMessage({ type: 'POSE_DETECTION_READY' }, '*');
    } catch (error) {
        console.error('Pose detection initialization error:', error);
        window.postMessage({ type: 'POSE_DETECTION_ERROR', error: error.message }, '*');
    }
}

async function detectPoses(videoSelector) {
    if (!poseDetectionModel) {
        console.debug('Pose detection model not initialized');
        window.postMessage({ type: 'POSE_DETECTION_ERROR', error: 'Model not initialized' }, '*');
        return;
    }
    try {
        console.debug('Looking for video element:', videoSelector);
        const videoElement = document.querySelector(videoSelector);
        if (!videoElement) {
            console.debug('Video element not found');
            window.postMessage({ type: 'POSE_DETECTION_ERROR', error: 'Video element not found' }, '*');
            return;
        }

        // Check if video is actually playing first
        if (videoElement.paused || videoElement.ended || !videoElement.currentTime) {
            console.debug('Video is not actively playing, skipping detection');
            // Not sending an error message since this is an expected state
            window.postMessage({ type: 'POSE_DETECTION_SKIP', reason: 'Video not playing' }, '*');
            return;
        }

        // Check if video is ready
        if (!videoElement.videoWidth || !videoElement.videoHeight) {
            console.debug('Video not ready - dimensions not available');
            window.postMessage({ type: 'POSE_DETECTION_ERROR', error: 'Video dimensions not available' }, '*');
            return;
        }

        // Check if video is visible and has non-zero dimensions
        const rect = videoElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            console.debug('Video has zero dimensions in viewport');
            window.postMessage({ type: 'POSE_DETECTION_ERROR', error: 'Video has zero dimensions' }, '*');
            return;
        }
        
        console.debug('Running pose detection on video:', {
            videoWidth: videoElement.videoWidth,
            videoHeight: videoElement.videoHeight,
            displayWidth: rect.width,
            displayHeight: rect.height,
            currentTime: videoElement.currentTime,
            readyState: videoElement.readyState,
            paused: videoElement.paused,
            ended: videoElement.ended
        });

        const predictions = await poseDetectionModel.estimatePoses(videoElement, {
            flipHorizontal: false,
            staticImageMode: false
        });
        console.debug('Pose detection complete, poses found:', predictions.length);
        
        window.postMessage({
            type: 'POSE_DETECTION_RESULT',
            poses: predictions.map(pred => ({
                keypoints: pred.keypoints,
                score: pred.score
            })),
            videoSelector
        }, '*');
    } catch (error) {
        console.error('Detection error:', error);
        window.postMessage({ 
            type: 'POSE_DETECTION_ERROR', 
            error: error.message || 'Unknown error during pose detection'
        }, '*');
    }
}

// Listen for messages from the content script
window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    console.debug('Pose detection script received message:', event.data.type);

    switch (event.data.type) {
        case 'INIT_POSE_DETECTION':
            console.debug('Received initialization request');
            await initPoseDetection(event.data.solutionPath);
            break;
        case 'DETECT_POSES':
            console.debug('Received pose detection request for:', event.data.videoSelector);
            await detectPoses(event.data.videoSelector);
            break;
    }
});

window.initPoseDetection = initPoseDetection;
window.detectPoses = detectPoses; 