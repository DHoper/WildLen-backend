import express from 'express';
import {
    createPhotoPost,
    createComment,
    getAllPhotoPosts,
    getPhotoPostById,
    getUserPhotoPosts,
    updatePhotoPost,
    deletePhotoPost,
    setPhotoPostStats,
    getComments,
    deleteComment
} from '../controllers/postController';

const router = express.Router();

// 創建照片帖子
router.post('/', createPhotoPost);

// 獲取所有照片帖子
router.get('/', getAllPhotoPosts);

// 根據ID獲取單個照片帖子
router.get('/:id', getPhotoPostById);

// 根據作者ID獲取用戶所有照片帖子
router.get('/user/:authorId', getUserPhotoPosts);

// 更新照片帖子
router.put('/:id', updatePhotoPost);

// 刪除照片帖子
router.delete('/:id', deletePhotoPost);

// 更新帖子統計數據
router.put('/:id/statistics/:action', setPhotoPostStats);

// 評論
router.get('/comments/:postId', getComments);
router.post('/comments/:postId', createComment);
router.delete('/comment/:id', deleteComment);


export default router;
