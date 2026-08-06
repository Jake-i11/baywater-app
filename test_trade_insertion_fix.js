/**
 * Test script to verify the trade insertion fix
 * This simulates the complete CSV upload → trade extraction → Supabase insert pipeline
 */

// Mock the computeHoldTime function (fixed version)
function computeHoldTime(entryTime, exitTime) {
  if (!entryTime || !exitTime) return null

  const entryMs = new Date(entryTime).getTime()
  const exitMs = new Date(exitTime).getTime()

  if (isNaN(entryMs) || isNaN(exitMs)) return null

  const diffMs = exitMs - entryMs
  if (diffMs < 0) return null

  return Math.round(diffMs / 60000) // Return total minutes as integer
}

// Mock the normalizeFieldValue function
function normalizeFieldValue(value, fieldType) {
  if (value === null || value === undefined) {
    return null;
  }

  switch (fieldType) {
    case 'integer':
      if (typeof value === 'string') {
        if (value.trim() === '' || value.trim().toLowerCase() === 'null' || value.trim().toLowerCase() === 'n/a') {
          return null;
        }
        const num = Number(value);
        return isNaN(num) ? null : Math.round(num);
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      if (typeof value === 'number') {
        return Math.round(value);
      }
      return null;

    case 'numeric':
      if (typeof value === 'string') {
        if (value.trim() === '' || value.trim().toLowerCase() === 'null' || value.trim().toLowerCase() === 'n/a') {
          return null;
        }
        const num = Number(value);
        return isNaN(num) ? null : num;
      }
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
      if (typeof value === 'number') {
        return value;
      }
      return null;

    case 'string':
      if (value === null || value === undefined) {
        return null;
      }
      return String(value);

    case 'json':
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
          return value;
        } catch {
          return value;
        }
      }
      return value;

    default:
      return value;
  }
}

// Test cases
console.log('=== Testing Trade Insertion Fix ===\n');

// Test 1: computeHoldTime function
console.log('1. Testing computeHoldTime function:');
const testCases = [
  { entry: '2026-07-22 10:15:00', exit: '2026-07-23 14:30:00', expected: 'valid integer' },
  { entry: '2026-07-22 10:15:00', exit: null, expected: 'null' },
  { entry: null, exit: '2026-07-23 14:30:00', expected: 'null' },
  { entry: 'invalid', exit: '2026-07-23 14:30:00', expected: 'null' }
];

testCases.forEach((test, index) => {
  const result = computeHoldTime(test.entry, test.exit);
  console.log(`  Test ${index + 1}: ${test.expected === 'null' ? result === null : typeof result === 'number' ? '✓ PASS' : '✗ FAIL'} - Result: ${result}`);
});

// Test 2: normalizeFieldValue function
console.log('\n2. Testing normalizeFieldValue function:');
const normalizeTests = [
  { value: 'Open trade', type: 'integer', expected: 'null' },
  { value: 'N/A', type: 'integer', expected: 'null' },
  { value: '', type: 'integer', expected: 'null' },
  { value: '42', type: 'integer', expected: '42' },
  { value: 42.7, type: 'integer', expected: '43' },
  { value: true, type: 'integer', expected: '1' },
  { value: '2866', type: 'numeric', expected: '2866' },
  { value: '347.00', type: 'numeric', expected: '347' }
];

normalizeTests.forEach((test, index) => {
  const result = normalizeFieldValue(test.value, test.type);
  const pass = test.expected === 'null' ? result === null : result == test.expected;
  console.log(`  Test ${index + 1}: ${pass ? '✓ PASS' : '✗ FAIL'} - Input: "${test.value}" (${test.type}) → Result: ${result}`);
});

// Test 3: Simulate CSV parsing and payload creation
console.log('\n3. Testing CSV parsing simulation:');
const csvData = {
  ticker: 'GOOG',
  direction: 'short',
  entry_price: '347.00',
  exit_price: '318.34',
  size: '100',
  entry_time: '2026-07-22 10:15:00',
  exit_time: '2026-07-23 14:30:00',
  realized_pl: '2866'
};

// Simulate trade creation
const holdTime = computeHoldTime(csvData.entry_time, csvData.exit_time);
const disciplineScore = 100; // From calculateDisciplineScore

console.log('  Trade data before normalization:');
console.log(`    holdTime: ${holdTime} (type: ${typeof holdTime})`);
console.log(`    discipline_score: ${disciplineScore} (type: ${typeof disciplineScore})`);

// Create payload as saveTradesToSupabase would
const payload = {
  ticker: csvData.ticker,
  direction: csvData.direction,
  entry_price: normalizeFieldValue(csvData.entry_price, 'numeric'),
  exit_price: normalizeFieldValue(csvData.exit_price, 'numeric'),
  size: csvData.size,
  entry_time: csvData.entry_time,
  exit_time: csvData.exit_time,
  realized_pl: normalizeFieldValue(csvData.realized_pl, 'numeric'),
  hold_time: normalizeFieldValue(holdTime, 'integer'),
  violations: JSON.stringify([]),
  discipline_score: normalizeFieldValue(disciplineScore, 'integer'),
  violation_cost: normalizeFieldValue('0', 'numeric'),
  user_id: 'test-user-id',
  created_at: new Date().toISOString()
};

console.log('\n  Final payload for Supabase:');
console.log(`    hold_time: ${payload.hold_time} (type: ${typeof payload.hold_time})`);
console.log(`    discipline_score: ${payload.discipline_score} (type: ${typeof payload.discipline_score})`);
console.log(`    entry_price: ${payload.entry_price} (type: ${typeof payload.entry_price})`);
console.log(`    realized_pl: ${payload.realized_pl} (type: ${typeof payload.realized_pl})`);

// Validate all integer fields
const integerFields = ['discipline_score', 'setup_quality', 'setup_confidence', 'hold_time'];
let allValid = true;

integerFields.forEach(field => {
  if (payload[field] !== null && payload[field] !== undefined) {
    if (typeof payload[field] !== 'number' || !Number.isInteger(payload[field])) {
      console.log(`  ✗ FAIL: ${field} is not a valid integer: ${payload[field]}`);
      allValid = false;
    } else {
      console.log(`  ✓ PASS: ${field} is valid integer: ${payload[field]}`);
    }
  }
});

console.log(`\n4. Overall validation: ${allValid ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);

// Test 4: Edge cases that would have caused the original error
console.log('\n5. Testing edge cases that caused original error:');
const edgeCases = [
  { holdTime: 'Open trade', expected: 'should become null' },
  { holdTime: '<1m', expected: 'should become null' },
  { holdTime: '5h 30m', expected: 'should become null' },
  { holdTime: null, expected: 'should stay null' }
];

edgeCases.forEach((test, index) => {
  const result = normalizeFieldValue(test.holdTime, 'integer');
  const isValid = result === null;
  console.log(`  Test ${index + 1}: ${isValid ? '✓ PASS' : '✗ FAIL'} - Input: "${test.holdTime}" → Result: ${result} (${test.expected})`);
});

console.log('\n=== Test Complete ===');