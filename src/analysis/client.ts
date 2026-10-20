import type { AnalysisResult } from "./analyze";
import { SR } from "./features";
import type { AnalyzeMessage, AnalyzeRequest } from "./worker";

// 화면 쪽에서 부르는 분석 입구: 음원을 22050Hz 모노로 바꿔 워커에 넘기고 결과를 기다린다.

export async function analyzeBuffer(
  buffer: AudioBuffer,
  title: string,
  onProgress: (ratio: number, stage: string) => void,
): Promise<AnalysisResult> {
  const samples = await toMono22k(buffer);
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<AnalysisResult>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<AnalyzeMessage>) => {
        const m = e.data;
        if (m.type === "progress") onProgress(m.ratio, m.stage);
        else if (m.type === "done") resolve(m.result);
        else reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || "분석 중 오류가 났어요."));
      const req: AnalyzeRequest = { samples, title };
      worker.postMessage(req, [samples.buffer]);
    });
  } finally {
    worker.terminate();
  }
}

/** 브라우저의 리샘플러로 22050Hz 모노를 만든다 (스테레오는 섞는다) */
async function toMono22k(buffer: AudioBuffer): Promise<Float32Array> {
  const length = Math.ceil(buffer.duration * SR);
  const off = new OfflineAudioContext(1, length, SR);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0).slice();
}
