import { useState, useRef } from 'react';
import { API_CONFIG, getApiUrl } from '../config/api';
import AuthService from '../services/authService';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

export default function DocumentUpload() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [debug, setDebug] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload function that uses getApiUrl for consistent proxy usage
  const uploadFile = async (file: File) => {
    try {
      // Create a FormData with the file
      const formData = new FormData();
      formData.append('files', file);

      // Debug: log the file being uploaded
      const debugInfo = `
        File name: ${file.name}
        File size: ${file.size} bytes
        File type: ${file.type}
        Last modified: ${new Date(file.lastModified).toISOString()}
      `;
      console.log(debugInfo);
      setDebug(prev => prev + debugInfo);

      // Get token
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Get the upload URL using the getApiUrl helper
      const url = getApiUrl(API_CONFIG.ENDPOINTS.UPLOAD);

      console.log(`Uploading to URL: ${url}`);
      setDebug(prev => prev + `\nUploading to URL: ${url}`);
      console.log(`Using token (truncated): ${token.substring(0, 15)}...`);

      // Use standard CORS mode with proper authorization
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type, let the browser set it with the boundary
        },
        body: formData,
        mode: 'cors',
      });

      console.log('Response status:', response.status);
      setDebug(prev => prev + `\nResponse status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        setDebug(prev => prev + `\nError: ${errorText}`);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Upload success:', data);
      setDebug(prev => prev + `\nSuccess: ${JSON.stringify(data)}`);
      return data;
    } catch (error: any) {
      console.error('Upload error:', error);
      setDebug(prev => prev + `\nError caught: ${error.message}`);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files?.length) return;

    setUploading(true);
    setMessage(null);
    setDebug('');

    try {
      console.log("Files to upload:", files);
      setDebug(prev => prev + `\nNumber of files: ${files.length}`);

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Adding file ${i}: ${file.name} ${file.size} ${file.type}`);
        setDebug(prev => prev + `\nAdding file ${i}: ${file.name} ${file.size} ${file.type}`);

        await uploadFile(file);
      }

      setMessage({
        type: 'success',
        text: 'Files uploaded successfully!'
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFiles(null);
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage({
        type: 'error',
        text: `Failed to upload document: ${error.message}`
      });
    } finally {
      setUploading(false);
    }
  };

  const validateFile = (file: File) => {
    // Check file type
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    // Check file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes

    if (!validExtensions.includes(fileExtension)) {
      return { valid: false, reason: `Invalid file type: ${fileExtension}. Only PDF, DOCX, and TXT files are supported.` };
    }

    if (file.size > maxSize) {
      return { valid: false, reason: `File too large: ${Math.round(file.size / (1024 * 1024))}MB. Maximum size is 10MB.` };
    }

    return { valid: true };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File input changed');
    if (e.target.files && e.target.files.length > 0) {
      console.log('Files selected:', e.target.files);

      // Validate each file
      const fileList = Array.from(e.target.files);
      const invalidFiles = fileList
        .map(file => ({ file, validation: validateFile(file) }))
        .filter(item => !item.validation.valid);

      if (invalidFiles.length > 0) {
        const reasons = invalidFiles.map(item => `${item.file.name}: ${item.validation.reason}`);
        setMessage({
          type: 'error',
          text: `Invalid file(s):\n${reasons.join('\n')}`
        });
        e.target.value = '';
        return;
      }

      setFiles(e.target.files);
      setMessage(null);
      setDebug('');
    } else {
      console.log('No files selected');
    }
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Upload Documents</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>Upload competitor documents for analysis (PDF, DOCX, TXT)</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5">
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <CloudArrowUpIcon className="w-10 h-10 mb-3 text-gray-400" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">PDF, DOCX, TXT (MAX. 10MB)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
              />
            </label>
          </div>
          {files && files.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-900">Selected files:</h4>
              <ul className="mt-2 text-sm text-gray-500">
                {Array.from(files).map((file, index) => (
                  <li key={index}>{file.name} ({Math.round(file.size / 1024)} KB)</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5">
            <button
              type="submit"
              disabled={uploading || !files?.length}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${uploading || !files?.length
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
        {message && (
          <div className={`mt-4 p-4 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
            <pre className="whitespace-pre-wrap">{message.text}</pre>
          </div>
        )}
        {debug && (
          <div className="mt-4 p-4 rounded-md bg-gray-50">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Debug Output:</h4>
            <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-60 bg-gray-100 p-2 rounded">{debug}</pre>
          </div>
        )}
      </div>
    </div>
  );
}