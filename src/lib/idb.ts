const DB_NAME = 'poc-offline-sync'
const DB_VERSION = 1

export const STORE_PEDIDOS = 'pedidos'
export const STORE_FILA = 'fila'

let dbPromise: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_PEDIDOS)) {
        db.createObjectStore(STORE_PEDIDOS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_FILA)) {
        db.createObjectStore(STORE_FILA, { keyPath: 'opId' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB bloqueada por outra aba'))
  })

  return dbPromise
}

function transacao<T>(
  store: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, modo)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'))
      }),
  )
}

export function listar<T>(store: string): Promise<T[]> {
  return transacao<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export function salvar(store: string, valor: unknown): Promise<IDBValidKey> {
  return transacao(store, 'readwrite', (s) => s.put(valor))
}

export function remover(store: string, chave: IDBValidKey): Promise<undefined> {
  return transacao(store, 'readwrite', (s) => s.delete(chave) as IDBRequest<undefined>)
}

export function limpar(store: string): Promise<undefined> {
  return transacao(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>)
}
