import { useState, useRef } from 'react';
import { API_CONFIG } from '../config/api';
import AuthService from '../services/authService';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

export default function DocumentUpload() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [debug, setDebug] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload function that prefers proxy URL if available
  const uploadFile = async (file: File) => {
    try {
      // Create a very basic FormData with just the file
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

      // Determine whether to use the proxy URL
      const useProxy = !!API_CONFIG.PROXY_URL;
      const baseUrl = useProxy ? API_CONFIG.PROXY_URL : API_CONFIG.BASE_URL;

      // Build the URL - make sure we append the correct endpoint path
      const url = useProxy ?
        `${baseUrl}/upload-documents` :
        `${baseUrl}${API_CONFIG.ENDPOINTS.UPLOAD}`;

      console.log(`Uploading to: ${url} (using proxy: ${useProxy})`);
      setDebug(prev => prev + `\nUploading to: ${url} (using proxy: ${useProxy})`);

      // Use standard CORS mode with proper authorization
      console.log('Attempting upload...');
      setDebug(prev => prev + `\nAttempting upload...`);

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
      // Special handling for CORS errors
      if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
        const corsMessage = 'CORS error: The server is not configured to accept requests from this origin. ' +
          'This is typically a server-side configuration issue. Options to fix:\n' +
          '1. Configure the backend server to accept requests from your frontend origin\n' +
          '2. Set up a proxy server in your development environment\n' +
          '3. Use a CORS browser extension for testing (not for production)';

        console.error(corsMessage);
        setDebug(prev => prev + `\n${corsMessage}`);
        throw new Error(corsMessage);
      }

      console.error('Error during upload:', error);
      setDebug(prev => prev + `\nError caught: ${error.message}`);
      throw error;
    }
  };

  // Test function to try direct upload with curl-like approach
  const testDirectUpload = async (file: File) => {
    try {
      setDebug('Starting direct upload test...\n');

      // Read file as binary string
      const reader = new FileReader();
      const fileContent = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsBinaryString(file);
      });

      setDebug(prev => prev + `File read as binary, length: ${fileContent.length} bytes\n`);

      // Get token
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Determine whether to use the proxy URL
      const useProxy = !!API_CONFIG.PROXY_URL;
      const baseUrl = useProxy ? API_CONFIG.PROXY_URL : API_CONFIG.BASE_URL;

      // Build the URL - ensure correct path for proxy
      const url = useProxy ?
        `${baseUrl}/upload-documents` :
        `${baseUrl}${API_CONFIG.ENDPOINTS.UPLOAD}`;

      if (useProxy) {
        setDebug(prev => prev + `Using proxy for request (${API_CONFIG.PROXY_URL})\n`);
      }

      // Use the browser's fetch with binary data
      const formData = new FormData();

      // Create a blob with the binary data and correct type
      const blob = new Blob([fileContent], { type: file.type });
      formData.append('files', blob, file.name);

      setDebug(prev => prev + 'Created blob from binary data and appended to FormData\n');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      setDebug(prev => prev + `Response status: ${response.status}\n`);

      if (!response.ok) {
        const errorText = await response.text();
        setDebug(prev => prev + `Error: ${errorText}\n`);
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setDebug(prev => prev + `Success: ${JSON.stringify(data)}\n`);
      return data;
    } catch (error: any) {
      // Special handling for CORS errors
      if (error.message === 'Failed to fetch') {
        const corsMessage = 'CORS error: The server is not configured to accept requests from this origin. ' +
          'You need to configure the backend server to accept requests from your frontend origin.';

        setDebug(prev => prev + `\n${corsMessage}\n`);
        throw new Error(corsMessage);
      }

      setDebug(prev => prev + `Error caught: ${error.message}\n`);
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
      // Check for a selected file
      const file = files[0]; // Just try with the first file
      console.log(`Trying to upload file: ${file.name} (${file.size} bytes)`);

      // Try direct upload first
      try {
        await uploadFile(file);
        setMessage({
          type: 'success',
          text: 'File uploaded successfully!'
        });
      } catch (directError: any) {
        console.error('Direct upload failed, trying alternate method:', directError);
        setDebug(prev => prev + '\n\nDirect upload failed, trying alternate method...\n');

        // If it's a CORS error, don't try the second method (it will fail for the same reason)
        if (directError.message.includes('CORS error')) {
          throw directError;
        }

        // Try the binary approach as fallback
        await testDirectUpload(file);
        setMessage({
          type: 'success',
          text: 'File uploaded successfully with alternate method!'
        });
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFiles(null);
    } catch (error: any) {
      console.error('All upload methods failed:', error);
      setMessage({
        type: 'error',
        text: `Failed to upload document: ${error.message}. Check the debug output for details.`
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