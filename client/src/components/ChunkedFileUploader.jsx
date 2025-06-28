import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, File, Clock, HardDrive } from 'lucide-react';

const ChunkedFileUploader = () => {
    const [uploadState, setUploadState] = useState('idle'); 
    const [progress, setProgress] = useState(0);
    const [uploadInfo, setUploadInfo] = useState(null);
    const [chunkProgress, setChunkProgress] = useState([]);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [error, setError] = useState(null);
    const [deletingFiles, setDeletingFiles] = useState(new Set());

    const fileInputRef = useRef(null);
    const uploadStartTime = useRef(null);

    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const SERVER_URL = 'http://localhost:5000';

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const handleFileSelect = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setError(null);
        setUploadState('uploading');
        uploadStartTime.current = Date.now();

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const chunks = [];

        // Initialize chunk progress tracking
        const initialProgress = Array(totalChunks).fill('pending');
        setChunkProgress(initialProgress);

        setUploadInfo({
            fileName: file.name,
            fileSize: file.size,
            totalChunks,
            chunkSize: CHUNK_SIZE
        });

        try {
            // Step 1: Initialize upload session
            const startResponse = await fetch(`${SERVER_URL}/upload/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    totalChunks
                })
            });

            const { uploadId } = await startResponse.json();

            // Step 2: Upload chunks
            let uploadedBytes = 0;

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                // Update chunk status to uploading
                setChunkProgress(prev => {
                    const newProgress = [...prev];
                    newProgress[chunkIndex] = 'uploading';
                    return newProgress;
                });

                const formData = new FormData();
                formData.append('chunk', chunk);

                formData.append('chunkIndex', chunkIndex);

                const chunkResponse = await fetch(`${SERVER_URL}/upload/chunk/${uploadId}`, {
                    method: 'POST',
                    body: formData
                });

                if (!chunkResponse.ok) {
                    throw new Error(`Failed to upload chunk ${chunkIndex}`);
                }

                uploadedBytes += chunk.size;
                const progressPercent = (uploadedBytes / file.size) * 100;
                setProgress(progressPercent);

                // Calculate upload speed
                const elapsed = (Date.now() - uploadStartTime.current) / 1000;
                const speed = uploadedBytes / elapsed; // bytes per second
                setUploadSpeed(speed);

                // Update chunk status to completed
                setChunkProgress(prev => {
                    const newProgress = [...prev];
                    newProgress[chunkIndex] = 'completed';
                    return newProgress;
                });
            }

            // Step 3: Complete upload
            const completeResponse = await fetch(`${SERVER_URL}/upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId })
            });

            const result = await completeResponse.json();

            if (result.success) {
                setUploadState('completed');
                loadUploadedFiles();
            } else {
                throw new Error(result.error);
            }

        } catch (err) {
            setError(err.message);
            setUploadState('error');

            // Mark failed chunks
            setChunkProgress(prev =>
                prev.map((status, index) =>
                    status === 'uploading' ? 'failed' : status
                )
            );
        }
    };



    // Then update your file list UI with delete buttons:
    {
        uploadedFiles.map((file, index) => (
            <div key={index} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center">
                    <File className="w-5 h-5 text-gray-400 mr-3" />
                    <div>
                        <p className="font-medium text-gray-900">{file.name}</p>
                        <p className="text-sm text-gray-500">
                            {file.sizeFormatted} • Uploaded {new Date(file.uploadDate).toLocaleString()}
                        </p>
                    </div>
                </div>
                <div>
                    <button
                        onClick={() => deleteFile(file.name)}
                        className="text-red-600 hover:text-red-800 px-3 py-1 rounded hover:bg-red-50"
                    >
                        Delete
                    </button>
                </div>
            </div>
        ))
    }

    const loadUploadedFiles = async () => {
        try {
            const response = await fetch(`${SERVER_URL}/files`);
            const files = await response.json();
            console.log('Loaded files:', files);
            const filesWithFormatting = files.map(file => ({
                ...file,
                // If sizeFormatted doesn't exist, create it
                sizeFormatted: file.sizeFormatted || formatFileSize(file.size)
              }));
            setUploadedFiles(filesWithFormatting);
        } catch (err) {
            console.error('Failed to load files:', err);
        }
    };

    const resetUpload = () => {
        setUploadState('idle');
        setProgress(0);
        setUploadInfo(null);
        setChunkProgress([]);
        setUploadSpeed(0);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const getChunkStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'bg-green-500';
            case 'uploading': return 'bg-blue-500 animate-pulse';
            case 'failed': return 'bg-red-500';
            default: return 'bg-gray-300';
        }
    };
    const deleteFile = async (fileName) => {
        // Show confirmation dialog
        if (!window.confirm(`Are you sure you want to delete ${fileName}?`)) {
            return;
        }

        try {
            // Set loading state
            setDeletingFiles(prev => new Set([...prev, fileName]));

            const response = await fetch(`${SERVER_URL}/files/${encodeURIComponent(fileName)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to delete file');
            }

            // Refresh the file list after deletion
            loadUploadedFiles();
        } catch (err) {
            console.error('Failed to delete file:', err);
            setError(`Failed to delete ${fileName}: ${err.message}`);
        } finally {
            // Reset loading state
            setDeletingFiles(prev => {
                const newSet = new Set([...prev]);
                newSet.delete(fileName);
                return newSet;
            });
        }
    };

    React.useEffect(() => {
        loadUploadedFiles();
    }, []);

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    Chunked File Upload Demo
                </h1>
                <p className="text-gray-600">
                    Upload large files by splitting them into smaller chunks for better reliability and progress tracking.
                </p>
            </div>

            {/* Upload Section */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8">
                {uploadState === 'idle' && (
                    <div className="text-center">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12">
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-xl font-medium text-gray-700 mb-2">
                                Select a large file to upload
                            </p>
                            <p className="text-gray-500 mb-4">
                                Perfect for testing with your 1GB video file
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                onChange={handleFileSelect}
                                className="hidden"
                                accept="*/*"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Choose File
                            </button>
                        </div>
                    </div>
                )}

                {uploadState === 'uploading' && uploadInfo && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                                Uploading: {uploadInfo.fileName}
                            </h3>
                            <div className="text-sm text-gray-600">
                                {formatFileSize(uploadInfo.fileSize)} • {uploadInfo.totalChunks} chunks
                            </div>
                        </div>

                        {/* Overall Progress */}
                        <div className="mb-6">
                            <div className="flex justify-between text-sm text-gray-600 mb-1">
                                <span>Overall Progress</span>
                                <span>{progress.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                                <div
                                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        {/* Upload Stats */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-white p-3 rounded-lg">
                                <div className="flex items-center">
                                    <Clock className="w-4 h-4 text-gray-500 mr-2" />
                                    <div>
                                        <p className="text-xs text-gray-500">Upload Speed</p>
                                        <p className="font-semibold">{formatFileSize(uploadSpeed)}/s</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-3 rounded-lg">
                                <div className="flex items-center">
                                    <HardDrive className="w-4 h-4 text-gray-500 mr-2" />
                                    <div>
                                        <p className="text-xs text-gray-500">Chunk Size</p>
                                        <p className="font-semibold">{formatFileSize(CHUNK_SIZE)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-3 rounded-lg">
                                <div className="flex items-center">
                                    <File className="w-4 h-4 text-gray-500 mr-2" />
                                    <div>
                                        <p className="text-xs text-gray-500">Chunks</p>
                                        <p className="font-semibold">
                                            {chunkProgress.filter(s => s === 'completed').length}/{uploadInfo.totalChunks}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Chunk Progress Visualization */}
                        <div>
    <p className="text-sm text-gray-600 mb-2">Chunk Upload Status:</p>
    <div className="flex h-40 overflow-y-auto">
        {/* This will create columns of chunks */}
        {Array.from({ length: Math.ceil(chunkProgress.length / 10) }).map((_, colIndex) => (
            <div key={colIndex} className="flex flex-col space-y-1 mr-1">
                {/* For each column, render chunks that belong to it */}
                {chunkProgress
                    .slice(colIndex * 10, (colIndex + 1) * 10)
                    .map((status, rowIndex) => {
                        const actualIndex = colIndex * 10 + rowIndex;
                        return (
                            <div
                                key={actualIndex}
                                className={`w-8 h-2 rounded-sm ${getChunkStatusColor(status)}`}
                                title={`Chunk ${actualIndex}: ${status}`}
                            />
                        );
                    })}
            </div>
        ))}
    </div>
    <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>Chunk 0</span>
        <span>Chunk {uploadInfo.totalChunks - 1}</span>
    </div>
</div>
                    </div>
                )}

                {uploadState === 'completed' && (
                    <div className="text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Upload Completed Successfully!
                        </h3>
                        <p className="text-gray-600 mb-4">
                            {uploadInfo?.fileName} has been uploaded and assembled.
                        </p>
                        <button
                            onClick={resetUpload}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Upload Another File
                        </button>
                    </div>
                )}

                {uploadState === 'error' && (
                    <div className="text-center">
                        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Upload Failed
                        </h3>
                        <p className="text-red-600 mb-4">{error}</p>
                        <button
                            onClick={resetUpload}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>



            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
                <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="px-6 py-4 border-b">
                        <h3 className="text-lg font-semibold text-gray-900">Uploaded Files</h3>
                    </div>
                    <div className="divide-y">
                        {uploadedFiles.map((file, index) => (
                            <div key={index} className="px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center">
                                    <File className="w-5 h-5 text-gray-400 mr-3" />
                                    <div>
                                        <p className="font-medium text-gray-900">{file.name}</p>
                                        <p className="text-sm text-gray-500">
                                            {file.sizeFormatted} • Uploaded {new Date(file.uploadDate).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <button
                                        onClick={() => deleteFile(file.name)}
                                        disabled={deletingFiles.has(file.name)}
                                        className={`px-3 py-1 rounded ${deletingFiles.has(file.name)
                                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                : 'text-red-600 hover:text-red-800 hover:bg-red-50'
                                            }`}
                                    >
                                        {deletingFiles.has(file.name) ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChunkedFileUploader;