import { Request, Response } from 'express';
import { prisma } from '../server';

// 創建社區帖子
export const createCommunityPost = async (req: Request, res: Response) => {
    try {
        const { title, authorId, content, topicTags, imageIds } = req.body;

        const newCommunityPost = await prisma.communityPost.create({
            data: {
                title,
                authorId,
                content,
                topicTags,
                images: {
                    connect: imageIds.map((id: number) => ({
                        id,
                    })),
                },
                isEdit: false,
                views: 0,
                likes: 0
            },
        });

        res.status(201).json({ status: 201, success: true, message: '社區帖子創建成功', post: newCommunityPost });
    } catch (error: any) {
        console.error("創建社區帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 獲取所有社區帖子
export const getAllCommunityPosts = async (req: Request, res: Response) => {
    try {
        const { startFromLast } = req.params;

        const take = 6; // 每次取六筆
        const skip = startFromLast ? Number(startFromLast) : 0; // 從倒數第幾筆開始返回

        const [posts, totalCount] = await Promise.all([
            prisma.communityPost.findMany({
                include: {
                    author: true,
                    comments: {
                        select: {
                            id: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take,
                skip,
            }),
            prisma.communityPost.count(), // 獲取總筆數
        ]);

        res.status(200).json({ posts, totalCount });
    } catch (error: any) {
        console.error("獲取所有社區帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 根據ID獲取單個社區帖子
export const getCommunityPostById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const post = await prisma.communityPost.findUnique({
            where: { id: Number(id) },
            include: {
                images: true,
                comments: true,
                author: {
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        profile: true
                    }
                }
            },
        });

        if (post) {
            res.status(200).json(post);
        } else {
            res.status(404).json({ status: 404, message: '未找到此社區帖子' });
        }
    } catch (error: any) {
        console.error("獲取單個社區帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 根據作者ID獲取用戶所有社區帖子
export const getUserCommunityPosts = async (req: Request, res: Response) => {
    try {
        const { authorId } = req.params;
        const posts = await prisma.communityPost.findMany({
            where: { authorId: Number(authorId) },
            include: { images: true, comments: true, author: true },
        });

        res.status(200).json(posts);
    } catch (error: any) {
        console.error("獲取用戶所有社區帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 更新社區帖子
export const updateCommunityPost = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, content, topicTags, isEdit, imageIds } = req.body;

        const updatedCommunityPost = await prisma.communityPost.update({
            where: { id: Number(id) },
            data: {
                title,
                content,
                topicTags,
                isEdit,
                images: {
                    connect: imageIds.map((id: number) => ({
                        id,
                    })),
                },
            },
        });

        res.status(200).json({ status: 200, success: true, message: '社區帖子更新成功', post: updatedCommunityPost });
    } catch (error: any) {
        console.error("更新社區帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 刪除社區帖子
export const deleteCommunityPost = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const communityPost = await prisma.communityPost.findUnique({
            where: { id: Number(id) },
            include: { images: true }
        });

        if (!communityPost) {
            return res.status(404).json({ status: 404, success: false, message: '文章未找到' });
        }

        const imagePublicIds = communityPost.images.map(image => image.publicId);

        // 刪除所有相關的圖片
        await prisma.image.deleteMany({
            where: { publicId: { in: imagePublicIds } }, // 刪除所有在 imagePublicIds 中的圖片
        });

        // 刪除文章
        const deletedCommunityPost = await prisma.communityPost.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '社區帖子刪除成功', post: deletedCommunityPost });
    } catch (error: any) {
        console.error("刪除社區帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 更新帖子統計數據
export const setCommunityPostStats = async (req: Request, res: Response) => {
    try {
        const { id, action } = req.params;

        let updateData;
        if (action === 'like') {
            updateData = { likes: { increment: 1 } };
        } else if (action === 'unlike') {
            updateData = { likes: { decrement: 1 } };
        } else if (action === 'view') {
            updateData = { views: { increment: 1 } };
        } else {
            return res.status(400).json({ status: 400, message: '無效的動作' });
        }

        await prisma.communityPost.update({
            where: { id: Number(id) },
            data: updateData,
        });

        res.status(200).json({ status: 200, success: true, message: '統計數據更新成功' });
    } catch (error: any) {
        console.error("更新統計數據時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 獲取評論
export const getComments = async (req: Request, res: Response) => {
    try {
        const { postId } = req.params;
        const comments = await prisma.communityComment.findMany({
            where: { postId: Number(postId) },
            include: { author: true },
            orderBy: { id: 'asc' },
        });

        res.status(200).json(comments);
    } catch (error: any) {
        console.error("獲取社區帖子評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 創建評論
export const createComment = async (req: Request, res: Response) => {
    try {
        const { postId } = req.params;
        const { authorId, content } = req.body;

        const newComment = await prisma.communityComment.create({
            data: {
                postId: parseInt(postId),
                authorId,
                content,
            }
        });

        res.status(201).json({ status: 201, success: true, message: '評論創建成功', comment: newComment });
    } catch (error: any) {
        console.error("創建評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 刪除評論
export const deleteComment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.communityComment.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '評論刪除成功' });
    } catch (error: any) {
        console.error("刪除評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};
