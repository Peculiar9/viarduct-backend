import { IDispute, DisputeEvidenceItem } from '../Entities/disputes/IDispute';
import { DisputeStatus } from '../../Enums/DisputeStatus';

export interface CreateDisputeInput {
    user_id: string;
    title: string;
    content: string;
    evidence?: DisputeEvidenceItem[];
}

export interface ResolveDisputeInput {
    resolve_note?: string;
    resolve_evidence?: DisputeEvidenceItem[];
}

export interface DisputeListResult {
    items: IDispute[];
    total: number;
    limit: number;
    offset: number;
}

export interface IDisputeService {
    create(input: CreateDisputeInput): Promise<IDispute>;

    listForUser(
        userId: string,
        options: { title?: string; status?: DisputeStatus | string; limit?: number; offset?: number }
    ): Promise<DisputeListResult>;

    getByIdForUser(userId: string, disputeId: string): Promise<IDispute>;

    listForAdmin(
        options: { userId?: string; title?: string; status?: DisputeStatus | string; limit?: number; offset?: number }
    ): Promise<DisputeListResult>;

    getByIdForAdmin(disputeId: string): Promise<IDispute>;

    resolve(disputeId: string, input: ResolveDisputeInput): Promise<IDispute>;
}

