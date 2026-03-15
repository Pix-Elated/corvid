/** Types for the community route submission API */

export interface RouteSegmentPayload {
  fromMarkerName: string;
  toMarkerName: string;
  floor: string;
  waypointCount: number;
}

export interface RouteSubmitRequest {
  route: {
    name: string;
    description?: string;
    segments: RouteSegmentPayload[];
    floors: string[];
    markerNames: string[];
  };
  rawData?: unknown;
  authorName?: string;
  authorDiscordId?: string;
}

export interface RouteSubmitResponse {
  success: boolean;
  issueUrl?: string;
  issueNumber?: number;
  error?: string;
}
