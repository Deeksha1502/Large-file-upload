const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Enable CORS for React app
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
const chunksDir = path.join(__dirname, 'chunks');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(chunksDir)) {
  fs.mkdirSync(chunksDir);
}

// Configure multer for chunk uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadId = req.params.uploadId;
      if (!uploadId) {
        console.error('Error: uploadId is missing in URL parameters');
        return cb(new Error('Missing uploadId in URL parameters'));
      }
      const chunkDir = path.join(chunksDir, uploadId);
      if (!fs.existsSync(chunkDir)) {
        fs.mkdirSync(chunkDir, { recursive: true });
      }
      cb(null, chunkDir);
    },
    filename: (req, file, cb) => {
      // Use a temporary name - we'll rename it after processing
      cb(null, 'temp_chunk');
    }
  });

const upload = multer({ storage });

// Store upload sessions
const uploadSessions = new Map();

// Initialize upload session
app.post('/upload/start', (req, res) => {
  const { fileName, fileSize, totalChunks } = req.body;
  const uploadId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  
  uploadSessions.set(uploadId, {
    fileName,
    fileSize,
    totalChunks,
    uploadedChunks: new Set(),
    startTime: Date.now()
  });
  
  console.log(`🚀 Upload session started: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  
  res.json({ uploadId });
});

// Upload individual chunk
app.post('/upload/chunk/:uploadId', upload.single('chunk'), (req, res) => {
    // Change this line to use URL params instead of body
    const uploadId = req.params.uploadId; // Get uploadId from URL params
    const { chunkIndex } = req.body;
    
    console.log(`Processing chunk ${chunkIndex} for upload ${uploadId}`);
    console.log('Request body:', req.body);
    console.log('Uploaded file:', req.file); // Log the file object
    
    const session = uploadSessions.get(uploadId);
    
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    const tempPath = req.file.path;
    const finalPath = path.join(chunksDir, uploadId, `chunk_${chunkIndex}`);
    
    fs.renameSync(tempPath, finalPath);
    console.log(`Renamed ${tempPath} to ${finalPath}`);
    
    if (!fs.existsSync(finalPath)) {
      console.error(`Warning: Chunk file not found at ${finalPath} after upload`);
    } else {
      console.log(`Chunk ${chunkIndex} saved successfully at ${finalPath}`);
    }
    
    session.uploadedChunks.add(parseInt(chunkIndex));
    
    const progress = (session.uploadedChunks.size / session.totalChunks) * 100;
    
    console.log(`📦 Chunk ${chunkIndex}/${session.totalChunks - 1} uploaded (${progress.toFixed(1)}%)`);
    
    res.json({ 
      success: true, 
      chunkIndex: parseInt(chunkIndex),
      progress: progress.toFixed(1)
    });
  });



// Complete upload and merge chunks
// Complete upload and merge chunks
app.post('/upload/complete', async (req, res) => {
    const { uploadId } = req.body;
    const session = uploadSessions.get(uploadId);
    
    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    
    try {
      console.log('🔄 Merging chunks...');
      console.log(`Looking for chunks in directory: ${path.join(chunksDir, uploadId)}`);
      
      // Check if the chunks directory exists
      const chunkDirPath = path.join(chunksDir, uploadId);
      if (!fs.existsSync(chunkDirPath)) {
        throw new Error(`Chunks directory not found for uploadId: ${uploadId}`);
      }
      
      // List files in the chunks directory
      const files = fs.readdirSync(chunkDirPath);
      console.log(`Found ${files.length} files in chunks directory: ${files.join(', ')}`);
      
      const finalFilePath = path.join(uploadsDir, session.fileName);
      const writeStream = fs.createWriteStream(finalFilePath);
      
      // Merge chunks in order
      let missingChunks = [];
      
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(chunkDirPath, `chunk_${i}`);
        
        if (fs.existsSync(chunkPath)) {
          const chunkData = fs.readFileSync(chunkPath);
          writeStream.write(chunkData);
        } else {
          missingChunks.push(i);
          console.error(`Missing chunk ${i} at path: ${chunkPath}`);
        }
      }
      
      if (missingChunks.length > 0) {
        throw new Error(`Missing chunks: ${missingChunks.join(', ')}`);
      }
      
      writeStream.end();
      
      // Clean up chunk files
      fs.rmSync(chunkDirPath, { recursive: true });
      
      const uploadTime = ((Date.now() - session.startTime) / 1000).toFixed(2);
      
      console.log(`✅ Upload completed: ${session.fileName} in ${uploadTime}s`);
      
      // Clean up session
      uploadSessions.delete(uploadId);
      
      res.json({ 
        success: true, 
        fileName: session.fileName,
        fileSize: session.fileSize,
        uploadTime: `${uploadTime}s`
      });
      
    } catch (error) {
      console.error('❌ Upload failed:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

// Get upload progress
app.get('/upload/status/:uploadId', (req, res) => {
  const { uploadId } = req.params;
  const session = uploadSessions.get(uploadId);
  
  if (!session) {
    return res.status(404).json({ error: 'Upload session not found' });
  }
  
  const progress = (session.uploadedChunks.size / session.totalChunks) * 100;
  
  res.json({
    progress: progress.toFixed(1),
    uploadedChunks: session.uploadedChunks.size,
    totalChunks: session.totalChunks,
    fileName: session.fileName
  });
});

// List uploaded files
app.get('/files', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir).map(fileName => {
      const filePath = path.join(uploadsDir, fileName);
      const stats = fs.statSync(filePath);
      
      return {
        name: fileName,
        size: stats.size,
        uploadDate: stats.birthtime,
        sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`
      };
    });
    
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.delete('/files/:fileName', (req, res) => {
    try {
      const { fileName } = req.params;
      
      // Prevent path traversal attacks
      const sanitizedFileName = path.basename(fileName);
      const filePath = path.join(uploadsDir, sanitizedFileName);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Delete the file
      fs.unlinkSync(filePath);
      
      console.log(`🗑️ Deleted file: ${sanitizedFileName}`);
      
      res.json({ 
        success: true, 
        message: `File ${sanitizedFileName} successfully deleted`
      });
    } catch (error) {
      console.error('❌ Delete failed:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

app.listen(PORT, () => {
  console.log(`🚀 Chunked upload server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads will be saved to: ${uploadsDir}`);
});