'use strict';
/** Builders for synthetic Intercom conversations. All ids/names are synthetic. */
const ARSAL = '10118526';
const AUTH_ADMIN = '777001';
let seq = 100;
const now = () => Math.floor(Date.now() / 1000);

function userPart(text, at, id) {
  return { id: id || 'u' + (++seq), type: 'conversation_part', part_type: 'comment', body: '<p>' + text + '</p>', created_at: at || now() - 60, author: { type: 'user', id: 'user-1', name: 'Test Client', email: 'client@example.invalid' } };
}
function notePart(text, authorId, at, id) {
  return { id: id || 'n' + (++seq), type: 'conversation_part', part_type: 'note', body: '<p>' + text + '</p>', created_at: at || now() - 30, author: { type: 'admin', id: authorId || AUTH_ADMIN, name: 'Synthetic Teammate' } };
}
function conversation(id, parts, extra) {
  return Object.assign({
    id: String(id), type: 'conversation', state: 'open', created_at: now() - 600, updated_at: now() - 30,
    admin_assignee_id: null, team_assignee_id: null,
    source: { type: 'conversation', id: 's' + id, delivered_as: 'customer_initiated', body: '<p>hello</p>', author: { type: 'user', id: 'user-1', name: 'Test Client', email: 'client@example.invalid' }, created_at: now() - 600 },
    contacts: { type: 'contact.list', contacts: [{ type: 'contact', id: 'user-1' }] },
    conversation_parts: { type: 'conversation_part.list', conversation_parts: parts || [] },
  }, extra || {});
}
module.exports = { ARSAL, AUTH_ADMIN, userPart, notePart, conversation };
