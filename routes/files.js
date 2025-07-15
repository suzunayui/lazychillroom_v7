const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const uploadDir = path.join(process.env.UPLOAD_DIR || './uploads', 'files');
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4', 'audio/mpeg', 'audio/wav'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('許可されていないファイル形式です'));
    }
  }
});

// Upload file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'ファイルが選択されていません'
      });
    }

    const { channel_id } = req.body;

    if (!channel_id) {
      return res.status(400).json({
        success: false,
        message: 'チャンネルIDが必要です'
      });
    }

    // Check if user has access to this channel
    const channelAccess = await query(`
      SELECT c.id FROM channels c
      JOIN guild_members gm ON c.guild_id = gm.guild_id
      WHERE c.id = ? AND gm.user_id = ? AND gm.is_active = 1
    `, [channel_id, req.user.id]);

    if (channelAccess.length === 0) {
      // Delete the uploaded file
      await fs.unlink(req.file.path).catch(console.error);
      
      return res.status(403).json({
        success: false,
        message: 'このチャンネルにファイルをアップロードする権限がありません'
      });
    }

    // Save file info to database
    const result = await query(`
      INSERT INTO files (
        original_name, filename, file_path, file_size, mime_type, 
        uploaded_by, channel_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      req.file.originalname,
      req.file.filename,
      req.file.path,
      req.file.size,
      req.file.mimetype,
      req.user.id,
      channel_id
    ]);

    const fileInfo = {
      id: result.insertId,
      original_name: req.file.originalname,
      filename: req.file.filename,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      url: `/uploads/files/${req.file.filename}`,
      uploaded_by: req.user.id,
      channel_id: parseInt(channel_id),
      created_at: new Date()
    };

    // Create a message for the file upload
    const { content = '' } = req.body;
    
    // 画像ファイルの場合はデフォルトメッセージを空にする
    let messageContent = content;
    if (!content) {
      const isImage = req.file.mimetype && req.file.mimetype.startsWith('image/');
      messageContent = isImage ? '' : `ファイルをアップロードしました: ${req.file.originalname}`;
    }
    
    const messageResult = await query(`
      INSERT INTO messages (content, channel_id, user_id, created_at)
      VALUES (?, ?, ?, NOW())
    `, [messageContent, channel_id, req.user.id]);

    // Get user info for the message
    const userInfo = await query(`
      SELECT id, username, nickname, avatar_url FROM users WHERE id = ?
    `, [req.user.id]);

    const messageObj = {
      id: messageResult.insertId,
      content: messageContent,
      channel_id: parseInt(channel_id),
      user_id: req.user.id,
      username: userInfo[0].username,
      nickname: userInfo[0].nickname,
      avatar_url: userInfo[0].avatar_url,
      created_at: new Date(),
      file_info: fileInfo,
      file_url: fileInfo.url,
      file_name: fileInfo.original_name,
      file_size: fileInfo.file_size,
      file_id: fileInfo.id
    };

    res.json({
      success: true,
      message: messageObj,
      file: fileInfo
    });

  } catch (error) {
    // Delete the uploaded file if there was an error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }

    console.error('File upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'ファイルサイズが大きすぎます'
      });
    }

    res.status(500).json({
      success: false,
      message: 'ファイルのアップロードに失敗しました'
    });
  }
});

// Download/view file
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info
    const files = await query(`
      SELECT f.*, c.guild_id
      FROM files f
      JOIN channels c ON f.channel_id = c.id
      WHERE f.id = ?
    `, [fileId]);

    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ファイルが見つかりません'
      });
    }

    const file = files[0];

    // Check if user has access to this file's channel
    const access = await query(`
      SELECT gm.id FROM guild_members gm
      WHERE gm.guild_id = ? AND gm.user_id = ? AND gm.is_active = 1
    `, [file.guild_id, req.user.id]);

    if (access.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'このファイルにアクセスする権限がありません'
      });
    }

    // Check if file exists on disk
    try {
      await fs.access(file.file_path);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'ファイルが見つかりません'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);

    // Send file
    res.sendFile(path.resolve(file.file_path));

  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({
      success: false,
      message: 'ファイルの取得に失敗しました'
    });
  }
});

// Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    // Get file info
    const files = await query(`
      SELECT f.*, c.guild_id
      FROM files f
      JOIN channels c ON f.channel_id = c.id
      WHERE f.id = ?
    `, [fileId]);

    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ファイルが見つかりません'
      });
    }

    const file = files[0];

    // Check if user uploaded this file or has admin rights
    if (file.uploaded_by !== req.user.id) {
      const isAdmin = await query(`
        SELECT gm.role FROM guild_members gm
        WHERE gm.guild_id = ? AND gm.user_id = ? AND gm.role IN ('owner', 'admin')
      `, [file.guild_id, req.user.id]);

      if (isAdmin.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'このファイルを削除する権限がありません'
        });
      }
    }

    // Delete file from database
    await query('DELETE FROM files WHERE id = ?', [fileId]);

    // Delete file from disk
    try {
      await fs.unlink(file.file_path);
    } catch (error) {
      console.error('Error deleting file from disk:', error);
      // Continue even if file deletion fails
    }

    res.json({
      success: true,
      message: 'ファイルを削除しました'
    });

  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'ファイルの削除に失敗しました'
    });
  }
});

// Get files for a channel
router.get('/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Check if user has access to this channel
    const channelAccess = await query(`
      SELECT c.id FROM channels c
      JOIN guild_members gm ON c.guild_id = gm.guild_id
      WHERE c.id = ? AND gm.user_id = ? AND gm.is_active = 1
    `, [channelId, req.user.id]);

    if (channelAccess.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'このチャンネルにアクセスする権限がありません'
      });
    }

    // Get files
    const files = await query(`
      SELECT 
        f.id,
        f.original_name,
        f.filename,
        f.file_size,
        f.mime_type,
        f.uploaded_by,
        f.created_at,
        u.username as uploaded_by_username
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      WHERE f.channel_id = ?
      ORDER BY f.created_at DESC
      LIMIT ? OFFSET ?
    `, [channelId, parseInt(limit), parseInt(offset)]);

    // Add URL to each file
    const filesWithUrls = files.map(file => ({
      ...file,
      url: `/api/files/${file.id}`
    }));

    res.json({
      success: true,
      files: filesWithUrls
    });

  } catch (error) {
    console.error('Get channel files error:', error);
    res.status(500).json({
      success: false,
      message: 'ファイルリストの取得に失敗しました'
    });
  }
});

module.exports = router;
