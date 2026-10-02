/**
 * Precision and Rounding Policy
 *
 * POLICY:
 * 1. Internal calculations maintain full 64-bit IEEE 754 floating-point precision.
 * 2. Intermediate results are never rounded prematurely to prevent cumulative rounding drift.
 * 3. Rounding is applied only at the final calculation/presentation boundary.
 * 4. To avoid floating-point binary representation errors (e.g., 1.005 * 100 = 100.49999999999999),
 *    we use `Number.EPSILON` before rounding.
 * 5. Default presentation precisions:
 *    - SGPA / CGPA: 2 decimal places (e.g. 8.75)
 *    - Attendance Percentage: 2 decimal places (e.g. 81.25)
 *    - Discrete class counts: Integers (bunk buffer uses floor, catch-up uses ceil)
 */

export const DEFAULT_GPA_DECIMALS = 2;
export const DEFAULT_PERCENTAGE_DECIMALS = 2;

/**
 * Safely rounds a floating-point number to a specified number of decimal places.
 * Uses Number.EPSILON to guarantee correct half-up mathematical rounding.
 */
export function roundToDecimals(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Formats a number to a fixed decimal string representation (e.g. 8.9 -> "8.90").
 */
export function formatDecimal(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return roundToDecimals(value, decimals).toFixed(decimals);
}
