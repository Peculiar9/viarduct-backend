declare global {
    namespace Express {
        interface Request {
            user?: any;
            token?: string;
        }
    }
}

export {};

