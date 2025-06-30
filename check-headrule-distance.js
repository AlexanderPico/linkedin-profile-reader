// Quick calculation for Karamarie's headrule distance with -3 spacing
const headruleY = 46.932;  // Page 1
const headerY = 51.932;    // Page 2 (original position)
const spacing = -3;
const tolerance = 2.0;

const normalizedHeaderY = headerY + spacing;
const distance = normalizedHeaderY - headruleY;

console.log('🔍 Headrule Distance Analysis with -3 Spacing');
console.log('=' .repeat(50));
console.log(`Headrule (page 1): ${headruleY}`);
console.log(`Header (page 2): ${headerY} + ${spacing} = ${normalizedHeaderY}`);
console.log(`Distance: ${distance} units`);
console.log(`Tolerance: ${tolerance} units`);
console.log(`Within tolerance? ${distance <= tolerance ? '✅ YES' : '❌ NO'}`);

if (distance <= tolerance) {
  console.log('\n🎉 Special headrule handling can be REMOVED!');
} else {
  console.log('\n⚠️ Special headrule handling still needed.');
} 