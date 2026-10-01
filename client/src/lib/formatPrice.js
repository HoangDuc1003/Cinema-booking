// The site's currency symbol (VITE_CURRENCY), shared so every page agrees.
// `?.` because plain Node (the unit tests) has no import.meta.env.
export const CURRENCY = import.meta.env?.VITE_CURRENCY || '$';

// Money as the server charges it: rounded to the cent, with cents shown only
// when there are some - $10, $7.50, never $7.5, $19.485 or $0.30000000000000004.
export const formatPrice = (amount, currency = CURRENCY) => {
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents)) return `${currency}0`;
  return `${currency}${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
};

export default formatPrice;
