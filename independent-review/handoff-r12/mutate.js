'use strict';

const fs = require('fs');
const path = require('path');

function remotePath(stateDir) {
  return path.join(stateDir, 'remote.json');
}

function loadRemote(stateDir) {
  try {
    return JSON.parse(fs.readFileSync(remotePath(stateDir), 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveRemote(stateDir, remote) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(remotePath(stateDir), JSON.stringify(remote));
}

function applyMutation(stateDir, action) {
  if (!action || action === 'restart') return { action: action || 'noop' };
  const ops = path.join(stateDir, 'ops.json');
  if (action === 'wipe-ops') {
    fs.rmSync(ops, { force: true });
    return { action };
  }
  if (action === 'corrupt-ops') {
    fs.writeFileSync(ops, '{');
    return { action };
  }
  const remote = loadRemote(stateDir);
  const ids = Object.keys(remote);
  if (action === 'drop-note') {
    for (const id of ids) {
      const conv = remote[id];
      const parts = conv.conversation_parts.conversation_parts;
      conv.conversation_parts.conversation_parts = parts.filter((p) => p.part_type !== 'note');
    }
    saveRemote(stateDir, remote);
    return { action };
  }
  if (action === 'foreign-assignee') {
    for (const id of ids) remote[id].admin_assignee_id = '7000007';
    saveRemote(stateDir, remote);
    return { action };
  }
  if (action === 'human-comment') {
    for (const id of ids) {
      const conv = remote[id];
      conv.conversation_parts.conversation_parts.push({
        id: 'human-took-' + id,
        part_type: 'comment',
        body: 'I have this ticket from here.',
        created_at: Math.floor(Date.now() / 1000),
        author: { type: 'admin', id: '7000007', name: 'Human Seven', email: 'human7@example.test' },
      });
    }
    saveRemote(stateDir, remote);
    return { action };
  }
  if (action === 'clear-ticket-progress') {
    const tickets = path.join(stateDir, 'tickets.json');
    fs.writeFileSync(tickets, '{}');
    return { action };
  }
  throw new Error('unknown mutation ' + action);
}

module.exports = { remotePath, loadRemote, saveRemote, applyMutation };
