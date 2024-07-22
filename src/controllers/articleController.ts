import { Request, Response } from 'express';
import { prisma } from '../server';

// 發文
export const createArticle = async (req: Request, res: Response) => {
    try {
        const { title, subTitle, topicTags, coverImage, content, imageIds } = req.body;

        const newArticle = await prisma.article.create({
            data: {
                title,
                subTitle,
                views: 0,
                likes: 0,
                content,
                topicTags,
                coverImage,
                images: {
                    connect: imageIds.map((id: number) => ({
                        id,
                    })),
                },
            },
        });

        res.status(201).json({ status: 201, success: true, message: '文章創建成功', article: newArticle });
    } catch (error: any) {
        console.error("創建文章時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 編輯文章
export const updateArticle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { title, subTitle, coverImage, content, topicTags } = req.body;

        const updatedArticle = await prisma.article.update({
            where: { id: Number(id) },
            data: {
                title,
                subTitle,
                coverImage,
                content,
                topicTags,
            },
        });

        res.status(200).json({ status: 200, success: true, message: '文章更新成功', article: updatedArticle });
    } catch (error: any) {
        console.error("更新文章時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 刪除文章及相關圖片
export const deleteArticle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const article = await prisma.article.findUnique({
            where: { id: Number(id) },
            include: { images: true } // 包含關聯的圖片
        });

        if (!article) {
            return res.status(404).json({ status: 404, success: false, message: '文章未找到' });
        }

        // 取得所有使用到的圖片的 publicId
        const imagePublicIds = article.images.map(image => image.publicId);

        // 刪除所有相關的圖片
        await prisma.image.deleteMany({
            where: { publicId: { in: imagePublicIds } }, // 刪除所有在 imagePublicIds 中的圖片
        });

        // 刪除文章
        await prisma.article.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '文章及相關圖片刪除成功' });
    } catch (error: any) {
        console.error("刪除文章時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 取得文章
export const getArticle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const article = await prisma.article.findUnique({
            where: { id: Number(id) },
            include: { comments: true }
        });

        if (!article) {
            return res.status(404).json({ status: 404, success: false, message: '文章未找到' });
        }

        res.status(200).json({ status: 200, success: true, article });
    } catch (error: any) {
        console.error("取得文章時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

export const getAllArticles = async (req: Request, res: Response) => {
    try {
        const articles = await prisma.article.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                title: true,
                comments: {
                    select: {
                        id: true
                    }
                },
                topicTags: true,
                coverImage: true,
                views: true,
                likes: true,
                createdAt: true

            },
        });

        res.status(200).json({ status: 200, success: true, articles });
    } catch (error: any) {
        console.error("獲取所有文章時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 創建評論
export const createComment = async (req: Request, res: Response) => {
    try {
        const { articleId } = req.params;
        const { authorId, content } = req.body;

        const newComment = await prisma.articleComment.create({
            data: {
                articleId: parseInt(articleId),
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

export const getComments = async (req: Request, res: Response) => {
    try {
        const { articleId } = req.params;
        const comments = await prisma.articleComment.findMany({
            where: { articleId: parseInt(articleId) },
            orderBy: { id: 'asc' },
        });

        res.status(200).json(comments);
    } catch (error: any) {
        console.error("獲取文章帖子評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

export const deleteComment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.articleComment.delete({
            where: { id: Number(id) },
        });

        res.status(200).json({ status: 200, success: true, message: '評論刪除成功' });
    } catch (error: any) {
        console.error("刪除評論時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};


// 增加文章瀏覽次數
export const incrementArticleViews = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.article.update({
            where: { id: Number(id) },
            data: {
                views: {
                    increment: 1,
                },
            },
        });

        res.status(200).json({ status: 200, success: true, message: '文章瀏覽次數增加成功' });
    } catch (error: any) {
        console.error("增加文章瀏覽次數時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 增加文章點讚次數
export const incrementArticleLikes = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await prisma.article.update({
            where: { id: Number(id) },
            data: {
                likes: {
                    increment: 1,
                },
            },
        });

        res.status(200).json({ status: 200, success: true, message: '文章點讚次數增加成功' });
    } catch (error: any) {
        console.error("增加文章點讚次數時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

export const decrementArticleLikes = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.article.update({
            where: { id: Number(id) },
            data: {
                likes: {
                    decrement: 1,
                },
            },
        });

        res.status(200).json({ status: 200, success: true, message: '取消點讚成功' });
    } catch (error: any) {
        console.error("取消點讚時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
}