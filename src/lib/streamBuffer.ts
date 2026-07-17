/**
 * Coalesce high-frequency stream chunks into rAF-paced React updates.
 * First token flushes immediately for snappy feedback.
 */

export type StreamPhase = "idle" | "waiting" | "thinking" | "writing" | "done";

type Listener = () => void;

export class StreamBuffer {
  private thought = "";
  private text = "";
  private thoughtId: string | null = null;
  private textId: string | null = null;
  private phase: StreamPhase = "idle";
  private startedAt = 0;
  private dirty = false;
  private raf = 0;
  private listeners = new Set<Listener>();
  private firstFlush = true;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  snapshot() {
    return {
      thought: this.thought,
      text: this.text,
      thoughtId: this.thoughtId,
      textId: this.textId,
      phase: this.phase,
      startedAt: this.startedAt,
      elapsedMs: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  begin(ids: { thoughtId: string; textId: string }): void {
    this.reset();
    this.thoughtId = ids.thoughtId;
    this.textId = ids.textId;
    this.phase = "waiting";
    this.startedAt = Date.now();
    this.firstFlush = true;
    this.emit();
  }

  appendThought(chunk: string): void {
    if (!chunk) return;
    this.thought += chunk;
    if (this.phase === "waiting" || this.phase === "idle") {
      this.phase = "thinking";
    }
    this.schedule();
  }

  appendText(chunk: string): void {
    if (!chunk) return;
    this.text += chunk;
    this.phase = "writing";
    this.schedule();
  }

  /** Force flush pending buffer into listeners now. */
  flush(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (!this.dirty && !this.firstFlush) {
      // still emit if phase waiting for timer UIs
      this.emit();
      return;
    }
    this.dirty = false;
    this.firstFlush = false;
    this.emit();
  }

  end(): { thought: string; text: string; thoughtId: string | null; textId: string | null } {
    this.phase = "done";
    this.flush();
    const out = {
      thought: this.thought,
      text: this.text,
      thoughtId: this.thoughtId,
      textId: this.textId,
    };
    return out;
  }

  reset(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.thought = "";
    this.text = "";
    this.thoughtId = null;
    this.textId = null;
    this.phase = "idle";
    this.startedAt = 0;
    this.dirty = false;
    this.firstFlush = true;
  }

  private schedule(): void {
    this.dirty = true;
    // First token: flush ASAP for perceived latency
    if (this.firstFlush) {
      this.flush();
      return;
    }
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.dirty) return;
      this.dirty = false;
      this.emit();
    });
  }
}

export const streamBuffer = new StreamBuffer();
