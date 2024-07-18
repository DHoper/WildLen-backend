import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 創建投票
export const createVote = async (req: Request, res: Response) => {
    try {
        const { authorId, title, description, startDate, endDate, options } = req.body;

        const newVote = await prisma.vote.create({
            data: {
                author: { connect: { id: authorId } },
                title,
                description,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                participantCount: 0,
                options: {
                    create: options.map((option: { text: string }) => ({ text: option.text })),
                },
            },
            include: {
                options: true,
            },
        });

        res.status(201).json({ status: 201, success: true, message: '投票創建成功', vote: newVote });
    } catch (error: any) {
        console.error("創建投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 獲取所有投票，接受 userId 參數來檢查用戶是否參與過投票
export const getAllVotes = async (req: Request, res: Response) => {
    try {
        const { userId } = req.query; // 從 query 中獲取 userId 參數

        let votes;
        if (userId) {
            // 如果提供了 userId 參數，查詢每個投票時同時檢查用戶是否參與過
            votes = await prisma.vote.findMany({
                include: {
                    author: true,
                    options: true,
                    userVotes: {
                        where: { userId: Number(userId) },
                        select: { userId: true }
                    }
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });

            // 對於每筆投票，新增一個屬性來表示該用戶是否參與過該投票
            votes = votes.map(vote => ({
                ...vote,
                userHasVoted: vote.userVotes.length > 0
            }));
        } else {
            // 如果未提供 userId 參數，僅查詢投票列表不包含用戶參與信息
            votes = await prisma.vote.findMany({
                include: {
                    author: true,
                    options: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
        }

        res.status(200).json(votes);
    } catch (error: any) {
        console.error("獲取所有投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 獲取單個投票
export const getVoteById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const vote = await prisma.vote.findUnique({
            where: { id: Number(id) },
            include: {
                options: true,
                userVotes: true,
                author: {
                    include: {
                        profile: true
                    }
                }, // 包含投票的作者信息
            },
        });

        if (vote) {
            res.status(200).json(vote);
        } else {
            res.status(404).json({ status: 404, message: '未找到此投票' });
        }
    } catch (error: any) {
        console.error("獲取單個投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 獲取所有用戶創建的投票
export const getUserCreatedVotes = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const votes = await prisma.vote.findMany({
            where: { authorId: Number(userId) },
            include: {
                options: true,
                userVotes: true,
                author: true, // 包含投票的作者信息
            },
        });

        res.status(200).json(votes);
    } catch (error: any) {
        console.error("獲取用戶創建的投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 獲取所有用戶參與的投票
export const getUserVotedVotes = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const votes = await prisma.vote.findMany({
            where: { userVotes: { some: { userId: Number(userId) } } },
            include: {
                options: true,
                userVotes: true,
                author: true, // 包含投票的作者信息
            },
        });

        res.status(200).json(votes);
    } catch (error: any) {
        console.error("獲取用戶參與的投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 參與投票
export const participateInVote = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId, voteOptionId } = req.body;

        // 檢查用戶是否已經參與過該投票
        const existingUserVote = await prisma.userVote.findFirst({
            where: {
                userId: Number(userId),
                voteId: Number(id),
            },
        });

        if (existingUserVote) {
            res.status(400).json({ status: 400, message: '用戶已參與過此投票' });
            return;
        }

        // 創建新的用戶投票記錄
        const newUserVote = await prisma.userVote.create({
            data: {
                userId: Number(userId),
                voteId: Number(id),
                voteOptionId: Number(voteOptionId),
            },
        });

        // 更新投票的參與人數
        await prisma.vote.update({
            where: { id: Number(id) },
            data: {
                participantCount: {
                    increment: 1,
                },
            },
        });

        res.status(201).json({ status: 201, success: true, message: '用戶參與投票成功', userVote: newUserVote });
    } catch (error: any) {
        console.error("用戶參與投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 查詢用戶是否已參與過此投票
export const checkUserVoted = async (req: Request, res: Response) => {
    try {
        const { userId, id } = req.params;

        // 查詢用戶是否已經參與過此投票
        const existingUserVote = await prisma.userVote.findFirst({
            where: {
                userId: Number(userId),
                voteId: Number(id),
            },
        });

        res.status(200).json({ status: 200, isVoted: !!existingUserVote, existingUserVote });
    } catch (error: any) {
        console.error("查詢用戶是否參與投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 刪除投票
export const deleteVote = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.vote.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '投票刪除成功' });
    } catch (error: any) {
        console.error("刪除投票時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};
