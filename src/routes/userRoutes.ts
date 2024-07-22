import { Router } from 'express';
import { checkEmail, deleteUser, getAllUsers, getUserById, getUserByToken, loginUser, registerUser, updateUser, updateUserById } from '../controllers/userController';

const router = Router();

router.get('/user', getUserByToken);
router.put('/user', updateUser);
router.post('/user', registerUser);
router.get('/user/:userId', getUserById);
router.post('/user/login', loginUser);
router.get('/user/checkEmail/:email', checkEmail);


//------------------後台--------------------//
router.get('/users', getAllUsers);
router.put('/user/:id', updateUserById);
router.delete('/user/:id', deleteUser);

export default router;
