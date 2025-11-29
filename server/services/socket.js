import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

let io;
const adminOnlineStatus = new Map();

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: config.ALLOWED_ORIGINS,
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        let currentUser = null;

        socket.on('authenticate', (token) => {
            try {
                const user = jwt.verify(token, config.JWT_SECRET);
                currentUser = user;

                // Track admin status
                if (user.role === 'ADMIN') {
                    adminOnlineStatus.set(user.id, { online: true, socketId: socket.id, lastSeen: Date.now() });
                    // Notify all users about admin status change
                    io.emit('admin_status_update', {
                        adminId: user.id,
                        online: true,
                        lastSeen: Date.now()
                    });
                    console.log(`Admin ${user.name} (${user.id}) came online`);
                }
            } catch (e) {
                console.error("Authentication failed:", e);
            }
        });

        socket.on('join_event', (eventId) => socket.join(eventId));

        socket.on('admin_trigger_reload', (token) => {
            try {
                const user = jwt.verify(token, config.JWT_SECRET);
                if (user.role === 'ADMIN') {
                    io.emit('force_client_reload', { version: Date.now() });
                }
            } catch (e) { console.error("Unauthorized reload attempt"); }
        });

        socket.on('disconnect', () => {
            if (currentUser && currentUser.role === 'ADMIN') {
                // Mark admin as offline but keep record for some time
                const adminData = adminOnlineStatus.get(currentUser.id);
                if (adminData) {
                    adminData.online = false;
                    adminData.lastSeen = Date.now();
                    // Notify all users about admin going offline
                    io.emit('admin_status_update', {
                        adminId: currentUser.id,
                        online: false,
                        lastSeen: Date.now()
                    });
                    console.log(`Admin ${currentUser.name} (${currentUser.id}) went offline`);
                }
            }
        });
    });

    return io;
};

export const getIo = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

export const getAdminStatus = () => adminOnlineStatus;
