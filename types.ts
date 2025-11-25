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

export const getTierConfig = (tier: TierLevel): TierConfig => {
    return TIER_CONFIG[tier];
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
  studioName?: string;
  website?: string;
  watermarkText?: string;
  logoUrl?: string; 
  watermarkOpacity?: number; 
  watermarkSize?: number; 
  watermarkPosition?: WatermarkPosition;
  watermarkOffsetX?: number; 
  watermarkOffsetY?: number; 
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
  previewUrl?: string;
  isProcessing?: boolean;
  caption?: string;
  uploadedAt: string;
  uploaderName: string;
  uploaderId?: string;
  isWatermarked?: boolean;
  watermarkText?: string;
  likes?: number;
  comments?: Comment[];
  privacy: 'public' | 'private';
  orientation?: number; // EXIF orientation (1-8)
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
  city?: string; // NEW: Location for ad targeting
  hostId: string;
  code: string; 
  media: MediaItem[];
  guestbook?: GuestbookEntry[];
  coverImage?: string;
  coverMediaType?: 'image' | 'video';
  expiresAt: string | null; 
  pin?: string; 
  hasPin?: boolean; 
  views?: number;
  downloads?: number;
  hostTier?: TierLevel;
}

// NEW: Vendor Interface for Ad System
export interface Vendor {
  id: string;
  ownerId: string; // Link to User
  businessName: string;
  category: 'photographer' | 'videographer' | 'venue' | 'planner' | 'dj' | 'other';
  city: string;
  description: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  instagram?: string;
  coverImage?: string; // URL for the ad card background
  isVerified: boolean;
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