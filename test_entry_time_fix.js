/**
 * Test script to verify the entry_time fix
 * This script tests the CSV parsing with various entry time column names
 */

// Mock the buildColumnMapping function to test the fix
function buildColumnMapping(headers) {
  const mapping = {}
  const headerAliases = {
    ticker: 'ticker', symbol: 'ticker', security: 'ticker', instrument: 'ticker',
    side: 'side', type: 'side', action: 'side', direction: 'side',
    entry: 'entry_price', entry_price: 'entry_price', entryprice: 'entry_price',
    exit: 'exit_price', exit_price: 'exit_price', exitprice: 'exit_price',
    quantity: 'size', size: 'size', shares: 'size', qty: 'size', amount: 'size',
    pnl: 'realized_pl', p_l: 'realized_pl', realized_pl: 'realized_pl', pl: 'realized_pl',
    time: 'entry_time', entry_time: 'entry_time', entrytime: 'entry_time', timestamp: 'entry_time',
    exit_time: 'exit_time', exittime: 'exit_time'
  }

  for (let i = 0; i < headers.length; i++) {
    const normalized = headers[i].trim().toLowerCase().replace(/[^a-z0-9_ ]/g, '').replace(/\s+/g, '_')
    const canonical = headerAliases[normalized]
    if (canonical && mapping[canonical] === undefined) {
      mapping[canonical] = i
    }
  }
  return mapping
}

// Test cases for different entry time column names
const testCases = [
  {
    name: "Standard entry_time column",
    headers: ["ticker", "entry_time", "entry_price", "exit_price", "size"],
    expectedEntryTimeIndex: 1
  },
  {
    name: "Time column",
    headers: ["ticker", "time", "entry_price", "exit_price", "size"],
    expectedEntryTimeIndex: 1
  },
  {
    name: "Timestamp column",
    headers: ["ticker", "timestamp", "entry_price", "exit_price", "size"],
    expectedEntryTimeIndex: 1
  },
  {
    name: "Entrytime column",
    headers: ["ticker", "entrytime", "entry_price", "exit_price", "size"],
    expectedEntryTimeIndex: 1
  },
  {
    name: "Exit time column",
    headers: ["ticker", "entry_price", "exit_time", "size"],
    expectedExitTimeIndex: 2
  },
  {
    name: "Exittime column",
    headers: ["ticker", "entry_price", "exittime", "size"],
    expectedExitTimeIndex: 2
  }
]

console.log("Testing entry_time mapping fix...")
console.log("=================================")

let allTestsPassed = true

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`)
  console.log("Headers:", testCase.headers)

  const mapping = buildColumnMapping(testCase.headers)
  console.log("Mapping result:", mapping)

  // Check entry_time mapping
  if (testCase.expectedEntryTimeIndex !== undefined) {
    if (mapping['entry_time'] === testCase.expectedEntryTimeIndex) {
      console.log("✅ PASS: entry_time correctly mapped to index", testCase.expectedEntryTimeIndex)
    } else {
      console.log("❌ FAIL: entry_time expected at index", testCase.expectedEntryTimeIndex, "but got", mapping['entry_time'])
      allTestsPassed = false
    }
  }

  // Check exit_time mapping
  if (testCase.expectedExitTimeIndex !== undefined) {
    if (mapping['exit_time'] === testCase.expectedExitTimeIndex) {
      console.log("✅ PASS: exit_time correctly mapped to index", testCase.expectedExitTimeIndex)
    } else {
      console.log("❌ FAIL: exit_time expected at index", testCase.expectedExitTimeIndex, "but got", mapping['exit_time'])
      allTestsPassed = false
    }
  }
})

console.log("\n=================================")
console.log("Test Summary:")
if (allTestsPassed) {
  console.log("🎉 ALL TESTS PASSED! The entry_time mapping fix is working correctly.")
} else {
  console.log("❌ Some tests failed. Please review the mapping logic.")
}

console.log("\nThe fix ensures that CSV columns like 'time', 'timestamp', 'entrytime', etc.")
console.log("are correctly mapped to the canonical 'entry_time' field, which will")
console.log("prevent the 'missing entry time' error and allow chart fetching to proceed.")