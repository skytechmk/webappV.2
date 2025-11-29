import express from 'express';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

router.get('/status', adminController.getAdminStatusEndpoint);

export default router;
