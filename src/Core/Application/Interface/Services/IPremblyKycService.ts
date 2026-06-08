export type PremblyIdentityType = 'BVN' | 'NIN';

export type PremblyVerificationResult = {
  provider: 'prembly';
  identityType: PremblyIdentityType;
  identityValue: string;
  verified: boolean;
  responseCode?: string;
  reference?: string | null;
  detail?: string | null;
  raw: any;
};

export interface IPremblyKycService {
  verifyBVN(bvn: string): Promise<PremblyVerificationResult>;
  verifyNIN(nin: string): Promise<PremblyVerificationResult>;
}

