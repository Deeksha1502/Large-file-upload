# Chunked File Upload System

A robust file upload system built with React and Node.js that handles large files by splitting them into smaller chunks for reliable uploads, progress tracking, and better error handling.

## Features

- ✅ Upload large files (tested with multi-GB files)
- ✅ Chunk-by-chunk upload with individual progress tracking
- ✅ Pause/resume upload functionality
- ✅ Real-time progress visualization
- ✅ Error handling with automatic retry options
- ✅ Responsive UI with Tailwind CSS
- ✅ File management with delete capabilities
- ✅ Upload speed monitoring

## Project Structure

The project consists of two main parts:

1. **Frontend**: React application with Vite
2. **Backend**: Express.js server

large-file-upload/
├── client/ # React frontend
│ ├── package.json
│ └── src/
│ ├── App.jsx
│ └── components/
│ └── ChunkedFileUploader.jsx
│
├── backend/ # Express backend
│ ├── package.json
│ ├── server.js
│ ├── uploads/ # Completed file storage (auto-created)
│ └── chunks/ # Temporary chunk storage (auto-created)

## Getting Started

### Prerequisites

- Node.js (v14 or newer)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/large-file-upload.git
   cd large-file-upload

2. Install backend dependencies:
   ```bash
   cd backend
   npm install   

3. Install frontend dependencies:
   ```bash
   cd ../client
   npm install 

### Running the Application
1. Start the backend server:
   ```bash
   cd backend
   node server.js
The server will run on http://localhost:5000

2. In a new terminal, start the frontend development server:
   ```bash
   cd client
   npm run dev
The app will run on http://localhost:3000

### API Endpoints

1. POST /upload/start: Initialize an upload session
1. POST /upload/chunk/:uploadId: Upload an individual chunk
1. POST /upload/complete: Complete the upload and merge chunks
1. GET /upload/status/:uploadId: Get upload progress
1. GET /files: List all uploaded files
1. DELETE /files/:fileName: Delete a specific file

### Customization

You can customize various aspects of the upload process:

1. Chunk Size: Modify the `CHUNK_SIZE` constant in `ChunkedFileUploader.jsx` (default: 5MB)
1. Server URL: Change the `SERVER_URL` constant if your backend is running on a different address




   


