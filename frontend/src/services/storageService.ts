import { API_CONFIG, getApiUrl } from '../config/api';
import AuthService from './authService';

interface GetUploadUrlResponse {
    uploadUrl: string;
    fileId: string;
    expiresAt: number;
}

interface CompleteUploadResponse {
    success: boolean;
    message: string;
    fileDetails: {
        id: string;
        name: string;
        contentType: string;
        size: number;
    };
    processingDetails?: {
        total_chunks: number;
        processed_chunks: number;
        processing_status: string;
    };
}

class StorageService {
    /**
     * Request a signed URL to upload a file directly to cloud storage
     */
    static async getUploadUrl(fileName: string, fileType: string, fileSize: number): Promise<GetUploadUrlResponse> {
        try {
            const token = AuthService.getToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const url = getApiUrl(API_CONFIG.ENDPOINTS.GET_UPLOAD_URL);

            console.log(`Requesting upload URL for ${fileName} (${fileSize} bytes)`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileName,
                    contentType: fileType,
                    size: fileSize
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to get upload URL:', errorText);
                throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Upload URL received:', data.uploadUrl);
            return data;
        } catch (error) {
            console.error('Error getting upload URL:', error);
            throw error;
        }
    }

    /**
     * Upload a file directly to cloud storage using the signed URL
     */
    static async uploadToStorage(file: File, uploadUrl: string): Promise<boolean> {
        try {
            console.log(`Uploading ${file.name} directly to storage...`);

            // For large files, consider using streaming upload or progress tracking
            const response = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': file.type,
                    'Content-Length': file.size.toString(),
                    'Origin': window.location.origin,
                    // Set mode explicitly to avoid CORS preflight issues
                    'Access-Control-Request-Method': 'PUT',
                    'Access-Control-Request-Headers': 'content-type,content-length'
                },
                mode: 'cors',
                credentials: 'omit', // Don't send cookies for cross-origin requests
                body: file
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Storage upload failed:', errorText);
                throw new Error(`Storage upload failed: ${response.status} ${response.statusText}`);
            }

            console.log('File uploaded to storage successfully');
            return true;
        } catch (error) {
            console.error('Error uploading to storage:', error);
            throw error;
        }
    }

    /**
     * Notify the backend that the upload is complete
     */
    static async completeUpload(fileId: string, fileType: 'competitor' | 'business', contentType: string = 'text/plain'): Promise<CompleteUploadResponse> {
        try {
            const token = AuthService.getToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const url = getApiUrl(API_CONFIG.ENDPOINTS.COMPLETE_UPLOAD);

            console.log(`Completing upload for fileId: ${fileId}, type: ${fileType}`);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileId,
                    fileType,
                    contentType  // Add content type to help backend process the file
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to complete upload:', errorText);
                throw new Error(`Failed to complete upload: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Upload completed successfully:', data);
            return data;
        } catch (error) {
            console.error('Error completing upload:', error);
            throw error;
        }
    }

    /**
     * Complete end-to-end upload process using storage
     * 1. Get a signed URL
     * 2. Upload directly to storage
     * 3. Notify backend that upload is complete
     */
    static async uploadFile(file: File, fileType: 'competitor' | 'business'): Promise<CompleteUploadResponse> {
        try {
            // Get signed URL for direct upload
            const { uploadUrl, fileId } = await this.getUploadUrl(file.name, file.type, file.size);

            // Upload directly to cloud storage
            const uploadSuccess = await this.uploadToStorage(file, uploadUrl);

            if (!uploadSuccess) {
                throw new Error('Upload to storage failed');
            }

            // Notify backend that upload is complete
            return await this.completeUpload(fileId, fileType, file.type);
        } catch (error) {
            console.error('Complete upload process failed:', error);
            throw error;
        }
    }
}

export default StorageService; 