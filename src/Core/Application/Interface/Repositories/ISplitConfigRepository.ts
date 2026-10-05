import { ISplitConfig } from '../Entities/trading/ISplitConfig';

export interface ISplitConfigRepository {
    findAll(): Promise<ISplitConfig[]>;
    findByTitle(title: string): Promise<ISplitConfig | null>;
    upsertByTitle(
        title: string,
        value: number,
        updatedBy: string
    ): Promise<ISplitConfig>;
}
