import app from './app';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

// 刪除 Cloudinary 圖片的函數
async function deleteCloudinaryImage(publicId: string): Promise<void> {

  try {
    const aaa = await cloudinary.uploader.destroy(publicId);

    console.log(`成功刪除 Cloudinary 圖片：${publicId}`);
  } catch (error) {
    console.error(`刪除 Cloudinary 圖片失敗：${publicId}`, error);
  }
}

// 初始化 Prisma Client 並設置擴展
export const prisma = new PrismaClient({
  omit: {
    user: {
      password: true
    }
  }
}).$extends({
  query: {
    image: {
      async delete({ model, operation, args, query }) {
        const image = await prisma.image.findUnique({
          where: args.where,
          select: { publicId: true },
        });

        if (image?.publicId) {
          await deleteCloudinaryImage(image.publicId);
        }

        const result = await query(args);

        return result;
      },

      async deleteMany({ model, operation, args, query }) {
        const images = await prisma.image.findMany({
          where: args.where,
          select: { publicId: true },
        });

        for (const image of images) {
          if (image.publicId) {
            await deleteCloudinaryImage(image.publicId);
          }
        }

        const result = await query(args);

        return result;
      }
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
