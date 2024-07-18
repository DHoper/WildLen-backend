import { Request, Response, NextFunction } from 'express';
import jwt, { VerifyErrors } from 'jsonwebtoken';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const isAuth = true;

    if (isAuth) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token: string | undefined = req.headers['authorization'];
  
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  
    jwt.verify(token, 'secret', (err: VerifyErrors | null, decoded: object | undefined) => {
      if (err) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      // Assuming decoded is of type object, you might need to adjust it based on your JWT payload
      req.user = decoded as object;
      next();
    });
  };