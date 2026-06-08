/** Keys that hold large base64 blobs — replaced in API debug output only */
const REDACTED_BASE64_KEYS = new Set(['photo', 'signature', 'base64Image', 'base64image']);

export type PremblyIdentityKind = 'BVN' | 'NIN';

const DOB_KEYS = [
  'birthdate',
  'birth_date',
  'birthday',
  'dateOfBirth',
  'date_of_birth',
  'dob'
] as const;

/**
 * Returns Prembly's full API body for client/debug use.
 * BVN: `data` (firstName, dateOfBirth, …).
 * NIN Basic / Advance: `data` and/or `nin_data` (birthdate, firstname, …).
 */
export function mapPremblyResponseForClient(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const clone = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  const redactDeep = (obj: Record<string, unknown>): void => {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        redactDeep(val as Record<string, unknown>);
      } else if (REDACTED_BASE64_KEYS.has(key) && typeof val === 'string' && val.length > 200) {
        obj[key] = '[redacted: base64 image omitted from API response]';
      }
    }
  };

  redactDeep(clone);
  return clone;
}

function asRecord(val: unknown): Record<string, unknown> | undefined {
  return val && typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : undefined;
}

function pickString(obj: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return undefined;
}

function pickDob(...blocks: Array<Record<string, unknown> | undefined>): string | undefined {
  for (const block of blocks) {
    const dob = pickString(block, ...DOB_KEYS);
    if (dob) return dob;
  }
  return undefined;
}

/** `data` block from NIN Basic / Advance (lowercase field names). */
function resolveNinDataBlock(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = asRecord(body.data);
  if (!data) return undefined;
  const looksLikeNin =
    data.nin != null ||
    data.birthdate != null ||
    data.firstname != null ||
    data.surname != null ||
    data.telephoneno != null;
  const looksLikeBvn = data.firstName != null || data.dateOfBirth != null || data.lastName != null;
  if (looksLikeNin && !looksLikeBvn) {
    return data;
  }
  return undefined;
}

/** Legacy / alternate: top-level `nin_data`. */
function resolveNinDataNested(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return (
    asRecord(body.nin_data) ||
    asRecord(body.Nin_data) ||
    asRecord(body.NIN_DATA) ||
    asRecord(asRecord(body.data)?.nin_data) ||
    asRecord(asRecord(body.data)?.Nin_data)
  );
}

/** Merged NIN identity payload (`data` + `nin_data`; `data` wins on conflicts). */
function resolveNinIdentityPayload(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const fromData = resolveNinDataBlock(body);
  const fromNested = resolveNinDataNested(body);
  if (fromData && fromNested) {
    return { ...fromNested, ...fromData };
  }
  return fromData || fromNested;
}

/** BVN Basic: camelCase in `data`. */
function resolveBvnBlock(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = asRecord(body.data);
  if (!data) return undefined;
  if (data.firstName != null || data.dateOfBirth != null || data.lastName != null) {
    return data;
  }
  if (resolveNinIdentityPayload(body)) {
    return undefined;
  }
  return data;
}

export function extractDateOfBirthFromPremblyRaw(
  raw: unknown,
  identityType: PremblyIdentityKind
): string | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const body = raw as Record<string, unknown>;

  if (identityType === 'NIN') {
    const ninData = resolveNinDataBlock(body);
    const ninNested = resolveNinDataNested(body);
    return pickDob(ninData, ninNested);
  }

  const bvn = resolveBvnBlock(body);
  return pickDob(bvn);
}

/** Normalized identity fields for app use. */
export function extractPremblyIdentityFields(
  raw: unknown,
  identityType?: PremblyIdentityKind
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const body = raw as Record<string, unknown>;

  const dateOfBirth =
    identityType != null
      ? extractDateOfBirthFromPremblyRaw(raw, identityType)
      : extractDateOfBirthFromPremblyRaw(raw, 'BVN') ||
        extractDateOfBirthFromPremblyRaw(raw, 'NIN');

  if (identityType === 'NIN' || (!identityType && resolveNinIdentityPayload(body))) {
    const nin = resolveNinIdentityPayload(body);
    if (nin) {
      return {
        source: 'nin',
        first_name: pickString(nin, 'firstname', 'first_name', 'firstName'),
        middle_name: pickString(nin, 'middlename', 'middle_name', 'middleName'),
        last_name: pickString(nin, 'surname', 'last_name', 'lastName'),
        date_of_birth: dateOfBirth,
        phone_number: pickString(nin, 'telephoneno', 'telephone', 'phone', 'phoneNumber'),
        nin: pickString(nin, 'nin', 'vnin'),
        gender: pickString(nin, 'gender'),
        birth_state: pickString(nin, 'birthstate', 'birth_state'),
        residence_state: pickString(nin, 'residence_state'),
        residence_address: pickString(nin, 'residence_address'),
        email: pickString(nin, 'email')
      };
    }
  }

  const bvn = resolveBvnBlock(body);
  if (bvn) {
    return {
      source: 'bvn',
      first_name: pickString(bvn, 'firstName', 'first_name', 'firstname'),
      middle_name: pickString(bvn, 'middleName', 'middle_name', 'middlename'),
      last_name: pickString(bvn, 'lastName', 'last_name', 'surname'),
      date_of_birth: dateOfBirth,
      phone_number: pickString(bvn, 'phoneNumber', 'phone_number', 'phoneNumber1', 'telephoneno'),
      bvn: pickString(bvn, 'bvn', 'number'),
      gender: pickString(bvn, 'gender'),
      enrollment_bank: pickString(bvn, 'enrollmentBank', 'enrollment_bank')
    };
  }

  if (dateOfBirth) {
    return { source: identityType?.toLowerCase() ?? 'unknown', date_of_birth: dateOfBirth };
  }

  return null;
}
