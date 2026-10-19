'use strict';
/**
 * Per-conversation ownership write lock.
 * Callers inside the lock may write. A public comment attempted while the
 * lock is held by someone else is not authorized.
 */

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const pending = new Map();

function withOwnershipWriteLock(conversationId, fn) {
  const id = String(conversationId);
  const before = pending.get(id) || Promise.resolve();
  const run = before.catch(() => {}).then(() => {
    const next = new Set(als.getStore() || []);
    next.add(id);
    return als.run(next, fn);
  });
  const settled = run.then(() => {}, () => {});
  pending.set(id, settled);
  settled.then(() => {
    if (pending.get(id) === settled) pending.delete(id);
  });
  return run;
}

function commentBlocked(conversationId) {
  const id = String(conversationId || '');
  if (!id || !pending.has(id)) return false;
  const store = als.getStore();
  return !(store && store.has(id));
}

module.exports = {
  withOwnershipWriteLock,
  commentBlocked,
};
