import { User, Event, MediaItem, GuestbookEntry, Comment } from '../types';

// @ts-ignore
const API_URL = import.meta.env.VITE_API_URL || ''; 

const getAuthHeaders = () => {
    const token = localStorage.getItem('snapify_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const api = {
    // ... existing User/Auth methods ...
    fetchUsers: async (): Promise<User[]> => {
        const res = await fetch(`${API_URL}/api/users`, {
            headers: { ...getAuthHeaders() }
        });
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

    googleLogin: async (email: string, name: string): Promise<{ token: string, user: User }> => {
        const res = await fetch(`${API_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name })
        });
        if (!res.ok) throw new Error("Google login failed");
        return res.json();
    },

    resetSystem: async (): Promise<void> => {
        const res = await fetch(`${API_URL}/api/admin/reset`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...getAuthHeaders() 
            },
            body: JSON.stringify({ confirmation: 'RESET_CONFIRM' })
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Failed to reset system");
        }
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
            headers: { 
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(user)
        });
    },
    deleteUser: async (id: string): Promise<void> => {
        await fetch(`${API_URL}/api/users/${id}`, { 
            method: 'DELETE',
            headers: { ...getAuthHeaders() }
        });
    },

    // ... existing Event methods ...
    fetchEvents: async (): Promise<Event[]> => {
        const res = await fetch(`${API_URL}/api/events`, {
            headers: { ...getAuthHeaders() }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.map((e: any) => ({
            ...e,
            media: e.media.map((m: any) => ({
                ...m,
                isWatermarked: !!m.isWatermarked
            }))
        }));
    },
    fetchEventById: async (eventId: string): Promise<Event> => {
        const res = await fetch(`${API_URL}/api/events/${eventId}`);
        if (!res.ok) throw new Error(`Failed to fetch event`);
        const data = await res.json();
        return {
            ...data,
            media: data.media.map((m: any) => ({
                ...m,
                isWatermarked: !!m.isWatermarked
            }))
        };
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
    createEvent: async (event: Event): Promise<Event> => {
        const res = await fetch(`${API_URL}/api/events`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(event)
        });
        return res.json();
    },
    updateEvent: async (event: Event): Promise<void> => {
        await fetch(`${API_URL}/api/events/${event.id}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(event)
        });
    },
    deleteEvent: async (id: string): Promise<void> => {
        await fetch(`${API_URL}/api/events/${id}`, { 
            method: 'DELETE',
            headers: { ...getAuthHeaders() }
        });
    },

    // Guestbook & Comments
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

    // Media - Updated to handle Privacy field and uploaderId
    uploadMedia: async (file: File, metadata: Partial<MediaItem>, eventId: string): Promise<MediaItem> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('id', metadata.id!);
        formData.append('eventId', eventId);
        formData.append('type', metadata.type!);
        formData.append('caption', metadata.caption || '');
        formData.append('uploadedAt', metadata.uploadedAt!);
        formData.append('uploaderName', metadata.uploaderName!);
        // NEW: uploaderId
        formData.append('uploaderId', metadata.uploaderId || '');
        formData.append('isWatermarked', String(metadata.isWatermarked));
        formData.append('watermarkText', metadata.watermarkText || '');
        // NEW: Privacy
        formData.append('privacy', metadata.privacy || 'public');

        const res = await fetch(`${API_URL}/api/media`, {
            method: 'POST',
            body: formData
        });
        return res.json();
    },
    uploadBase64Media: async (base64Data: string, metadata: Partial<MediaItem>, eventId: string): Promise<MediaItem> => {
        const fetchRes = await fetch(base64Data);
        const blob = await fetchRes.blob();
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
        return api.uploadMedia(file, metadata, eventId);
    },
    likeMedia: async (id: string): Promise<void> => {
        await fetch(`${API_URL}/api/media/${id}/like`, { method: 'PUT' });
    },
    deleteMedia: async (id: string): Promise<void> => {
        await fetch(`${API_URL}/api/media/${id}`, { 
            method: 'DELETE',
            headers: { ...getAuthHeaders() }
        });
    },
    bulkDeleteMedia: async (mediaIds: string[]): Promise<{ success: boolean; deletedCount: number }> => {
        const res = await fetch(`${API_URL}/api/media/bulk-delete`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...getAuthHeaders() 
            },
            body: JSON.stringify({ mediaIds })
        });
        const data = await res.json();
        return {
            success: data.success || false,
            deletedCount: data.deletedCount || 0
        };
    }
};
