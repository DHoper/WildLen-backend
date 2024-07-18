import express from 'express';
import cors from 'cors';
import userRoutes from './routes/userRoutes';
import postRoutes from './routes/postRoutes';
import articleRoutes from './routes/articleRoutes';
import imageRoutes from './routes/imageRoutes';
import communityRoutes from './routes/communityRoutes';
import voteRoutes from './routes/voteRoutes';
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


app.use('/auth', userRoutes);
app.use('/photoPost', postRoutes);
app.use('/communityPost', communityRoutes);
app.use('/vote', voteRoutes);
app.use('/article', articleRoutes);
app.use('/image', imageRoutes);

export default app;
