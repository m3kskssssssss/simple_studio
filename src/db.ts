/**
 * Локальное хранилище приложения (IndexedDB):
 *  - files    — файлы пользователя: звук, фото, видео (ключ — id ассета);
 *  - projects — проекты (ключ — id проекта).
 * Работает и в браузере, и в собранном .exe (данные лежат в профиле приложения).
 */
const DB_NAME = 'simple-studio';
const VERSION = 2;
export type StoreName = 'audio' | 'projects';

let dbp: Promise<IDBDatabase> | null = null;

export function idb(): Promise<IDBDatabase> {
  if (!dbp)
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // 'audio' — историческое имя хранилища файлов (там же фото и видео)
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  return dbp;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(store: StoreName, key: string, value: unknown) {
  const db = await idb();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value, key));
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await idb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbDelete(store: StoreName, key: string) {
  const db = await idb();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export async function idbAll<T>(store: StoreName): Promise<T[]> {
  const db = await idb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  const db = await idb();
  return wrap(db.transaction(store).objectStore(store).getAllKeys()) as Promise<string[]>;
}
