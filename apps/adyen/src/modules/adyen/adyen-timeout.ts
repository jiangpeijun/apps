export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// Saleor 同步 Webhook 上限 20s，Adyen 调用限制 15s
export const ADYEN_TIMEOUT_MS = 15_000;
// Saleor API 调用限制 5s
export const SALEOR_TIMEOUT_MS = 5_000;