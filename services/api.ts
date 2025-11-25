import { User, Event, MediaItem, GuestbookEntry, Comment, Vendor } from '../types';

const API_URL = import.meta.env.DEV ? (import.meta.env.VITE_API_URL || 'http://localhost:3001') : '';

const getAuthHeaders = () => {
    const token = localStorage.getItem('snapify_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const api = {
    // ... existing methods (User, Auth, etc.) ...
    fetchUsers: async (): Promise<User[]> => {
        const res = await fetch(`${API_URL}/api/users`, { headers: { ...getAuthHeaders() } });
        return res.json();
    },
    
    login: async (email: string, password?: string): Promise<{ token: string, user: User }> => {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!res.ok) throw new Error("Invalid credentials");
        return res.json();
    },

    googleLogin: async (credential: string): Promise<{ token: string, user: User }> => {
        const res = await fetch(`${API_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential })
        });
        if (!res.ok) throw new Error("Google login failed");
        return res.json();
    },

    createUser: async (user: User): Promise<{ token: string, user: User }> => {
        const res = await fetch(`${API_URL}/api/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });
        if (!res.ok) throw new Error("Registration failed");
        return res.json();
    },

    updateUser: async (user: User): Promise<void> => {
        await fetch(`${API_URL}/api/users/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(user)
        });
    },
    upgradeUser: async (userId: string, tier: string): Promise<void> => {
        await fetch(`${API_URL}/api/users/${userId}/upgrade`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ tier })
        });
    },
    deleteUser: async (id: string): Promise<void> => {
        await fetch(`${API_URL}/api/users/${id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
    },

    // --- EVENTS ---
    fetchEvents: async (): Promise<Event[]> => {
        const res = await fetch(`${API_URL}/api/events`, { headers: { ...getAuthHeaders() } });
        if (!res.ok) return [];
        const data = await res.json();
        return data.map((e: any) => ({
            ...e,
            media: e.media.map((m: any) => ({ ...m, isWatermarked: !!m.isWatermarked }))
        }));
    },
    
    fetchEventById: async (eventId: string): Promise<Event> => {
        const res = await fetch(`${API_URL}/api/events/${eventId}`);
        if (!res.ok) throw new Error(`Failed to fetch event`);
        const data = await res.json();
        return {
            ...data,
            media: data.media.map((m: any) => ({ ...m, isWatermarked: !!m.isWatermarked }))
        };
    },

    createEvent: async (event: Event): Promise<Event> => {
        const res = await fetch(`${API_URL}/api/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(event)
        });
        return res.json();
    },

    updateEvent: async (event: Event): Promise<void> => {
        await fetch(`${API_URL}/api/events/${event.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(event)
        });
    },

    deleteEvent: async (id: string): Promise<void> => {
        await fetch(`${API_URL}/api/events/${id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
    },

    validateEventPin: async (id: string, pin: string): Promise<boolean> => {
        const res = await fetch(`${API_URL}/api/events/${id}/validate-pin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const data = await res.json();
        return data.success;
    },

    // --- VENDORS (NEW) ---
    fetchVendors: async (city?: string): Promise<Vendor[]> => {
        let url = `${API_URL}/api/vendors`;
        if (city) url += `?city=${encodeURIComponent(city)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        return res.json();
    },

    // --- MEDIA & AI ---
    uploadMedia: async (file: File, metadata: Partial<MediaItem>, eventId: string, onProgress?: (percent: number) => void): Promise<MediaItem> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('id', metadata.id!);
        formData.append('eventId', eventId);
        formData.append('type', metadata.type!);
        formData.append('caption', metadata.caption || '');
        formData.append('uploadedAt', metadata.uploadedAt!);
        formData.append('uploaderName', metadata.uploaderName!);
        formData.append('uploaderId', metadata.uploaderId || '');
        formData.append('isWatermarked', String(metadata.isWatermarked));
        formData.append('watermarkText', metadata.watermarkText || '');
        formData.append('privacy', metadata.privacy || 'public');

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_URL}/api/media`);
            const token = localStorage.getItem('snapify_token');
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            if (onProgress) {
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(new Error('Invalid JSON response')); }
                } else { reject(new Error(xhr.statusText)); }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send(formData);
        });
    },

    generateImageCaption: async (base64Image: string): Promise<string> => {
        const res = await fetch(`${API_URL}/api/ai/generate-caption`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ base64Image })
        });
        const data = await res.json();
        return data.caption || "Captured moment";
    },

    generateEventDescription: async (title: string, date: string, type: string): Promise<string> => {
        const res = await fetch(`${API_URL}/api/ai/generate-event-description`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ title, date, type })
        });
        const data = await res.json();
        return data.description || "Join us for an amazing celebration!";
    },

    likeMedia: async (id: string): Promise<void> => { await fetch(`${API_URL}/api/media/${id}/like`, { method: 'PUT' }); },
    deleteMedia: async (id: string): Promise<void> => { await fetch(`${API_URL}/api/media/${id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } }); },
    
    bulkDeleteMedia: async (mediaIds: string[]): Promise<{ success: boolean; deletedCount: number }> => {
        const res = await fetch(`${API_URL}/api/media/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ mediaIds })
        });
        const data = await res.json();
        return { success: data.success || false, deletedCount: data.deletedCount || 0 };
    },

    addGuestbookEntry: async (entry: GuestbookEntry): Promise<GuestbookEntry> => {
        const res = await fetch(`${API_URL}/api/guestbook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        return res.json();
    },

    addComment: async (comment: Comment): Promise<Comment> => {
        const res = await fetch(`${API_URL}/api/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(comment)
        });
        return res.json();
    },
    
    resetSystem: async (): Promise<void> => {
        const res = await fetch(`${API_URL}/api/admin/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ confirmation: 'RESET_CONFIRM' })
        });
        if (!res.ok) throw new Error("Failed to reset system");
    },

    getSystemStorage: async (): Promise<{
        system: { filesystem: string; size: string; used: string; available: string; usePercent: string };
        minio: { filesystem: string; size: string; used: string; available: string; usePercent: string };
        timestamp: string;
    }> => {
        const res = await fetch(`${API_URL}/api/system/storage`, { headers: { ...getAuthHeaders() } });
        if (!res.ok) throw new Error("Failed to get storage info");
        return res.json();
    }
};