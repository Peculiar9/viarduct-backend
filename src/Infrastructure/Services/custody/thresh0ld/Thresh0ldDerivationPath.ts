import { ServiceError } from '../../../../Core/Application/Error/AppError';
import { THRESH0LD_ADDRESS_INDEX_BATCH_SIZE } from './Thresh0ldTypes';

/** Canonical Thresh0ld deposit path: m/0/{index} */
export function formatThresh0ldDerivationPath(index: number): string {
    return `m/0/${index}`;
}

/**
 * Extract trailing child index from paths like `m/0/12`, `0/12`, or bare `12`.
 * Returns null when the path cannot be parsed.
 */
export function parseDerivationPathIndex(path: string | null | undefined): number | null {
    if (path == null) return null;
    const trimmed = String(path).trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
        const n = Number.parseInt(trimmed, 10);
        return Number.isFinite(n) ? n : null;
    }

    const matches = trimmed.match(/\/(\d+)\s*$/);
    if (!matches) return null;
    const n = Number.parseInt(matches[1], 10);
    return Number.isFinite(n) ? n : null;
}

export function assertThresh0ldPathIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= THRESH0LD_ADDRESS_INDEX_BATCH_SIZE) {
        throw new ServiceError(
            `Derivation index ${index} out of initial Thresh0ld batch index range (0-${THRESH0LD_ADDRESS_INDEX_BATCH_SIZE - 1}).`
        );
    }
}
