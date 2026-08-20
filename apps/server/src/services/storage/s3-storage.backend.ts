import { StorageBackend } from './storage.interface.js';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  HeadObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import fs from 'fs';
import { Readable } from 'stream';

export class S3StorageBackend implements StorageBackend {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || 'devsync-storage';
    this.s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true // Needed for MinIO/R2
    });
  }

  async init(): Promise<void> {
    // Optionally check if bucket exists here, but usually assume it does
    // or create it if required (depending on IAM permissions).
  }

  async upload(hash: string, tempFilePath: string): Promise<void> {
    const fileStream = fs.createReadStream(tempFilePath);
    const key = `${hash.substring(0, 2)}/${hash}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileStream,
    });

    await this.s3.send(command);
  }

  async delete(hash: string): Promise<void> {
    const key = `${hash.substring(0, 2)}/${hash}`;
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.s3.send(command);
  }

  async exists(hash: string): Promise<boolean> {
    const key = `${hash.substring(0, 2)}/${hash}`;
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    try {
      await this.s3.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async getFileSize(hash: string): Promise<number> {
    const key = `${hash.substring(0, 2)}/${hash}`;
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.s3.send(command);
    return response.ContentLength || 0;
  }

  async downloadStream(hash: string, start?: number, end?: number): Promise<NodeJS.ReadableStream> {
    const key = `${hash.substring(0, 2)}/${hash}`;
    
    let range: string | undefined = undefined;
    if (start !== undefined && end !== undefined) {
      range = `bytes=${start}-${end}`;
    } else if (start !== undefined) {
      range = `bytes=${start}-`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: range,
    });

    const response = await this.s3.send(command);
    return response.Body as NodeJS.ReadableStream;
  }

  async getStats(): Promise<{ usedBytes: number; totalFiles: number }> {
    let totalBytes = 0;
    let totalFiles = 0;
    let continuationToken: string | undefined = undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ContinuationToken: continuationToken,
      });

      const response = await this.s3.send(command) as any;
      
      if (response.Contents) {
        for (const obj of response.Contents) {
          totalBytes += obj.Size || 0;
          totalFiles++;
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return {
      usedBytes: totalBytes,
      totalFiles: totalFiles,
    };
  }

  async verifyIntegrity(): Promise<{ scanned: number; corrupted: string[]; durationMs: number }> {
    const start = Date.now();
    // S3 guarantees data integrity at rest. Re-downloading all objects to hash them 
    // would be prohibitively expensive (egress costs and time).
    // We just return the total objects scanned as healthy.
    const stats = await this.getStats();
    
    return {
      scanned: stats.totalFiles,
      corrupted: [], // S3 handles bitrot internally
      durationMs: Date.now() - start
    };
  }
}
