// PURPOSE: Service module managing ml_worker.
/**
 * ml_worker.ts - Isolated Web Worker for Background AI Inference
 * Prevents UI freezing by keeping heavy matrix math off the main thread.
 */

import { pipeline, env, Pipeline } from '@xenova/transformers';

// Disable remote models, enforce local cache/quantized only for privacy & performance
env.allowLocalModels = true;
env.useBrowserCache = true;

class TextClassifier {
  static instance: Promise<any> | null = null;

  static async getInstance(): Promise<any> {
    if (this.instance === null) {
      // Use a highly quantized, lightweight zero-shot model
      // Xenova/nli-deberta-v3-xsmall is much lighter than mobilebert
      this.instance = pipeline('zero-shot-classification', 'Xenova/nli-deberta-v3-xsmall', {
        quantized: true,
      });
    }
    return this.instance;
  }
}

const CATEGORY_LABELS = [
  'Banking & Finance',
  'Work & Productivity',
  'Shopping',
  'Gaming',
  'Social Media',
  'Education',
  'Cloud Infrastructure',
  'Email & Communication'
];

self.addEventListener('message', async (event: MessageEvent) => {
  const { id, text } = event.data;

  try {
    const classifier = await TextClassifier.getInstance();

    // Multi-label zero-shot classification
    const output = await classifier(text, CATEGORY_LABELS);

    // Post back the highest scoring label
    self.postMessage({
      id,
      status: 'complete',
      result: {
        label: output.labels[0],
        score: output.scores[0]
      }
    });
  } catch (error: any) {
    self.postMessage({ id, status: 'error', error: error.message });
  }
});
