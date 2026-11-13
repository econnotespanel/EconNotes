import { useEffect, useSyncExternalStore } from 'react';
import { neuralEngine, type NeuralEngineState } from '@/lib/neural/neuralEngine';

/**
 * Subscribes a React component to the singleton WebGPU / Hybrid AI engine store
 * and triggers non-invasive hardware capability detection on first mount.
 * Never downloads any model weights without explicit user action.
 */
export function useNeuralEngine(): NeuralEngineState {
  const snapshot = useSyncExternalStore(
    neuralEngine.subscribe,
    neuralEngine.getSnapshot,
    neuralEngine.getSnapshot,
  );

  useEffect(() => {
    if (!snapshot.hardware && !snapshot.probing) {
      void neuralEngine.ensureProbed();
    }
  }, [snapshot.hardware, snapshot.probing]);

  return snapshot;
}
