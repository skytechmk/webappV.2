import DOMPurify from 'isomorphic-dompurify';

// Input validation utilities
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
};

export const validateGuestName = (name: string): boolean => {
  return name.length >= 2 && name.length <= 50 && /^[a-zA-Z\s\-']+$/.test(name);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8 && password.length <= 128;
};

export const validateEventTitle = (title: string): boolean => {
  return title.length >= 1 && title.length <= 100;
};

export const validateEventDescription = (description: string): boolean => {
  return description.length <= 500;
};

// Sanitization utilities - wrapped for testability
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return sanitizeHtmlInput(input.trim());
};

export const sanitizeHtml = (input: string): string => {
  if (typeof input !== 'string') return '';
  return sanitizeHtmlContent(input);
};

// Internal functions that can be mocked
export const sanitizeHtmlInput = (input: string): string => {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
};

export const sanitizeHtmlContent = (input: string): string => {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u'],
    ALLOWED_ATTR: []
  });
};

// Rate limiting helper
export class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(private maxAttempts: number = 5, private windowMs: number = 15 * 60 * 1000) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || record.resetTime < now) {
      this.attempts.set(key, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false;
    }

    record.count++;
    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

// Security headers helper
export const getSecurityHeaders = () => ({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:;"
});

// File validation
export const validateFileType = (file: File): boolean => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm'
  ];
  return allowedMimes.includes(file.type) && file.size <= 200 * 1024 * 1024; // 200MB max
};

export const validateFileName = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
};