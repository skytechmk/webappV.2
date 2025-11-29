import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import { config } from '../config/env.js';

const s3Client = new S3Client({
    region: config.S3.REGION,
    endpoint: config.S3.ENDPOINT,
    credentials: {
        accessKeyId: config.S3.ACCESS_KEY,
        secretAccessKey: config.S3.SECRET_KEY
    },
    forcePathStyle: true
});

export const uploadToS3 = async (filePath, key, contentType) => {
    try {
        console.log('S3 Upload attempt:', { filePath, key, contentType, endpoint: config.S3.ENDPOINT, bucket: config.S3.BUCKET });
        const fileStream = fs.createReadStream(filePath);
        await s3Client.send(new PutObjectCommand({ Bucket: config.S3.BUCKET, Key: key, Body: fileStream, ContentType: contentType }));
        console.log('S3 Upload successful:', key);
        return key;
    } catch (err) {
        console.error('S3 Upload failed:', {
            error: err.message,
            code: err.code,
            statusCode: err.$metadata?.httpStatusCode,
            endpoint: config.S3.ENDPOINT,
            bucket: config.S3.BUCKET,
            key: key
        });
        throw new Error(`Failed to upload media: ${err.message}`);
    } finally {
        if (fs.existsSync(filePath)) fs.unlink(filePath, () => { });
    }
};

export const deleteFromS3 = async (key) => {
    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: config.S3.BUCKET, Key: key }));
    } catch (e) {
        console.error("S3 Delete Error", e);
    }
};

export const getS3Object = async (key) => {
    const command = new GetObjectCommand({ Bucket: config.S3.BUCKET, Key: key });
    return await s3Client.send(command);
};

export { s3Client };
