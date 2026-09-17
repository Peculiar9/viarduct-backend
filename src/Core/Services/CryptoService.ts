import CryptoJS from "crypto-js";
import bcrypt from "bcryptjs";

export class CryptoService {
    constructor() {

    }

    public static hashString(password: string, salt: string): string {
        return CryptoJS.HmacSHA256(password, salt).toString(); 
    }
    
    public static generateValidSalt(): string {
        return bcrypt.genSaltSync(16);
    }    
    
    public static verifyHash(input: string, hashedValue: string, salt: string): boolean {
        const hashedInput = this.hashString(input, salt);
        return hashedInput === hashedValue;
    }
    
    public static generateRandomString(length: number): string {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return result;
    }

    /**
     * AES-encrypt sensitive payload (gift card codes, PINs, claim URLs).
     * Key resolution: GIFTCARD_ENCRYPTION_KEY → BITCOIN_ENCRYPTION_KEY → JWT_ACCESS_SECRET
     */
    public static encryptSensitive(plainText: string, encryptionKey?: string): string {
        const key = encryptionKey || this.resolveSensitiveKey();
        return CryptoJS.AES.encrypt(plainText, key).toString();
    }

    public static decryptSensitive(cipherText: string, encryptionKey?: string): string {
        const key = encryptionKey || this.resolveSensitiveKey();
        const bytes = CryptoJS.AES.decrypt(cipherText, key);
        const plain = bytes.toString(CryptoJS.enc.Utf8);
        if (!plain) {
            throw new Error('Failed to decrypt sensitive value');
        }
        return plain;
    }

    private static resolveSensitiveKey(): string {
        const key =
            process.env.GIFTCARD_ENCRYPTION_KEY ||
            process.env.BITCOIN_ENCRYPTION_KEY ||
            process.env.JWT_ACCESS_SECRET ||
            '';
        if (!key) {
            throw new Error(
                'No encryption key configured (GIFTCARD_ENCRYPTION_KEY / BITCOIN_ENCRYPTION_KEY / JWT_ACCESS_SECRET)'
            );
        }
        return key;
    }
}

export default CryptoService;