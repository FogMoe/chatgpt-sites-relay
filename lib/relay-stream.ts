export type LimitedBodyResult =
  | { ok: true; body: Uint8Array }
  | {
      ok: false;
      reason: "invalid_utf8" | "read_error" | "timeout" | "too_large";
    };

export function createLimitedResponseStream(
  source: ReadableStream<Uint8Array>,
  maxBytes: number,
  timeoutMs: number,
  upstreamAbort: AbortController,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let totalBytes = 0;
  let finished = false;
  let timeout: ReturnType<typeof setTimeout>;

  const clearResponseTimeout = (): void => {
    if (timeout) clearTimeout(timeout);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      timeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        upstreamAbort.abort();
        controller.error(
          new Error("The upstream response exceeded the relay time limit."),
        );
        void reader
          .cancel("The upstream response exceeded the relay time limit.")
          .catch(() => undefined);
      }, timeoutMs);
      (
        timeout as unknown as { unref?: () => void }
      ).unref?.();
    },
    async pull(controller) {
      if (finished) return;
      try {
        const { done, value } = await reader.read();
        if (finished) return;
        if (done) {
          finished = true;
          clearResponseTimeout();
          controller.close();
          return;
        }

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          finished = true;
          clearResponseTimeout();
          upstreamAbort.abort();
          controller.error(
            new Error("The upstream response exceeded the relay byte limit."),
          );
          void reader
            .cancel("The upstream response exceeded the relay byte limit.")
            .catch(() => undefined);
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        if (finished) return;
        finished = true;
        clearResponseTimeout();
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (finished) return;
      finished = true;
      clearResponseTimeout();
      upstreamAbort.abort();
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export async function readLimitedUtf8Body(
  source: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  timeoutMs: number,
  upstreamAbort: AbortController,
): Promise<LimitedBodyResult> {
  if (!source) return { ok: true, body: new Uint8Array() };

  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    upstreamAbort.abort();
    void reader
      .cancel("The upstream response exceeded the relay time limit.")
      .catch(() => undefined);
  }, timeoutMs);
  (
    timeout as unknown as { unref?: () => void }
  ).unref?.();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) return { ok: false, reason: "timeout" };
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        upstreamAbort.abort();
        await reader.cancel(
          "The upstream response exceeded the relay byte limit.",
        );
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      reason: timedOut ? "timeout" : "read_error",
    };
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return { ok: false, reason: "invalid_utf8" };
  }
  return { ok: true, body };
}
