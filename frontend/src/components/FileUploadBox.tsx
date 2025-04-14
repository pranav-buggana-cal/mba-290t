import { useState, useRef } from 'react';
import { CloudArrowUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DocumentTextIcon } from '@heroicons/react/24/solid';

interface FileUploadBoxProps {
    title?: string;
    description?: string;
    onFilesSelected: (files: File[]) => void;
    selectedFiles?: File[];
    maxSizeMB?: number;
    acceptedFileTypes?: string[];
    acceptedExtensions?: string[];
    disabled?: boolean;
    themeColor?: string;
    themeBackground?: string;
    themeBorder?: string;
}

export default function FileUploadBox({
    title,
    description,
    onFilesSelected,
    selectedFiles: externalSelectedFiles,
    maxSizeMB = 150,
    acceptedFileTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    acceptedExtensions = ['.pdf', '.docx', '.txt'],
    disabled = false,
    themeColor = 'text-blue-600',
    themeBackground = 'bg-gray-100',
    themeBorder = 'border-gray-300'
}: FileUploadBoxProps) {
    // Use internal state only if external state is not provided
    const [internalSelectedFiles, setInternalSelectedFiles] = useState<File[]>([]);
    const selectedFiles = externalSelectedFiles || internalSelectedFiles;

    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File) => {
        // Check file extension
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidExtension = acceptedExtensions.includes(fileExtension);

        // Check file type (MIME type)
        const isValidType = acceptedFileTypes.some(type => file.type.toLowerCase().includes(type.toLowerCase()));

        // Check file size
        const maxSize = maxSizeMB * 1024 * 1024; // Convert MB to bytes

        if (!isValidExtension) {
            return {
                valid: false,
                reason: `Invalid file type: ${fileExtension}. Only PDF, DOCX, and TXT files are supported.`
            };
        }

        if (!isValidType && file.type !== '') {
            return {
                valid: false,
                reason: `Invalid file type: ${file.type}. Please upload a supported format.`
            };
        }

        if (file.size > maxSize) {
            return {
                valid: false,
                reason: `File too large: ${Math.round(file.size / (1024 * 1024))}MB. Maximum size is ${maxSizeMB}MB.`
            };
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

            // Update internal state if we're managing it
            if (!externalSelectedFiles) {
                setInternalSelectedFiles(newFiles);
            }

            // Notify parent component
            onFilesSelected(newFiles);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLButtonElement | HTMLDivElement>) => {
        e.preventDefault();

        if (disabled) return;

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

            // Update internal state if we're managing it
            if (!externalSelectedFiles) {
                setInternalSelectedFiles(newFiles);
            }

            // Notify parent component
            onFilesSelected(newFiles);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLButtonElement | HTMLDivElement>) => {
        e.preventDefault();
    };

    const removeFile = (index: number) => {
        const updatedFiles = selectedFiles.filter((_, i) => i !== index);

        // Update internal state if we're managing it
        if (!externalSelectedFiles) {
            setInternalSelectedFiles(updatedFiles);
        }

        // Notify parent component
        onFilesSelected(updatedFiles);
    };

    // Get file icon based on file type
    const getFileIcon = (_fileName: string) => {
        // Unused but kept for future implementation
        // const extension = fileName.split('.').pop()?.toLowerCase();
        return <DocumentTextIcon className="file-type-icon" />;
    };

    return (
        <div className={`upload-box-container ${themeBorder} ${disabled ? 'upload-box-disabled' : ''}`}>
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
                        onClick={() => !disabled && fileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        type="button"
                        disabled={disabled}
                    >
                        <CloudArrowUpIcon className={`upload-icon ${themeColor}`} />
                        <span className="upload-button-text">Click to upload or drag files</span>
                        <CloudArrowUpIcon className={`upload-icon ${themeColor}`} />
                    </button>
                    <p className="upload-file-types">
                        {acceptedExtensions.join(', ')} up to {maxSizeMB}MB
                    </p>
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
                accept={acceptedExtensions.join(',')}
                disabled={disabled}
            />

            {/* Files row */}
            {selectedFiles.length > 0 && (
                <div className="upload-files-container">
                    <div className="files-list-header">Selected Files ({selectedFiles.length})</div>
                    <div className="files-list">
                        {selectedFiles.map((file, index) => (
                            <div
                                key={index}
                                className="file-item"
                            >
                                {getFileIcon(file.name)}
                                <span className="file-name">
                                    {file.name}
                                </span>
                                <span className="file-size">
                                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                                </span>
                                {!disabled && (
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
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
} 