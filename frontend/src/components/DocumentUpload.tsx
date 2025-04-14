import { useState, useEffect } from 'react';
import { API_CONFIG, getApiUrl } from '../config/api';
import AuthService from '../services/authService';
import StorageService from '../services/storageService';
import FileUploadBox from './FileUploadBox';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { useDocumentContext } from '../context/DocumentContext';

// Constants for file sizes
const MAX_DIRECT_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_STORAGE_UPLOAD_SIZE = 150 * 1024 * 1024; // 150MB

export default function DocumentUpload() {
  const [competitorFiles, setCompetitorFiles] = useState<File[]>([]);
  const [businessFiles, setBusinessFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [filename: string]: number }>({});
  const [processingProgress, setProcessingProgress] = useState<{ [filename: string]: { current: number, total: number } }>({});

  // Use the document context
  const {
    setHasCompetitorFiles,
    setHasBusinessFiles
  } = useDocumentContext();

  // Track if files have been successfully uploaded to the server
  const [filesUploadedToServer, setFilesUploadedToServer] = useState({
    competitor: false,
    business: false
  });

  // Determine if both file sections have at least one file
  const hasAllRequiredFiles = competitorFiles.length > 0 && businessFiles.length > 0;

  // Update context when files change, but don't set to false if files were uploaded to server
  useEffect(() => {
    // Only update if we have files OR if no files have been uploaded to server yet
    if (competitorFiles.length > 0 || !filesUploadedToServer.competitor) {
      setHasCompetitorFiles(competitorFiles.length > 0);
    }
  }, [competitorFiles, setHasCompetitorFiles, filesUploadedToServer.competitor]);

  useEffect(() => {
    // Only update if we have files OR if no files have been uploaded to server yet
    if (businessFiles.length > 0 || !filesUploadedToServer.business) {
      setHasBusinessFiles(businessFiles.length > 0);
    }
  }, [businessFiles, setHasBusinessFiles, filesUploadedToServer.business]);

  // Handle competitor files selection
  const handleCompetitorFilesSelected = (files: File[]) => {
    // Check file size limits
    const oversizedFiles = files.filter(file => file.size > MAX_STORAGE_UPLOAD_SIZE);
    if (oversizedFiles.length > 0) {
      setMessage({
        type: 'error',
        text: `Some files exceed the maximum size limit of 150MB: ${oversizedFiles.map(f => f.name).join(', ')}`
      });
      // Remove oversized files
      const validFiles = files.filter(file => file.size <= MAX_STORAGE_UPLOAD_SIZE);
      setCompetitorFiles(validFiles);
      setHasCompetitorFiles(validFiles.length > 0);
    } else {
      setCompetitorFiles(files);
      setHasCompetitorFiles(files.length > 0);
    }

    // Reset the uploaded to server flag when new files are selected
    if (files.length > 0) {
      setFilesUploadedToServer(prev => ({ ...prev, competitor: false }));
    }
  };

  // Handle business files selection
  const handleBusinessFilesSelected = (files: File[]) => {
    // Check file size limits
    const oversizedFiles = files.filter(file => file.size > MAX_STORAGE_UPLOAD_SIZE);
    if (oversizedFiles.length > 0) {
      setMessage({
        type: 'error',
        text: `Some files exceed the maximum size limit of 150MB: ${oversizedFiles.map(f => f.name).join(', ')}`
      });
      // Remove oversized files
      const validFiles = files.filter(file => file.size <= MAX_STORAGE_UPLOAD_SIZE);
      setBusinessFiles(validFiles);
      setHasBusinessFiles(validFiles.length > 0);
    } else {
      setBusinessFiles(files);
      setHasBusinessFiles(files.length > 0);
    }

    // Reset the uploaded to server flag when new files are selected
    if (files.length > 0) {
      setFilesUploadedToServer(prev => ({ ...prev, business: false }));
    }
  };

  // Upload function that uses getApiUrl for consistent proxy usage
  const uploadFile = async (file: File, fileType: 'competitor' | 'business') => {
    try {
      // Debug: log the file being uploaded
      const debugInfo = `
        File name: ${file.name}
        File size: ${file.size} bytes
        File type: ${file.type}
        File category: ${fileType}
        Last modified: ${new Date(file.lastModified).toISOString()}
      `;
      console.log(debugInfo);

      // Get token
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Update progress for this file
      setUploadProgress(prev => ({ ...prev, [file.name]: 1 })); // Started

      // For large files, use direct-to-storage upload
      if (file.size > MAX_DIRECT_UPLOAD_SIZE) {
        console.log(`File ${file.name} is large (${file.size} bytes). Using storage upload.`);
        try {
          // Use the storage service for large files
          const result = await StorageService.uploadFile(file, fileType);

          // Update upload progress to 100% once the upload is complete
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));

          // If we got processing details, update the processing progress
          if (result.processingDetails) {
            setProcessingProgress(prev => ({
              ...prev,
              [file.name]: {
                current: result.processingDetails?.processed_chunks || 0,
                total: result.processingDetails?.total_chunks || 1
              }
            }));

            console.log(`Processing progress for ${file.name}: ${result.processingDetails.processed_chunks}/${result.processingDetails.total_chunks} chunks`);
          }

          console.log('Storage upload success:', result);
          return result;
        } catch (error) {
          console.error('Storage upload error:', error);
          setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // Error
          throw error;
        }
      }

      // For smaller files, use the standard API upload
      console.log(`File ${file.name} is small (${file.size} bytes). Using direct API upload.`);

      // Create a FormData with the file
      const formData = new FormData();
      formData.append('files', file);
      // Add a type field to identify whether this is a competitor or business file
      formData.append('file_type', fileType);

      // Get the upload URL using the getApiUrl helper
      const url = getApiUrl(API_CONFIG.ENDPOINTS.UPLOAD);

      console.log(`Uploading to URL: ${url}`);
      console.log(`Using token (truncated): ${token.substring(0, 15)}...`);

      // Use standard CORS mode with proper authorization
      // Create controller with long timeout for large files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            // Don't set Content-Type, let the browser set it with the boundary
          },
          body: formData,
          mode: 'cors',
          credentials: 'omit', // Change to 'omit' to avoid CORS preflight issues
          signal: controller.signal
        });

        // Clear the timeout
        clearTimeout(timeoutId);

        console.log('Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Upload failed:', errorText);

          // If the token is expired, try to refresh it
          if (response.status === 401) {
            console.log('Authentication failed. Redirecting to login...');
            // Force logout to redirect to login
            AuthService.logout();
            window.location.reload();
            throw new Error('Authentication failed. Please log in again.');
          }

          setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // Error
          throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Update upload progress
        setUploadProgress(prev => ({ ...prev, [file.name]: 100 })); // Complete

        // If we got processing details, update the processing progress
        if (data.processingDetails) {
          setProcessingProgress(prev => ({
            ...prev,
            [file.name]: {
              current: data.processingDetails.processed_chunks || 0,
              total: data.processingDetails.total_chunks || 1
            }
          }));

          console.log(`Processing progress for ${file.name}: ${data.processingDetails.processed_chunks}/${data.processingDetails.total_chunks} chunks`);
        }

        console.log('Upload success:', data);
        return data;
      } catch (e) {
        // Clean up timeout if fetch throws
        clearTimeout(timeoutId);
        setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // Error
        throw e;
      }
    } catch (error: any) {
      // Special handling for aborted requests
      if (error.name === 'AbortError') {
        console.error('Upload timed out after 2 minutes');
        setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // Error
        throw new Error('Upload timed out. Please try a smaller file or check your connection.');
      }

      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleUploadAllFiles = async () => {
    if (competitorFiles.length === 0 || businessFiles.length === 0) {
      setMessage({
        type: 'error',
        text: 'Please select at least one file in each section before uploading.'
      });
      return;
    }

    setUploading(true);
    setMessage(null);
    setUploadProgress({});

    try {
      // First upload competitor files
      console.log("Competitor files to upload:", competitorFiles);

      for (let i = 0; i < competitorFiles.length; i++) {
        const file = competitorFiles[i];
        console.log(`Adding competitor file ${i}: ${file.name} ${file.size} ${file.type}`);
        await uploadFile(file, 'competitor');
      }

      // Then upload business files
      console.log("Business files to upload:", businessFiles);

      for (let i = 0; i < businessFiles.length; i++) {
        const file = businessFiles[i];
        console.log(`Adding business file ${i}: ${file.name} ${file.size} ${file.type}`);
        await uploadFile(file, 'business');
      }

      setMessage({
        type: 'success',
        text: 'All files uploaded successfully!'
      });

      // Track that files have been uploaded to server
      setFilesUploadedToServer({
        competitor: true,
        business: true
      });

      // Reset files after successful upload but keep the context values true
      setCompetitorFiles([]);
      setBusinessFiles([]);

      // Explicitly set context values to true to ensure the Generate Analysis button is enabled
      setHasCompetitorFiles(true);
      setHasBusinessFiles(true);
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Error uploading files. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="document-upload-container">
      <FileUploadBox
        title="Upload Competitor Research"
        description="Upload PDF or text files that contain information about your competitors. For example, PDF of their landing page, slide decks, memos, articles, etc."
        onFilesSelected={handleCompetitorFilesSelected}
        selectedFiles={competitorFiles}
        maxSizeMB={150}
        acceptedFileTypes={['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']}
        acceptedExtensions={['.pdf', '.docx', '.txt']}
        disabled={uploading}
        themeColor="text-[#15284B]"
        themeBackground="bg-[#EEEEEE]"
        themeBorder="border-[#15284B]"
      />

      <FileUploadBox
        title="Upload Context Around Your Business"
        description="Upload PDF or text files that contain information about your business. For example, PDF of their landing page, slide decks, memos, articles, etc."
        onFilesSelected={handleBusinessFilesSelected}
        selectedFiles={businessFiles}
        maxSizeMB={150}
        acceptedFileTypes={['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']}
        acceptedExtensions={['.pdf', '.docx', '.txt']}
        disabled={uploading}
        themeColor="text-[#FDB515]"
        themeBackground="bg-[#EEEEEE]"
        themeBorder="border-[#FDB515]"
      />

      {/* Upload Progress Display */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="upload-progress-container">
          <h4 className="progress-heading">Upload Progress</h4>
          <div className="progress-items">
            {Object.entries(uploadProgress).map(([filename, progress]) => (
              <div key={filename} className="progress-item">
                <div className="filename">{filename}</div>
                <div className="progress-bar-container">
                  <div
                    className={`progress-bar ${progress === 100 ? 'progress-complete' : progress < 0 ? 'progress-failed' : 'progress-active'}`}
                    style={{ width: `${progress < 0 ? 100 : progress}%` }}
                  ></div>
                </div>
                <div className="progress-status">
                  {progress === 100 ? 'Complete' : progress < 0 ? 'Failed' : `${progress}%`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chunking Progress Display */}
      {Object.keys(processingProgress).length > 0 && (
        <div className="processing-progress-container mt-4">
          <h4 className="progress-heading">
            Document Processing Progress
            <span className="inline-block ml-2 text-sm text-gray-500 cursor-help"
              title="Documents are split into chunks and embedded using LangChain. Large documents may take longer to process.">
              (?)
            </span>
          </h4>
          <div className="progress-items">
            {Object.entries(processingProgress).map(([filename, progress]) => {
              const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
              return (
                <div key={`processing-${filename}`} className="progress-item">
                  <div className="filename">{filename}</div>
                  <div className="flex flex-col">
                    <div className="flex justify-between text-xs mb-1">
                      <span>LangChain Processing</span>
                      <span>{percentage}% ({progress.current}/{progress.total} chunks)</span>
                    </div>
                    <div className="progress-bar-container">
                      <div
                        className={`progress-bar ${percentage === 100 ? 'progress-complete' : 'progress-active'}`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single "Send to Model" button for both sections */}
      <div className="unified-upload-container">
        <button
          onClick={handleUploadAllFiles}
          disabled={!hasAllRequiredFiles || uploading}
          className={`unified-submit-button ${hasAllRequiredFiles && !uploading
            ? 'unified-button-enabled'
            : 'unified-button-disabled'
            }`}
        >
          {uploading ? 'Processing...' : 'Send to Model'}
          <ArrowUpTrayIcon className="submit-icon" />
        </button>
      </div>

      {message && (
        <div className={`upload-message ${message.type === 'success' ? 'upload-message-success' : 'upload-message-error'}`}>
          <pre className="message-text">{message.text}</pre>
        </div>
      )}
    </div>
  );
}