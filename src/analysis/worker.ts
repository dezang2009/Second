/// <reference lib="webworker" />
import { analyzeSamples } from "./analyze";

// 분석은 몇 초 걸리므로 화면이 멈추지 않게 워커에서 돌린다.

export interface AnalyzeRequest {
  samples: Float32Array;
  title: string;
}

export type AnalyzeMessage =
  | { type: "progress"; ratio: number; stage: string }
  | { type: "done"; result: ReturnType<typeof analyzeSamples> }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const post = (m: AnalyzeMessage) => self.postMessage(m);
  try {
    const result = analyzeSamples(e.data.samples, {
      title: e.data.title,
      onProgress: (ratio, stage) => post({ type: "progress", ratio, stage }),
    });
    post({ type: "done", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
