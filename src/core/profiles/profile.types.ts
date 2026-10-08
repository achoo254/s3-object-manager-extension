export type Addressing = 'path' | 'virtual';

export interface ConnectionProfile {
  id: string;
  name: string;
  /** Normalised endpoint URL without trailing slash, e.g. `https://s3.example.com`. */
  endpoint: string;
  region: string;
  addressing: Addressing;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  defaultBucket?: string;
}

export type ProfileInput = Omit<ConnectionProfile, 'id'>;

export const DEFAULT_REGION = 'us-east-1';
