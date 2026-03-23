import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseNumberString(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/,/g, '');
  if (clean.endsWith('M')) return parseFloat(clean) * 1000000;
  if (clean.endsWith('K')) return parseFloat(clean) * 1000;
  return parseInt(clean, 10) || 0;
}

export function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseNumberString(num) : num;
  return new Intl.NumberFormat('en-US').format(n);
}
