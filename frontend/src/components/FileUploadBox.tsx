import { useState, useRef } from 'react';
import { CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DocumentTextIcon } from '@heroicons/react/24/solid';

interface FileUploadBoxProps {
    title: string;
    description: string;
    onFilesSelected: (files: File[]) => void;
    themeColor: string;
    themeBackground: string;
    themeBorder: string;
}

export default function FileUploadBox({
    title,
    description,
    onFilesSelected,
    themeColor,
    themeBackground,
    themeBorder
}: FileUploadBoxProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File) => {
        // Check file type
        const validExtensions = ['.pdf', '.docx', '.txt'];
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

        // Check file size (200MB max)
        const maxSize = 200 * 1024 * 1024; // 200MB in bytes

        if (!validExtensions.includes(fileExtension)) {
            return { valid: false, reason: `Invalid file type: ${fileExtension}. Only PDF, DOCX, and TXT files are supported.` };
        }

        if (file.size > maxSize) {
            return { valid: false, reason: `File too large: ${Math.round(file.size / (1024 * 1024))}MB. Maximum size is 200MB.` };
        }

        return { valid: true };
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const fileList = Array.from(e.target.files);
            const invalidFiles = fileList
                .map(file => ({ file, validation: validateFile(file) }))
                .filter(item => !item.validation.valid);

            if (invalidFiles.length > 0) {
                const reasons = invalidFiles.map(item => `${item.file.name}: ${item.validation.reason}`);
                setError(`Invalid file(s):\n${reasons.join('\n')}`);
                e.target.value = '';
                return;
            }

            setError(null);

            // Add new files to existing files
            const newFiles = [...selectedFiles, ...fileList];
            setSelectedFiles(newFiles);
            onFilesSelected(newFiles);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLButtonElement | HTMLDivElement>) => {
        e.preventDefault();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const fileList = Array.from(e.dataTransfer.files);
            const invalidFiles = fileList
                .map(file => ({ file, validation: validateFile(file) }))
                .filter(item => !item.validation.valid);

            if (invalidFiles.length > 0) {
                const reasons = invalidFiles.map(item => `${item.file.name}: ${item.validation.reason}`);
                setError(`Invalid file(s):\n${reasons.join('\n')}`);
                return;
            }

            setError(null);

            // Add new files to existing files
            const newFiles = [...selectedFiles, ...fileList];
            setSelectedFiles(newFiles);
            onFilesSelected(newFiles);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLButtonElement | HTMLDivElement>) => {
        e.preventDefault();
    };

    const removeFile = (index: number) => {
        const updatedFiles = selectedFiles.filter((_, i) => i !== index);
        setSelectedFiles(updatedFiles);
        onFilesSelected(updatedFiles);
    };

    // Get file icon based on file type
    const getFileIcon = (_fileName: string) => {
        // Unused but kept for future implementation
        // const extension = fileName.split('.').pop()?.toLowerCase();
        return <DocumentTextIcon className="file-type-icon" />;
    };

    return (
        <div className={`upload-box-container ${themeBorder}`}>
            <div className="upload-box-content">
                {/* Left column - Title and description */}
                <div className="upload-box-info">
                    <h3 className={`upload-box-title ${themeColor}`}>{title}</h3>
                    <div className="upload-box-description">
                        <p>{description}</p>
                    </div>
                </div>

                {/* Right column - Upload area */}
                <div className="upload-box-actions">
                    <button
                        className={`upload-button ${themeBackground}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        type="button"
                    >
                        <CloudArrowUpIcon className={`upload-icon ${themeColor}`} />
                        <span className="upload-button-text">Click to upload or drag files</span>
                        <CloudArrowUpIcon className={`upload-icon ${themeColor}`} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="upload-error-message">
                    <pre className="error-text">{error}</pre>
                </div>
            )}

            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden-file-input"
                multiple
                accept=".pdf,.docx,.txt"
            />

            {/* Files row */}
            {selectedFiles.length > 0 && (
                <div className="upload-files-container">
                    <div className="files-list">
                        {selectedFiles.map((file, index) => (
                            <div
                                key={index}
                                className="file-item"
                            >
                                {getFileIcon(file.name)}
                                <span className="file-name">
                                    {file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFile(index);
                                    }}
                                    className="remove-file-button"
                                >
                                    <XMarkIcon className="remove-icon" aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
} 