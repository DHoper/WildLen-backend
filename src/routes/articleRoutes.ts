import express from 'express';
import { createArticle, updateArticle, deleteArticle, getArticle, createComment, getAllArticles, incrementArticleLikes, incrementArticleViews, decrementArticleLikes, getComments, deleteComment } from '../controllers/articleController';

const router = express.Router();

router.get('/', getAllArticles);
router.post('/', createArticle);
router.put('/:id', updateArticle);
router.delete('/:id', deleteArticle);
router.get('/:id', getArticle);
router.put('/:id/views', incrementArticleViews);
router.put('/:id/likes/increment', incrementArticleLikes);
router.put('/:id/likes/decrement', decrementArticleLikes);


router.get('/comments/:articleId', getComments);
router.post('/comments/:articleId', createComment);
router.delete('/comment/:id', deleteComment);



export default router;
