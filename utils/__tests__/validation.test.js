import {
    validateEmail,
    validateGuestName,
    validatePassword,
    validateEventTitle,
    validateEventDescription,
    sanitizeInput,
    validateFileType
} from '../validation';

describe('Validation Utilities', () => {
    describe('validateEmail', () => {
        test('should validate correct email addresses', () => {
            expect(validateEmail('test@example.com')).toBe(true);
            expect(validateEmail('user.name+tag@example.co.uk')).toBe(true);
        });

        test('should reject invalid email addresses', () => {
            expect(validateEmail('invalid-email')).toBe(false);
            expect(validateEmail('test@')).toBe(false);
            expect(validateEmail('@example.com')).toBe(false);
        });

        test('should reject emails that are too long', () => {
            const longEmail = 'a'.repeat(255) + '@example.com';
            expect(validateEmail(longEmail)).toBe(false);
        });
    });

    describe('validateGuestName', () => {
        test('should validate correct guest names', () => {
            expect(validateGuestName('John Doe')).toBe(true);
            expect(validateGuestName('Mary-Jane O\'Connor')).toBe(true);
        });

        test('should reject invalid guest names', () => {
            expect(validateGuestName('A')).toBe(false); // Too short
            expect(validateGuestName('John123')).toBe(false); // Contains numbers
            expect(validateGuestName('John_Doe')).toBe(false); // Contains underscore
        });

        test('should reject names that are too long', () => {
            const longName = 'A'.repeat(51);
            expect(validateGuestName(longName)).toBe(false);
        });
    });

    describe('validatePassword', () => {
        test('should validate strong passwords', () => {
            expect(validatePassword('MySecurePass123')).toBe(true);
        });

        test('should reject weak passwords', () => {
            expect(validatePassword('123')).toBe(false); // Too short
            expect(validatePassword('weak')).toBe(false); // Too short
        });

        test('should reject passwords that are too long', () => {
            const longPassword = 'A'.repeat(129);
            expect(validatePassword(longPassword)).toBe(false);
        });
    });

    describe('validateEventTitle', () => {
        test('should validate correct event titles', () => {
            expect(validateEventTitle('My Event')).toBe(true);
            expect(validateEventTitle('A')).toBe(true);
        });

        test('should reject empty or too long titles', () => {
            expect(validateEventTitle('')).toBe(false);
            const longTitle = 'A'.repeat(101);
            expect(validateEventTitle(longTitle)).toBe(false);
        });
    });

    describe('validateEventDescription', () => {
        test('should validate correct descriptions', () => {
            expect(validateEventDescription('This is a great event!')).toBe(true);
            expect(validateEventDescription('')).toBe(true); // Empty is allowed
        });

        test('should reject descriptions that are too long', () => {
            const longDescription = 'A'.repeat(501);
            expect(validateEventDescription(longDescription)).toBe(false);
        });
    });

    describe('sanitizeInput', () => {
        test.skip('should sanitize HTML input', () => {
            expect(sanitizeInput('<script>alert("xss")</script>Hello')).toBe('Hello');
            expect(sanitizeInput('Normal text')).toBe('Normal text');
        });

        test('should handle null/undefined input', () => {
            expect(sanitizeInput(null)).toBe('');
            expect(sanitizeInput(undefined)).toBe('');
        });

        test.skip('should trim whitespace', () => {
            expect(sanitizeInput('  spaced  ')).toBe('spaced');
        });
    });

    describe('validateFileType', () => {
        test('should validate correct file types', () => {
            const imageFile = { type: 'image/jpeg', size: 1024 };
            const videoFile = { type: 'video/mp4', size: 1024 };

            expect(validateFileType(imageFile)).toBe(true);
            expect(validateFileType(videoFile)).toBe(true);
        });

        test('should reject invalid file types', () => {
            const exeFile = { type: 'application/x-msdownload', size: 1024 };
            expect(validateFileType(exeFile)).toBe(false);
        });

        test('should reject files that are too large', () => {
            const largeFile = { type: 'image/jpeg', size: 201 * 1024 * 1024 }; // 201MB
            expect(validateFileType(largeFile)).toBe(false);
        });
    });
});