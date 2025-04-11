import { useState } from 'react';
import axios from 'axios';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import AuthService from '../services/authService';

export default function DocumentUpload() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files?.length) return;

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    try {
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await axios.post('http://localhost:8000/upload-documents', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type, let the browser set it with the boundary
        },
      });
      setMessage({ type: 'success', text: 'Documents uploaded successfully!' });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to upload documents. Please try again.';
      setMessage({ type: 'error', text: errorMessage });
      console.error('Upload error:', error.response?.data || error.message);
    } finally {
      setUploading(false);
    }
  };

  const validateFile = (file: File) => {
    const validTypes = ['.pdf', '.docx', '.txt'];
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    return validTypes.includes(extension);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files);
      const invalidFiles = fileList.filter(file => !validateFile(file));

      if (invalidFiles.length > 0) {
        setMessage({
          type: 'error',
          text: `Invalid file type(s): ${invalidFiles.map(f => f.name).join(', ')}. Only PDF, DOCX, and TXT files are supported.`
        });
        e.target.value = '';
        return;
      }

      setFiles(e.target.files);
      setMessage(null);
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
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5">
            <button
              type="submit"
              disabled={uploading}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${uploading
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
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}