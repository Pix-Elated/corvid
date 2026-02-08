import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';
import sharp from 'sharp';

// Model input size for MobileNetV2 (default nsfwjs model)
const MODEL_SIZE = 224;

// Thresholds for auto-actions
const DELETE_THRESHOLD = 0.8; // Auto-delete + mute if Porn or Hentai above this
const FLAG_THRESHOLD = 0.5; // Flag to mod-log if Porn or Hentai above this

let model: nsfwjs.NSFWJS | null = null;
let modelLoading = false;

export interface ScanResult {
  action: 'delete' | 'flag' | 'safe';
  topClass: string;
  topProbability: number;
  predictions: nsfwjs.PredictionType[];
}

/**
 * Load the NSFW classification model. Call once at startup.
 * Uses MobileNetV2 — lighter weight, suitable for server-side classification.
 */
export async function loadNsfwModel(): Promise<void> {
  if (model || modelLoading) return;
  modelLoading = true;

  try {
    // Set TF.js backend to CPU (no GPU in Docker containers)
    await tf.setBackend('cpu');
    await tf.ready();

    model = await nsfwjs.load('MobileNetV2');
    console.log('[ImageScanner] NSFW model loaded (MobileNetV2, CPU backend)');
  } catch (error) {
    console.error('[ImageScanner] Failed to load NSFW model:', error);
    model = null;
  } finally {
    modelLoading = false;
  }
}

/**
 * Check if the scanner is ready.
 */
export function isScannerReady(): boolean {
  return model !== null;
}

/**
 * Download an image from a URL and return the raw buffer.
 */
async function fetchImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Convert an image buffer to a tf.Tensor3D suitable for nsfwjs.
 * Resizes to 224x224 and normalizes pixel values to [0, 1].
 */
async function imageToTensor(buffer: Buffer): Promise<tf.Tensor3D> {
  // Decode and resize to model input size, force 3 channels (RGB)
  const { data, info } = await sharp(buffer)
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Create tensor from raw pixel data: [height, width, channels]
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels]);
}

/**
 * Classify a single image from a URL.
 * Returns the classification result with recommended action.
 */
export async function classifyImage(url: string): Promise<ScanResult | null> {
  if (!model) return null;

  let tensor: tf.Tensor3D | null = null;
  try {
    const buffer = await fetchImage(url);
    tensor = await imageToTensor(buffer);
    const predictions = await model.classify(tensor);

    // Find Porn and Hentai probabilities
    const porn = predictions.find((p) => p.className === 'Porn')?.probability ?? 0;
    const hentai = predictions.find((p) => p.className === 'Hentai')?.probability ?? 0;
    const top = predictions.reduce((a, b) => (a.probability > b.probability ? a : b));

    let action: ScanResult['action'] = 'safe';
    if (porn >= DELETE_THRESHOLD || hentai >= DELETE_THRESHOLD) {
      action = 'delete';
    } else if (porn >= FLAG_THRESHOLD || hentai >= FLAG_THRESHOLD) {
      action = 'flag';
    }

    return {
      action,
      topClass: top.className,
      topProbability: top.probability,
      predictions,
    };
  } catch (error) {
    console.error(`[ImageScanner] Failed to classify image:`, error);
    return null;
  } finally {
    // Always dispose the tensor to prevent memory leaks
    if (tensor) tensor.dispose();
  }
}
