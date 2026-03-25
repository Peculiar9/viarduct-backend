import { DisputeStatus } from '../../../Enums/DisputeStatus';

export interface DisputeEvidenceItem {
    title: string;
    url: string;
    description?: string;
}

export interface IDispute {
    _id?: string;

    user_id: string;

    title: string;
    content: string;

    evidence: DisputeEvidenceItem[]; // user-provided evidence

    status: DisputeStatus | string;

    resolve_note?: string | null;
    resolve_evidence?: DisputeEvidenceItem[] | null; // admin-provided evidence

    created_at?: string;
    updated_at?: string;
}

