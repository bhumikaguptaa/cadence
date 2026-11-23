/** Insert thousands separators into a plain integer string: "1234567" -> "1,234,567". Display only (en-US). */
export function groupThousands(integerDigits: string): string {
  if (!/^\d+$/.test(integerDigits)) throw new Error('groupThousands expects digits only');
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
