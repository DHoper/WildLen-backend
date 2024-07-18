import { Router } from 'express';
import { checkEmail, deleteUser, getAllUsers, getUserById, getUserByToken, loginUser, registerUser, updateUser } from '../controllers/userController';

const router = Router();

router.get('/user', getUserByToken);
router.put('/user', updateUser);
router.post('/user', registerUser);
router.get('/user/:userId', getUserById);
router.post('/user/login', loginUser);
router.get('/user/checkEmail/:email', checkEmail);


//------------------後台--------------------//
router.get('/users', getAllUsers);
router.delete('/user/:id', deleteUser);

export default router;
