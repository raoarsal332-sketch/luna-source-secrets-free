'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const handoff = require('./fixedMessageHandoff');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('PASS', name);
}

const IDS = { arsalId: 'seat-a', eliteAiId: 'seat-e' };

function finPart(extra) {
  return Object.assign(
    {
      part_type: 'comment',
      author: { id: 'seat-e', type: 'bot', name: 'Elite AI' },
      body: 'Connecting you to a teammate.',
      created_at: 100,
    },
    extra || {}
  );
}

test('status is frozen, unapproved, and not a behavior change', () => {
  assert.strictEqual(handoff.STATUS.approved, false);
  assert.strictEqual(handoff.STATUS.frozen, true);
  assert.strictEqual(handoff.STATUS.release, false);
  assert.strictEqual(handoff.STATUS.behaviorChange, false);
});

test('welcome lines match the runtime source', () => {
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../01_runtime/index.js'), 'utf8');
  const start = indexSrc.indexOf('function lockedFinHandoffWelcome');
  const end = indexSrc.indexOf('function syncEscalateTeammateFirstState');
  const block = indexSrc.slice(start, end);
  const candidate = fs.readFileSync(path.join(__dirname, 'fixedMessageHandoff.js'), 'utf8');
  for (const line of block.split('\n')) {
    if (!line.includes('return ')) continue;
    assert.ok(candidate.includes(line.trim()), line.trim());
  }
});

test('vague live-agent ask sends the English fixed welcome', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: 'live agent please', clientName: '' }, IDS)
  );
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, 'Hello, how can I help?');
  assert.strictEqual(result.approved, false);
  assert.strictEqual(result.silent, false);
});

test('Fin handoff plus hi sends the fixed welcome', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: 'hi', parts: [finPart()], clientName: 'Sara Khan' }, IDS)
  );
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, 'Hello Sara, how can I help?');
});

test('Bot test placeholder is not used as a name', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: 'help please', parts: [finPart()], clientName: 'Bot test' }, IDS)
  );
  assert.strictEqual(result.message, 'Hello, how can I help?');
});

test('Arabic-script vague handoff uses the runtime Urdu welcome', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: 'live agent مرحبا', clientName: '' }, IDS)
  );
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, 'السلام علیکم، میں آپ کی کیا مدد کر سکتا ہوں؟');
});

test('Italian greeting after Fin handoff uses the runtime Italian welcome', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: 'ciao', parts: [finPart()], clientName: 'Giulia' }, IDS)
  );
  assert.strictEqual(result.message, 'Ciao Giulia, come posso aiutarti?');
});

test('Hinglish cue after a live-agent phrase uses the runtime Salam welcome', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: 'salam live agent', clientName: '' }, IDS)
  );
  assert.strictEqual(result.message, 'Salam, main aap ki kis cheez mein madad kar sakta hoon?');
});

test('a substantive question does not take the fixed welcome', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign(
      {
        latestText: 'Why was my payout rejected after the consistency check on account 219876?',
        parts: [finPart()],
        clientName: 'Sara',
      },
      IDS
    )
  );
  assert.strictEqual(result.action, 'allow');
  assert.strictEqual(result.message, null);
});

test('Arsal public reply closes the gate', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign(
      {
        latestText: 'hi',
        parts: [
          finPart(),
          { part_type: 'comment', author: { id: 'seat-a', type: 'admin' }, body: 'Hello Sara, how can I help?' },
        ],
      },
      IDS
    )
  );
  assert.strictEqual(result.action, 'allow');
});

test('a human teammate public reply closes the gate', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign(
      {
        latestText: 'live agent please',
        parts: [
          {
            part_type: 'comment',
            author: { id: 'human-1', type: 'admin', name: 'Teammate' },
            body: 'I will take this from here.',
          },
        ],
      },
      IDS
    )
  );
  assert.strictEqual(result.action, 'allow');
});

test('a handoff phrase in a note does not open the gate', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign(
      {
        latestText: 'hi',
        parts: [finPart({ part_type: 'note' })],
      },
      IDS
    )
  );
  assert.strictEqual(result.action, 'allow');
});

test('live-agent ask after the last Elite comment opens the gate for a later hi', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign(
      {
        latestText: 'hi',
        parts: [
          {
            part_type: 'comment',
            author: { id: 'seat-e', type: 'bot', name: 'Elite AI' },
            body: 'Hello',
            created_at: 100,
          },
          {
            part_type: 'comment',
            author: { id: 'user-1', type: 'user' },
            body: 'I need a live agent',
            created_at: 200,
          },
        ],
      },
      IDS
    )
  );
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, 'Hello, how can I help?');
});

test('a live-agent ask before the last Elite comment does not open the gate', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign(
      {
        latestText: 'hi',
        parts: [
          {
            part_type: 'comment',
            author: { id: 'user-1', type: 'user' },
            body: 'I need a live agent',
            created_at: 100,
          },
          {
            part_type: 'comment',
            author: { id: 'seat-e', type: 'bot', name: 'Elite AI' },
            body: 'Hello',
            created_at: 300,
          },
        ],
      },
      IDS
    )
  );
  assert.strictEqual(result.action, 'allow');
});

test('empty text stays vague when a Fin handoff is already in history', () => {
  const result = handoff.decideFixedMessageHandoff(
    Object.assign({ latestText: '', parts: [finPart()] }, IDS)
  );
  assert.strictEqual(result.action, 'fixed_message');
  assert.strictEqual(result.message, 'Hello, how can I help?');
});

test('module does not embed production seats or call Intercom', () => {
  const src = fs.readFileSync(path.join(__dirname, 'fixedMessageHandoff.js'), 'utf8');
  assert.ok(!/10118526|8052954|8053416|9378750/.test(src));
  assert.ok(!/api\.intercom|process\.env|child_process|require\(['"]fs['"]\)/.test(src));
});

console.log('fixed-message-handoff-r2', passed, 'passed');
