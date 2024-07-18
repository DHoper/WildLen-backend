import express from 'express';
import {
    createCommunityPost,
    getAllCommunityPosts,
    getCommunityPostById,
    updateCommunityPost,
    deleteCommunityPost,
    setCommunityPostStats,
    createComment,
    deleteComment,
    getComments,
    getUserCommunityPosts,
} from '../controllers/communityController';

const router = express.Router();

// 創建社區貼文
router.post('/', createCommunityPost);

// 獲取所有社區貼文
router.get('/all/:startFromLast', getAllCommunityPosts);

// 根據ID獲取單個社區貼文
router.get('/:id', getCommunityPostById);

// 根據作者ID獲取用戶所有社區貼文
router.get('/user/:authorId', getUserCommunityPosts);

// 更新帖子統計數據
router.put('/:id/statistics/:action', setCommunityPostStats);

// 更新社區貼文
router.put('/:id', updateCommunityPost);

// 刪除社區貼文
router.delete('/:id', deleteCommunityPost);

// 評論
router.get('/comments/:postId', getComments);
router.post('/comments/:postId', createComment);
router.delete('/comment/:id', deleteComment);

export default router;
