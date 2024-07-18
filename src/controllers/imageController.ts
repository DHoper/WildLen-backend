import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { prisma } from '../server';

const storage = multer.memoryStorage();
const upload = multer({ storage });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
});

async function handleUpload(file: string, dir: string, shouldCrop: boolean) {
    const transformationOptions = [
        { width: 400, height: 300, gravity: "center", crop: "fill", quality: 80 },
    ]


    const uploadOptions = {
        folder: dir,
        allowed_formats: ['jpeg', 'png', 'jpg', 'heic'],
        transformation: shouldCrop ? transformationOptions : [],
        format: 'jpg',
        resource_type: "auto" as "auto",
        quality: 80, // Ensure quality is always set to 80
    };

    const res = await cloudinary.uploader.upload(file, uploadOptions);
    return res;
}


export const uploadImage = upload.array("image");

export const postImage = async (req: Request, res: Response) => {
    const dir = req.params.dir;
    const shouldCrop = req.query.crop === 'true'; // 從 query 中獲取是否裁切的參數

    try {
        const responseData = [];

        for (const file of req.files as Express.Multer.File[]) {
            const b64 = Buffer.from(file.buffer).toString("base64");
            const dataURI = `data:${file.mimetype};base64,${b64}`;
            const cldRes = await handleUpload(dataURI, dir, shouldCrop); // 將 shouldCrop 參數傳遞給 handleUpload

            const createdImage = await prisma.image.create({
                data: {
                    url: cldRes.url,
                    publicId: cldRes.public_id,
                },
            });

            responseData.push({
                id: createdImage.id,
                url: cldRes.url,
                publicId: cldRes.public_id,
            });
        }

        res.json(responseData);
    } catch (error: any) {
        console.error("圖片上傳失敗:", error);
        res.status(500).send({
            message: "圖片上傳失敗",
            error: error.message,
        });
    }
};

export const deleteImage = async (req: Request, res: Response) => {
    try {
        let publicId: string | undefined = req.body.publicId;
        const url: string | undefined = req.body.url;

        if (!publicId && url) {
            // If publicId is not provided, find it using the URL from the database
            const image = await prisma.image.findFirst({
                where: {
                    url: url,
                },
            });

            if (image) {
                publicId = image.publicId;
            } else {
                throw new Error("找不到符合該URL的圖片資料");
            }
        }

        if (!publicId) {
            throw new Error("未提供有效的圖片識別資料");
        }

        // Delete image from Cloudinary
        cloudinary.api.delete_resources([publicId], async (error: Error | undefined, result: any) => {
            if (error) {
                console.error("圖片刪除失敗:", error);
                return res.status(500).json({ message: "圖片刪除失敗" });
            }

            // Delete image data from database using Prisma
            await prisma.image.deleteMany({
                where: {
                    publicId: publicId,
                },
            });

            console.log("圖片刪除成功:", publicId);
            res.json({ message: "圖片刪除成功", result });
        });
    } catch (error: any) {
        console.error("圖片刪除失敗:", error);
        res.status(500).json({ message: "圖片刪除失敗", error: error.message });
    }
};
