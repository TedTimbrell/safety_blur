# Video Blur Safety Extension

A Chrome extension that automatically blurs video content while keeping faces visible using TensorFlow.js and MediaPipe Face Detection.

## Features

- Automatically detects video elements on web pages
- Applies a blur effect to the entire video
- Uses TensorFlow.js and MediaPipe Face Detection for real-time face detection
- Creates unblurred regions around detected faces
- Updates face detection at 15 FPS (configurable)

## Installation

1. Download the required library files:
   - Create a `lib` directory
   - Download [tensorflow.min.js](https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js)
   - Download [@tensorflow-models/face-detection](https://cdn.jsdelivr.net/npm/@tensorflow-models/face-detection) and save as `face-detection.min.js`
   - Place both files in the `lib` directory

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select this directory

## Usage

Once installed, the extension will automatically:
1. Detect video elements on any webpage
2. Apply a blur effect to the entire video
3. Detect faces in the video in real-time using MediaPipe Face Detection
4. Create unblurred regions around detected faces

The extension works automatically without any user intervention needed.

## Technical Details

- Uses MutationObserver to detect new video elements
- Implements face detection using TensorFlow.js and MediaPipe Face Detection
- Uses CSS backdrop-filter for blur effects
- Runs face detection at 15 FPS (configurable in content.js)
- Supports detection of multiple faces simultaneously (configurable up to 10 faces)

## Requirements

- Google Chrome browser
- Internet connection (for initial model loading)

## License

MIT License 