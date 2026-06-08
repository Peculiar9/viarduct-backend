const MONTH_ABBR: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12'
};

/**
 * Normalize DOB strings to YYYY-MM-DD for comparison.
 * Supports ISO, DD-MMM-YYYY (Prembly BVN), DD-MM-YYYY (NIN), and common slash formats.
 */
export function normalizeDateOfBirthToIso(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const dMonY = trimmed.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/i);
  if (dMonY) {
    const monthKey = dMonY[2].toLowerCase().slice(0, 3);
    const month = MONTH_ABBR[monthKey];
    if (month) {
      return `${dMonY[3]}-${month}-${dMonY[1].padStart(2, '0')}`;
    }
  }

  const dmy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function datesOfBirthMatch(declared: string, fromProvider: string): boolean {
  const a = normalizeDateOfBirthToIso(declared);
  const b = normalizeDateOfBirthToIso(fromProvider);
  if (!a || !b) {
    return false;
  }
  return a === b;
}
