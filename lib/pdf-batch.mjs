export async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const count = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  await Promise.all(Array.from({ length: count }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

export async function requestBrowserNotificationPermission() {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "default") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notifyBatchReady(title, body) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  new Notification(title, { body, icon: "/icon.svg", tag: "mesa-pdf-import" });
  return true;
}
