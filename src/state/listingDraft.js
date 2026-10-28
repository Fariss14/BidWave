// IndexedDB preserves uploaded photos as well as partial fields without localStorage's size limit.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bidwave-listing-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function accessDraft(userId, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', value === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('drafts');
      const request = value === undefined ? store.get(userId) : value === null ? store.delete(userId) : store.put(value, userId);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

// Keep reads, autosaves, and deletion after publishing in the order requested.
let pending = Promise.resolve();
export function listingDraft(userId, value) {
  const operation = pending.then(() => accessDraft(userId, value));
  pending = operation.catch(() => {});
  return operation;
}
