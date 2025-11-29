import React from 'react';
import { render, screen } from '@testing-library/react';
import { Navigation } from '../Navigation';
import { UserRole, TierLevel } from '../../types';

// Mock the required modules
jest.mock('../../services/socketService', () => ({
    socketService: {
        connect: jest.fn(),
        disconnect: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
    }
}));

const mockProps = {
    currentUser: null,
    guestName: '',
    view: 'landing' as const,
    currentEventTitle: '',
    language: 'en' as const,
    onChangeLanguage: jest.fn(),
    onLogout: jest.fn(),
    onSignIn: jest.fn(),
    onHome: jest.fn(),
    onBack: jest.fn(),
    onToAdmin: jest.fn(),
    onOpenSettings: jest.fn(),
    t: (key: string) => key
};

describe('Navigation Component', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders navigation for guest user', () => {
        render(<Navigation {...mockProps} />);

        expect(screen.getByText('SnapifY')).toBeInTheDocument();
    });

    test('renders navigation for logged in user', () => {
        const userProps = {
            ...mockProps,
            currentUser: {
                id: '1',
                name: 'John Doe',
                email: 'john@example.com',
                role: UserRole.USER,
                tier: TierLevel.FREE,
                storageUsedMb: 0,
                storageLimitMb: 100,
                joinedDate: '2024-01-01'
            }
        };

        render(<Navigation {...userProps} />);

        expect(screen.getByText('SnapifY')).toBeInTheDocument();
    });

    test('renders admin navigation for admin user', () => {
        const adminProps = {
            ...mockProps,
            currentUser: {
                id: '1',
                name: 'Admin User',
                email: 'admin@example.com',
                role: UserRole.ADMIN,
                tier: TierLevel.STUDIO,
                storageUsedMb: 0,
                storageLimitMb: -1,
                joinedDate: '2024-01-01'
            },
            view: 'admin' as const
        };

        render(<Navigation {...adminProps} />);

        expect(screen.getByText('SnapifY')).toBeInTheDocument();
    });

    test('shows guest name when available', () => {
        const guestProps = {
            ...mockProps,
            guestName: 'Guest User'
        };

        render(<Navigation {...guestProps} />);

        expect(screen.getByText('SnapifY')).toBeInTheDocument();
    });
});