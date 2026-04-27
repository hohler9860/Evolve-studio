// Unit tests for lib/compliance.js — pure logic, no env, no DB hits.
//
// Usage: node --test tests/compliance.test.js
//        npm test

const { test } = require('node:test');
const assert = require('node:assert');
const {
  isWithinCallingHours,
  containsRecordingOptOut,
  containsFullOptOut,
  verifyOpeningDisclosure,
} = require('../lib/compliance');

// =============================================================================
// hours gate
// =============================================================================

test('hours gate — Mon 10am ET = ok', () => {
  // Mar 30 2026 is a Monday. 14:00 UTC = 10am EDT (DST in effect).
  // Use deterministic ISO so this passes regardless of where it runs.
  const r = isWithinCallingHours(new Date('2026-03-30T14:00:00Z'));
  assert.equal(r.ok, true);
});

test('hours gate — Mon 8:30am ET = blocked (before 9)', () => {
  const r = isWithinCallingHours(new Date('2026-03-30T12:30:00Z')); // 8:30am EDT
  assert.equal(r.ok, false);
  assert.match(r.reason, /before 9am/);
});

test('hours gate — Mon 5:30pm ET = blocked (after 5)', () => {
  const r = isWithinCallingHours(new Date('2026-03-30T21:30:00Z')); // 5:30pm EDT
  assert.equal(r.ok, false);
  assert.match(r.reason, /after 5pm/);
});

test('hours gate — Saturday = blocked', () => {
  const r = isWithinCallingHours(new Date('2026-04-04T16:00:00Z')); // Sat 12pm EDT
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'weekend');
});

test('hours gate — federal holiday = blocked', () => {
  // 2026-07-04 is Saturday so it gets caught as weekend; use 07-03 (observed) which is in our list
  const r = isWithinCallingHours(new Date('2026-07-03T16:00:00Z'));
  assert.equal(r.ok, false);
  assert.match(r.reason, /federal holiday|weekend/);
});

// =============================================================================
// opt-out detection
// =============================================================================

test('recording opt-out — "do not record"', () => {
  assert.equal(containsRecordingOptOut('please do not record this call'), true);
});

test('recording opt-out — case insensitive', () => {
  assert.equal(containsRecordingOptOut('STOP RECORDING'), true);
});

test('recording opt-out — clean text', () => {
  assert.equal(containsRecordingOptOut('hi sure go ahead'), false);
});

test('full opt-out — "take me off your list"', () => {
  assert.equal(containsFullOptOut('take me off your list please'), true);
});

test('full opt-out — "do not call"', () => {
  assert.equal(containsFullOptOut('please do not call me again'), true);
});

test('full opt-out — clean text', () => {
  assert.equal(containsFullOptOut('sounds great schedule it'), false);
});

// =============================================================================
// disclosure verification
// =============================================================================

test('disclosure — proper AI + recording opener detected', () => {
  const transcript = "Hi, this is an AI assistant calling on behalf of Henry at Evolve Studio. This call is recorded — got 30 seconds for a quick question?";
  const r = verifyOpeningDisclosure(transcript);
  assert.equal(r.ai, true);
  assert.equal(r.recording, true);
});

test('disclosure — missing AI mention fails', () => {
  const transcript = "Hi, this is Henry from Evolve Studio. This call is recorded.";
  const r = verifyOpeningDisclosure(transcript);
  assert.equal(r.ai, false);
});

test('disclosure — missing recording fails', () => {
  const transcript = "Hi, this is an AI assistant from Evolve Studio. Got a sec?";
  const r = verifyOpeningDisclosure(transcript);
  assert.equal(r.recording, false);
});

test('disclosure — empty transcript', () => {
  const r = verifyOpeningDisclosure('');
  assert.equal(r.ai, false);
  assert.equal(r.recording, false);
});

test('disclosure — only checks first 1200 chars (opening must be at start)', () => {
  // Disclosure buried at end shouldn't count
  const transcript = 'Hi, just calling about your business today.\n'.repeat(50)
    + 'AI assistant. This call is recorded.';
  const r = verifyOpeningDisclosure(transcript);
  assert.equal(r.ai, false);
  assert.equal(r.recording, false);
});
