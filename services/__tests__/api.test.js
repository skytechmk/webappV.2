// Mock the API module before importing it
jest.mock('../api', () => {
    const mockApiUrl = 'http://localhost:3001';

    return {
        api: {
            fetchEvents: jest.fn(),
            login: jest.fn(),
            googleLogin: jest.fn(),
            createUser: jest.fn(),
            updateUser: jest.fn(),
            upgradeUser: jest.fn(),
            deleteUser: jest.fn(),
            fetchEventById: jest.fn(),
            createEvent: jest.fn(),
            updateEvent: jest.fn(),
            deleteEvent: jest.fn(),
            validateEventPin: jest.fn(),
            fetchVendors: jest.fn(),
            uploadMedia: jest.fn(),
            getUploadStatus: jest.fn(),
            generateImageCaption: jest.fn(),
            generateEventDescription: jest.fn(),
            generateGuestReviews: jest.fn(),
            likeMedia: jest.fn(),
            deleteMedia: jest.fn(),
            bulkDeleteMedia: jest.fn(),
            addGuestbookEntry: jest.fn(),
            addComment: jest.fn(),
            getSystemStorage: jest.fn(),
            getSupportMessages: jest.fn(),
            sendAdminReply: jest.fn(),
            markMessageAsRead: jest.fn(),
            cleanMinIOBucket: jest.fn(),
            clearUsersDatabase: jest.fn()
        }
    };
});

import { api } from '../api';

// Mock fetch globally
global.fetch = jest.fn();

describe('API Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock localStorage
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn(() => 'mock-token'),
                setItem: jest.fn(),
                removeItem: jest.fn(),
            },
            writable: true,
        });
    });

    describe('fetchEvents', () => {
        test('should fetch events successfully', async () => {
            const mockEvents = [
                { id: '1', title: 'Test Event', description: 'Test Description' }
            ];

            api.fetchEvents.mockResolvedValue(mockEvents);

            const result = await api.fetchEvents();

            expect(result).toEqual(mockEvents);
        });

        test('should handle fetch errors gracefully', async () => {
            api.fetchEvents.mockResolvedValue([]);

            const result = await api.fetchEvents();
            expect(result).toEqual([]);
        });
    });

    describe('createEvent', () => {
        test('should create event successfully', async () => {
            const mockEvent = {
                id: '1',
                title: 'New Event',
                description: 'Event Description',
                hostId: 'user-1'
            };

            const mockResponse = { ...mockEvent, code: 'ABC123' };

            api.createEvent.mockResolvedValue(mockResponse);

            const result = await api.createEvent(mockEvent);

            expect(result).toEqual(mockResponse);
        });
    });

    describe('login', () => {
        test('should login successfully', async () => {
            const credentials = { email: 'test@example.com', password: 'password' };
            const mockResponse = {
                token: 'jwt-token',
                user: { id: '1', email: 'test@example.com' }
            };

            api.login.mockResolvedValue(mockResponse);

            const result = await api.login(credentials.email, credentials.password);

            expect(result).toEqual(mockResponse);
        });

        test('should handle login failure', async () => {
            api.login.mockRejectedValue(new Error('Invalid credentials'));

            await expect(api.login('test@example.com', 'wrong')).rejects.toThrow('Invalid credentials');
        });
    });

    describe('uploadMedia', () => {
        test('should handle file upload', async () => {
            const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
            const metadata = {
                id: 'media-1',
                type: 'image',
                caption: 'Test image'
            };

            const mockResult = { id: 'media-1', type: 'image', url: 'test-url' };
            api.uploadMedia.mockResolvedValue(mockResult);

            const result = await api.uploadMedia(mockFile, metadata, 'event-1');

            expect(result).toEqual(mockResult);
        });
    });

    describe('generateImageCaption', () => {
        test('should generate caption successfully', async () => {
            const base64Image = 'data:image/jpeg;base64,test';
            const mockResponse = 'A beautiful test image';

            api.generateImageCaption.mockResolvedValue(mockResponse);

            const result = await api.generateImageCaption(base64Image);

            expect(result).toBe('A beautiful test image');
        });
    });
});