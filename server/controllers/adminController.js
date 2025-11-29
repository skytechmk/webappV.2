import { getAdminStatus } from '../services/socket.js';

export const getAdminStatusEndpoint = (req, res) => {
    const adminStatus = getAdminStatus();
    const admins = Array.from(adminStatus.entries()).map(([adminId, data]) => ({
        adminId,
        ...data
    }));
    res.json({ admins });
};
