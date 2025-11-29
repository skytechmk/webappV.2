import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { s3Client } from '../services/storage.js';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env.js';
import { db } from '../config/db.js';

const execAsync = promisify(exec);

// Get system disk usage
const getSystemDiskUsage = async () => {
    try {
        // Use df command to get disk usage for root filesystem
        const { stdout } = await execAsync('df -h / | tail -1');
        const parts = stdout.trim().split(/\s+/);

        if (parts.length >= 6) {
            return {
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                usePercent: parts[4]
            };
        }
    } catch (error) {
        console.error('Error getting system disk usage:', error);
    }

    // Fallback
    return {
        filesystem: '/',
        size: 'Unknown',
        used: 'Unknown',
        available: 'Unknown',
        usePercent: 'Unknown'
    };
};

// Get MinIO storage usage (both logical and physical)
const getMinIOStorageUsage = async () => {
    const result = {
        filesystem: 'MinIO',
        size: 'N/A',
        used: 'Unknown',
        available: 'N/A',
        usePercent: 'Unknown',
        logical: {
            objects: 0,
            size: '0 B'
        },
        physical: null
    };

    try {
        // Get logical usage (object count and size)
        let totalSize = 0;
        let continuationToken = undefined;
        let objectCount = 0;

        do {
            const command = new ListObjectsV2Command({
                Bucket: config.S3.BUCKET,
                ContinuationToken: continuationToken,
                MaxKeys: 1000
            });

            const response = await s3Client.send(command);

            if (response.Contents) {
                for (const obj of response.Contents) {
                    totalSize += obj.Size || 0;
                    objectCount++;
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        // Convert bytes to human readable
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        result.logical = {
            objects: objectCount,
            size: formatBytes(totalSize)
        };

        result.used = formatBytes(totalSize);
        result.usePercent = `${objectCount} objects`;

        // Try to get physical disk usage via SSH (like the previous implementation)
        try {
            const physicalUsage = await new Promise((resolve, reject) => {

                // Use the same SSH approach as the previous implementation
                const ssh = spawn('sshpass', ['-p', 'jarvis', 'ssh', '-o', 'StrictHostKeyChecking=no', 'root@192.168.20.153', 'df -h /mnt/data']);
                let output = '';
                let errorOutput = '';

                ssh.stdout.on('data', (data) => output += data.toString());
                ssh.stderr.on('data', (data) => errorOutput += data.toString());

                ssh.on('close', (code) => {
                    if (code === 0) {
                        const lines = output.trim().split('\n');
                        if (lines.length >= 2) {
                            const parts = lines[1].split(/\s+/);
                            resolve({
                                filesystem: parts[0],
                                size: parts[1],
                                used: parts[2],
                                available: parts[3],
                                usePercent: parts[4]
                            });
                        } else {
                            reject(new Error('Invalid remote df output'));
                        }
                    } else {
                        reject(new Error(`SSH df failed with code ${code}: ${errorOutput}`));
                    }
                });

                ssh.on('error', reject);

                // Timeout after 10 seconds
                setTimeout(() => {
                    ssh.kill();
                    reject(new Error('SSH timeout'));
                }, 10000);
            });

            result.physical = physicalUsage;
            // Update main result with physical data if available
            result.size = physicalUsage.size;
            result.available = physicalUsage.available;
            result.usePercent = physicalUsage.usePercent;

        } catch (sshError) {
            console.warn('Could not get physical MinIO disk usage via SSH:', sshError.message);
            // Keep logical data as fallback
        }

    } catch (error) {
        console.error('Error getting MinIO storage usage:', error);
    }

    return result;
};

export const getSystemStorage = async (req, res) => {
    try {
        const [system, minio] = await Promise.all([
            getSystemDiskUsage(),
            getMinIOStorageUsage()
        ]);

        res.json({
            system,
            minio,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in getSystemStorage:', error);
        res.status(500).json({ error: 'Failed to get storage information' });
    }
};

// Clean MinIO bucket - delete all objects
export const cleanMinIOBucket = async (req, res) => {
    try {
        console.log('Starting MinIO bucket cleaning process...');

        let deletedCount = 0;
        let totalSize = 0;
        let continuationToken = undefined;
        const objectsToDelete = [];

        // First, collect all objects to delete
        do {
            const command = new ListObjectsV2Command({
                Bucket: config.S3.BUCKET,
                ContinuationToken: continuationToken,
                MaxKeys: 1000
            });

            const response = await s3Client.send(command);

            if (response.Contents) {
                for (const obj of response.Contents) {
                    objectsToDelete.push({ Key: obj.Key });
                    totalSize += obj.Size || 0;
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log(`Found ${objectsToDelete.length} objects to delete, total size: ${totalSize} bytes`);

        if (objectsToDelete.length === 0) {
            return res.json({
                success: true,
                message: 'Bucket is already empty',
                deletedCount: 0,
                totalSize: 0
            });
        }

        // Delete objects in batches (AWS S3 allows max 1000 objects per delete request)
        const batchSize = 1000;
        for (let i = 0; i < objectsToDelete.length; i += batchSize) {
            const batch = objectsToDelete.slice(i, i + batchSize);

            try {
                const deleteCommand = new DeleteObjectsCommand({
                    Bucket: config.S3.BUCKET,
                    Delete: {
                        Objects: batch,
                        Quiet: false
                    }
                });

                const deleteResponse = await s3Client.send(deleteCommand);
                deletedCount += deleteResponse.Deleted?.length || 0;

                console.log(`Deleted batch ${Math.floor(i/batchSize) + 1}: ${deleteResponse.Deleted?.length || 0} objects`);

            } catch (batchError) {
                console.error(`Error deleting batch ${Math.floor(i/batchSize) + 1}:`, batchError);
                // Continue with next batch
            }
        }

        // Format size for response
        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        console.log(`Bucket cleaning completed. Deleted ${deletedCount} objects, total size: ${formatBytes(totalSize)}`);

        res.json({
            success: true,
            message: `Successfully cleaned MinIO bucket`,
            deletedCount,
            totalSize: formatBytes(totalSize),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in cleanMinIOBucket:', error);
        res.status(500).json({
            error: 'Failed to clean MinIO bucket',
            details: error.message
        });
    }
};

// Clear users database - remove all user data except admin
export const clearUsersDatabase = async (req, res) => {
    try {
        console.log('Starting users database clearing process...');

        // Get admin user ID to preserve
        const adminUserId = 'admin-system-id';
        console.log('Preserving admin user:', adminUserId);

        // Count records before deletion
        const counts = {};

        // Get counts for each table
        const tables = [
            'users', 'events', 'media', 'guestbook', 'comments',
            'support_messages', 'push_subscriptions', 'vendors'
        ];

        for (const table of tables) {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                counts[table] = result.count;
            } catch (e) {
                counts[table] = 0;
            }
        }

        console.log('Pre-deletion counts:', counts);

        // Clear tables in correct order (respecting foreign keys)
        // Start with dependent tables first
        const deleteQueries = [
            'DELETE FROM push_subscriptions WHERE userId != ?',
            'DELETE FROM vendors WHERE ownerId != ?',
            'DELETE FROM support_messages WHERE userId != ?',
            'DELETE FROM comments', // Clear all comments
            'DELETE FROM guestbook', // Clear all guestbook entries
            'DELETE FROM media', // Clear all media
            'DELETE FROM events WHERE hostId != ?', // Clear events except admin's
            'DELETE FROM users WHERE id != ?' // Clear users except admin
        ];

        let totalDeleted = 0;
        for (const query of deleteQueries) {
            try {
                if (query.includes('?')) {
                    const result = db.prepare(query).run(adminUserId);
                    totalDeleted += result.changes || 0;
                    console.log(`Executed: ${query} - Changes: ${result.changes}`);
                } else {
                    const result = db.prepare(query).run();
                    totalDeleted += result.changes || 0;
                    console.log(`Executed: ${query} - Changes: ${result.changes}`);
                }
            } catch (queryError) {
                console.error(`Error executing query: ${query}`, queryError);
            }
        }

        // Reset admin user's storage usage
        try {
            db.prepare('UPDATE users SET storageUsedMb = 0 WHERE id = ?').run(adminUserId);
            console.log('Reset admin storage usage to 0');
        } catch (e) {
            console.error('Error resetting admin storage:', e);
        }

        // Get final counts
        const finalCounts = {};
        for (const table of tables) {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                finalCounts[table] = result.count;
            } catch (e) {
                finalCounts[table] = 0;
            }
        }

        console.log('Post-deletion counts:', finalCounts);
        console.log(`Users database clearing completed. Total records deleted: ${totalDeleted}`);

        res.json({
            success: true,
            message: 'Successfully cleared users database',
            adminPreserved: adminUserId,
            totalDeleted,
            preCounts: counts,
            postCounts: finalCounts,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in clearUsersDatabase:', error);
        res.status(500).json({
            error: 'Failed to clear users database',
            details: error.message
        });
    }
};