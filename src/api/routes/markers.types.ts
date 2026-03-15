/** Types for the community marker submission API */

export interface MarkerPayload {
  /** Client-provided ID — preserved for base marker corrections, generated otherwise */
  id?: string;
  /** When true, this is a correction to an existing base marker (not a new marker) */
  correction?: boolean;
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

export interface ScreenshotSubmitRequest {
  markerId: string;
  markerName: string;
  category: string;
  x: number;
  y: number;
  floor: string;
  screenshot: string; // base64 webp
  authorName?: string;
  authorDiscordId?: string;
}
