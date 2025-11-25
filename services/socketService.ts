import { io, Socket } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class SocketService {
    socket: Socket | null = null;

    connect() {
        if (this.socket) return;
        this.socket = io(API_URL);
        
        this.socket.on('connect', () => {
            console.log('Connected to Socket.io server at', API_URL);
        });
    }

    joinEvent(eventId: string) {
        if (this.socket) {
            this.socket.emit('join_event', eventId);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(event: string, callback: (data: any) => void) {
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }

    off(event: string, callback?: (data: any) => void) {
        if (this.socket) {
            if (callback) {
                this.socket.off(event, callback);
            } else {
                this.socket.off(event);
            }
        }
    }
}

export const socketService = new SocketService();