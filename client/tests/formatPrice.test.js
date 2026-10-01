import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPrice } from '../src/lib/formatPrice.js';

test('whole amounts have no decimals and fractional ones show both cents', () => {
  assert.equal(formatPrice(10), '$10');
  assert.equal(formatPrice(7.5), '$7.50');
  assert.equal(formatPrice(22.5), '$22.50');
  assert.equal(formatPrice(0.05), '$0.05');
});

test('amounts are rounded to the cent the way the server charges them', () => {
  assert.equal(formatPrice(12.99 * 1.5), '$19.49');
  assert.equal(formatPrice(0.1 + 0.2), '$0.30');
  assert.equal(formatPrice(9.999), '$10');
});

test('a configured currency symbol replaces the dollar sign', () => {
  assert.equal(formatPrice(7.5, '€'), '€7.50');
  assert.equal(formatPrice('15', '₫'), '₫15');
});

test('a missing or broken amount never prints NaN or undefined', () => {
  assert.equal(formatPrice(undefined), '$0');
  assert.equal(formatPrice('abc'), '$0');
});
