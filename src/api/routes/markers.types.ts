/** Types for the community marker submission API */

export interface MarkerPayload {
  category: string;
  name: string;
  x: number;
  y: number;
  floor: string;
  region?: string;
  description?: string;
}

export interface MarkerSubmitRequest {
  markers: MarkerPayload[];
  screenshot?: string; // base64 webp
  authorName?: string;
  authorDiscordId?: string;
}

export interface MarkerSubmitResponse {
  success: boolean;
  issueUrl?: string;
  issueNumber?: number;
  error?: string;
}
