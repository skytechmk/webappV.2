export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  PHOTOGRAPHER = 'PHOTOGRAPHER'
}

export enum TierLevel {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
  STUDIO = 'STUDIO'
}

export interface TierConfig {
  storageLimitMb: number;
  maxDurationHours?: number;
  maxDurationDays?: number | null;
  allowVideo: boolean;
  allowBranding: boolean;
  allowWatermark: boolean;
}

export const TIER_CONFIG: Record<TierLevel, TierConfig> = {
  [TierLevel.FREE]: {
    storageLimitMb: 100,
    maxDurationHours: 7,
    allowVideo: false,
    allowBranding: false,
    allowWatermark: false
  },
  [TierLevel.BASIC]: {
    storageLimitMb: 10240, // 10GB
    maxDurationDays: 30,
    allowVideo: false,
    allowBranding: false,
    allowWatermark: false
  },
  [TierLevel.PRO]: {
    storageLimitMb: 30720, // 30GB
    maxDurationDays: 30,
    allowVideo: true, // 4K Support
    allowBranding: true,
    allowWatermark: true
  },
  [TierLevel.STUDIO]: {
    storageLimitMb: 102400, // 100GB+
    maxDurationDays: null, // Unlimited
    allowVideo: true,
    allowBranding: true,
    allowWatermark: true
  }
};

// Admin users get unlimited access regardless of tier
export const getTierConfigForUser = (user: User | null): TierConfig => {
  if (user?.role === UserRole.ADMIN) {
    return {
      storageLimitMb: Infinity,
      maxDurationDays: null, // Unlimited
      allowVideo: true,
      allowBranding: true,
      allowWatermark: true
    };
  }
  return TIER_CONFIG[user?.tier || TierLevel.FREE];
};

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tier: TierLevel;
  storageUsedMb: number;
  storageLimitMb: number;
  joinedDate: string;
  // Studio Specifics
  studioName?: string;
  website?: string;
  watermarkText?: string;
  logoUrl?: string; // Base64 string of the logo
  watermarkOpacity?: number; // 0.1 to 1.0
  watermarkSize?: number; // 5 to 50 (percentage of image width)
  watermarkPosition?: WatermarkPosition;
  watermarkOffsetX?: number; // 0 to 50 (%)
  watermarkOffsetY?: number; // 0 to 50 (%)
}

export interface Comment {
  id: string;
  mediaId: string;
  eventId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  eventId: string;
  type: 'image' | 'video';
  url: string;
  previewUrl?: string; // For videos (transcoded 720p or thumbnail)
  isProcessing?: boolean; // If video is currently transcoding
  caption?: string; // AI Generated
  uploadedAt: string;
  uploaderName: string;
  uploaderId?: string; // Added: To track ownership for guests/users
  isWatermarked?: boolean;
  watermarkText?: string;
  likes?: number; // Enhanced Feature: Social Reaction
  comments?: Comment[]; // Enhanced Feature: Comments
  privacy: 'public' | 'private'; 
}

export interface GuestbookEntry {
  id: string;
  eventId: string;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  hostId: string;
  code: string; // For joining
  media: MediaItem[];
  guestbook?: GuestbookEntry[];
  coverImage?: string;
  coverMediaType?: 'image' | 'video';
  expiresAt: string | null; // ISO String, null = unlimited
  pin?: string; // Optional security PIN
  // Analytics
  views?: number;
  downloads?: number;
}

export interface PricingTier {
  id: TierLevel;
  name: string;
  price: string;
  features: string[];
  cta: string;
  limit: string;
}

export type Language = 'en' | 'mk' | 'tr' | 'sq';

export type TranslateFn = (key: string) => string;