import { Request, Response } from 'express';
import { prisma } from '../server';
import bcrypt from 'bcryptjs';
import jwt, { VerifyErrors } from 'jsonwebtoken';

// 註冊用戶
export const registerUser = async (req: Request, res: Response) => {
    try {
        const { email, password, username, selectedAvatarIndex, selectedTags, intro, interestedTopics } = req.body;

        // 檢查信箱是否重複
        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser) {
            return res.status(400).json({ status: 400, message: '此信箱重複' });
        }

        // 密碼加密
        const hashedPassword = await bcrypt.hash(password, 10);

        // 創建用戶及用戶個人資料
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                username,
                profile: {
                    create: {
                        selectedAvatarIndex,
                        selectedTags,
                        intro,
                        interestedTopics
                    }
                }
            },
            include: {
                profile: true
            }
        });

        res.status(201).json({ status: 201, success: true, message: '用戶創建成功', user: newUser });
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 登陸用戶
export const loginUser = async (req: Request, res: Response) => {

    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email }, select: {
                id: true,
                email: true,
                username: true,
                profile: true,
                password: true
            }
        });

        if (!user) {
            return res.status(401).json({ status: 401, message: '找不到對應信箱的用戶', passwordError: true });
        }

        // 驗證密碼 
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ status: 401, message: '無效的密碼' });
        }

        //@ts-ignore
        delete user.password;

        // 生成JWT令牌
        const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET as string, {
            expiresIn: '12h'
        });



        res.status(200).json({ status: 200, message: '登陸成功', token, user });
    } catch (error: any) {
        console.error("登陸失敗:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 登陸用戶(透過token)
export const getUserByToken = async (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ status: 401, message: '未提供驗證 Token' });
        }

        // 驗證 Token 並解碼
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number; email: string };

        const user = await prisma.user.findUnique({
            where: { id: decodedToken.userId },
            include: { profile: true }
        });

        if (!user) {
            return res.status(404).json({ status: 404, message: '找不到對應用戶' });
        }

        res.status(200).json({ status: 200, user });
    } catch (error: any) {
        console.error('獲取用戶訊息失敗:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            // Token 無效之處理
            return res.status(200).json({ status: 200, message: 'Token 無效或過期' });
        }
        res.status(500).json({ status: 500, message: error.message || '内部伺服器錯誤' });
    }
};

export const getUserById = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.userId, 10);

        // Fetch user data including profile
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });

        if (!user) {
            return res.status(404).json({ status: 404, message: '未找到用戶' });
        }

        res.status(200).json({ status: 200, user });
    } catch (error: any) {
        console.error('獲取用戶資料時發生錯誤:', error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 更新用戶
export const updateUser = async (req: Request, res: Response) => {
    try {
        const { email, username, profile } = req.body;
        const { selectedAvatarIndex, selectedTags, intro, interestedTopics } = profile

        // 更新用戶資料
        const updatedUser = await prisma.user.update({
            where: { email },
            data: {
                username,
                profile: {
                    update: {
                        selectedAvatarIndex,
                        selectedTags,
                        intro,
                        interestedTopics
                    }
                }
            },
            include: {
                profile: true
            }
        });

        res.status(200).json({ status: 200, user: updatedUser });
    } catch (error: any) {
        console.error("更新用戶資料時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 確認信箱是否重複
export const checkEmail = async (req: Request, res: Response) => {
    try {
        const { email } = req.params;

        const existingUser = await prisma.user.findUnique({ where: { email } });

        res.status(200).json({ status: 200, exists: !!existingUser });
    } catch (error: any) {
        console.error("checkEmail 發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};



//------------------後台--------------------//
export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            include: { profile: true }
        });
        res.status(200).json({ status: 200, users });
    } catch (error: any) {
        console.error('獲取所有用戶時發生錯誤:', error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

export const updateUserById = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id);
        const { email, username, profile } = req.body;
        const { selectedAvatarIndex, selectedTags, intro, interestedTopics } = profile;

        // 檢查用戶是否存在
        const existingUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!existingUser) {
            return res.status(404).json({ status: 404, message: '找不到用戶' });
        }

        // 更新用戶資料
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                email,  // 根據需要更新 email 或其他字段
                username,
                profile: {
                    update: {
                        selectedAvatarIndex,
                        selectedTags,
                        intro,
                        interestedTopics
                    }
                }
            },
            include: {
                profile: true
            }
        });

        res.status(200).json({ status: 200, user: updatedUser, message: '用戶資料更新成功' });
    } catch (error: any) {
        console.error("更新用戶資料時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

export const updateUserPasswordById = async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.params.id); 
        
        const { newPassword } = req.body;       

        // 加密新密碼
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 更新用戶密碼
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword
            }
        });

        if (updatedUser) {
            res.status(200).json({ status: 200, message: '密碼更新成功' });
        } else {
            res.status(404).json({ status: 404, message: '未找到用戶' });
        }
    } catch (error: any) {
        console.error("更新密碼時發生錯誤:", error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};

// 刪除用戶
export const deleteUser = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({
            where: { id: Number(id) },
        });
        res.status(200).json({ status: 200, message: '用戶刪除成功' });
    } catch (error: any) {
        console.error('刪除用戶時發生錯誤:', error);
        res.status(500).json({ status: 500, message: error.message || '內部伺服器錯誤' });
    }
};