import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { 
  registerDevice, 
  getDevices, 
  getDeviceById, 
  updateDevice, 
  revokeDevice, 
  deleteDevice 
} from './devices.controller.js';

const router = Router();

// All device routes are protected
router.use(authenticate);

router.post('/register', registerDevice);
router.get('/', getDevices);
router.get('/:id', getDeviceById);
router.patch('/:id', updateDevice);
router.post('/:id/revoke', revokeDevice);
router.delete('/:id', deleteDevice);

export default router;
