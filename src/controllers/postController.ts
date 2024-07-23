import { Request, Response } from 'express';
import { prisma } from '../server';

// 創建照片帖子
export const createPhotoPost = async (req: Request, res: Response) => {
    try {
        const { title, likes, views, description, location, geometry, authorId, imageIds, isEdit } = req.body;

        const newPhotoPost = await prisma.photoPost.create({
            data: {
                title,
                likes,
                views,
                description,
                location,
                geometry,
                authorId,
                isEdit,
                images: {
                    connect: imageIds.map((id: number) => ({
                        id,
                    })),
                },
            },
        });

        res.status(201).json({ status: 201, success: true, message: '照片帖子創建成功', post: newPhotoPost });
    } catch (error: any) {
        console.error("創建照片帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 獲取所有照片帖子
export const getAllPhotoPosts = async (req: Request, res: Response) => {
    try {
        const posts = await prisma.photoPost.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                images: {
                    take: 1,
                },
            },
        });
        res.status(200).json(posts);
    } catch (error: any) {
        console.error("獲取所有照片帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 根據ID獲取單個照片帖子
export const getPhotoPostById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const post = await prisma.photoPost.findUnique({
            where: { id: Number(id) },
            include: {
                images: true, comments: true, author: {
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
            res.status(404).json({ status: 404, message: '未找到此照片帖子' });
        }
    } catch (error: any) {
        console.error("獲取單個照片帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 根據作者ID獲取用戶所有照片帖子
export const getUserPhotoPosts = async (req: Request, res: Response) => {
    try {
        const { authorId } = req.params;
        const posts = await prisma.photoPost.findMany({
            where: { authorId: Number(authorId) },
            include: { images: true, comments: true, author: true },
        });

        res.status(200).json(posts);
    } catch (error: any) {
        console.error("獲取用戶所有照片帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 更新照片帖子
export const updatePhotoPost = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, likes, views, description, location, geometry, authorId, imageIds, isEdit } = req.body;

        // 從數據庫中獲取當前的圖片 IDs
        const currentPost = await prisma.photoPost.findUnique({
            where: { id: Number(id) },
            include: {
                images: true
            }
        });

        const currentImageIds = currentPost?.images.map(image => image.id) || [];

        // 準備要連接和斷開連接的 IDs
        const imagesToConnect = imageIds.filter((id: number) => !currentImageIds.includes(id));
        const imagesToDisconnect = currentImageIds.filter(id => !imageIds.includes(id));

        const updatedPhotoPost = await prisma.photoPost.update({
            where: { id: Number(id) },
            data: {
                title,
                likes,
                views,
                description,
                location,
                geometry,
                authorId,
                isEdit,
                images: {
                    connect: imagesToConnect.map((id: number) => ({ id })),
                    disconnect: imagesToDisconnect.map((id: number) => ({ id })),
                },
            },
        });

        res.status(200).json({ status: 200, success: true, message: '照片帖子更新成功', post: updatedPhotoPost });
    } catch (error: any) {
        console.error("更新照片帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 刪除照片帖子
export const deletePhotoPost = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const photoPost = await prisma.photoPost.findUnique({
            where: { id: Number(id) },
            include: { images: true }
        });

        if (!photoPost) {
            return res.status(404).json({ status: 404, success: false, message: '文章未找到' });
        }

        const imagePublicIds = photoPost.images.map(image => image.publicId);

        // 刪除所有相關的圖片
        await prisma.image.deleteMany({
            where: { publicId: { in: imagePublicIds } }, // 刪除所有在 imagePublicIds 中的圖片
        });

        // 刪除文章
        const deletedPhotoPost = await prisma.photoPost.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '照片帖子刪除成功', deletedPhotoPost });
    } catch (error: any) {
        console.error("刪除照片帖子時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 更新帖子統計數據
export const setPhotoPostStats = async (req: Request, res: Response) => {
    try {
        const { id, action } = req.params;

        console.log(id, action);


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

        await prisma.photoPost.update({
            where: { id: Number(id) },
            data: updateData,
        });

        res.status(200).json({ status: 200, success: true, message: '統計數據更新成功' });
    } catch (error: any) {
        console.error("更新統計數據時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

export const getComments = async (req: Request, res: Response) => {
    try {
        const { postId } = req.params;
        const comments = await prisma.photoComment.findMany({
            where: { postId: Number(postId) },
            include: { author: true },
            orderBy: { id: 'asc' },
        });

        res.status(200).json(comments);
    } catch (error: any) {
        console.error("獲取照片帖子評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 創建評論
export const createComment = async (req: Request, res: Response) => {
    try {
        const { postId } = req.params;
        const { authorId, content } = req.body;


        const newComment = await prisma.photoComment.create({
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

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.photoComment.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '評論刪除成功' });
    } catch (error: any) {
        console.error("刪除評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};