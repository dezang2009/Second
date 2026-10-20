// 게임 시계: 노트 위치와 판정은 모두 이 시계의 "곡 안에서의 시각(초)"을 기준으로 한다.
// AudioContext 시간을 쓰기 때문에 화면 프레임이 밀려도 음악과 어긋나지 않는다.

export type ClockState = "idle" | "playing" | "paused" | "ended";

const START_LEAD_SEC = 0.06; // 재생 예약 여유. 바로 start()하면 첫 소리가 잘릴 수 있다.

export class AudioClock {
  readonly ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0; // 재생을 시작한 AudioContext 시각
  private startOffset = 0; // 그때의 곡 위치(초)
  private lastReported = 0;
  private _state: ClockState = "idle";
  onEnded: (() => void) | null = null;
  /** 음악 소리 크기를 정하는 출력 노드 */
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.connect(ctx.destination);
  }

  get state(): ClockState {
    return this._state;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  load(buffer: AudioBuffer): void {
    this.stopSource();
    this.buffer = buffer;
    this.startOffset = 0;
    this.lastReported = 0;
    this._state = "paused";
  }

  /** @param leadSec 곡 시작 전 여유 시간. 그동안 time()은 음수다 (첫 노트가 빨리 나오는 곡을 위해) */
  async play(leadSec = 0): Promise<void> {
    if (!this.buffer || this._state === "playing") return;
    // 모바일 브라우저는 사용자 터치 안에서 resume해야 소리가 난다
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (this._state === "ended") this.startOffset = 0;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.output);
    source.onended = () => {
      if (this.source !== source) return; // pause/seek로 멈춘 경우
      this.source = null;
      this.startOffset = this.duration;
      this._state = "ended";
      this.onEnded?.();
    };
    this.startedAt = this.ctx.currentTime + START_LEAD_SEC + leadSec;
    source.start(this.startedAt, this.startOffset);
    this.source = source;
    this.lastReported = this.startOffset;
    this._state = "playing";
  }

  pause(): void {
    if (this._state !== "playing") return;
    this.startOffset = Math.max(0, this.time());
    this.stopSource();
    this._state = "paused";
  }

  seek(sec: number): void {
    const wasPlaying = this._state === "playing";
    this.stopSource();
    this.startOffset = Math.min(Math.max(0, sec), this.duration);
    this.lastReported = this.startOffset;
    this._state = "paused";
    if (wasPlaying) void this.play();
  }

  /** 지금 스피커에서 나오고 있는 곡 위치(초). 재생 예약 직후에는 음수가 될 수 있다. */
  time(): number {
    if (this._state !== "playing") return this.startOffset;
    const t = this.outputContextTime() - this.startedAt + this.startOffset;
    // 시계가 뒤로 가면 노트가 떨리므로 앞으로만 움직이게 한다 (재생 시작 직후는 예외)
    if (t > this.startOffset && t < this.lastReported) return this.lastReported;
    this.lastReported = t;
    return t;
  }

  /**
   * 실제로 소리가 나오는 시점의 AudioContext 시각.
   * currentTime은 오디오 버퍼 단위로 뚝뚝 끊겨 올라가고 출력 지연도 빠져 있어서,
   * 가능하면 getOutputTimestamp()와 performance.now()로 보간한다.
   */
  private outputContextTime(): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime && ts.performanceTime) {
      return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  private stopSource(): void {
    if (!this.source) return;
    const s = this.source;
    this.source = null;
    try {
      s.stop();
    } catch {
      // 이미 멈춘 소스
    }
    s.disconnect();
  }
}
