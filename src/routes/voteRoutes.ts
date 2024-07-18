import express from 'express';
import {
    createVote,
    getAllVotes,
    getVoteById,
    getUserCreatedVotes,
    getUserVotedVotes,
    deleteVote,
    participateInVote,
    checkUserVoted,
} from '../controllers/voteController';

const router = express.Router();

// 創建投票
router.post('/', createVote);

// 獲取所有投票
router.get('/', getAllVotes);

// 獲取單個投票
router.get('/:id', getVoteById);

// 進行投票
router.post('/:id/participateIn', participateInVote);

router.get('/:id/checkUserVoted/:userId', checkUserVoted);

// 獲取所有用戶創建的投票
router.get('/user/created/:userId', getUserCreatedVotes);

// 獲取所有用戶參與的投票
router.get('/user/voted/:userId', getUserVotedVotes);

// 刪除投票
router.delete('/:id', deleteVote);

export default router;
