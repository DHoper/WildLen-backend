import express from 'express';
import { postImage, deleteImage, uploadImage } from '../controllers/imageController';

const router = express.Router();

router.post("/:dir", uploadImage, postImage);
router.delete("/", deleteImage);

export default router;
