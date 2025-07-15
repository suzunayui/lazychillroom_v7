const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');

const router = express.Router();

// Validation schemas
const messageSchema = Joi.object({
  content: Joi.string().max(2000).required(),
  channel_id: Joi.number().integer().positive().required(),
  reply_to: Joi.number().integer().positive().optional()
});

// Get messages for a channel
router.get('/', async (req, res) => {
  console.log('🔍 Messages API called');
  console.log('🔍 Query params:', req.query);
  console.log('🔍 User:', req.user ? `${req.user.username} (${req.user.id})` : 'undefined');
  
  try {
    const { channel_id, limit = 50, before } = req.query;

    if (!channel_id) {
      console.log('❌ Missing channel_id');
      return res.status(400).json({
        success: false,
        message: 'チャンネルIDが必要です'
      });
    }

    // Convert parameters to proper types
    const channelIdInt = parseInt(channel_id);
    const limitInt = Math.max(1, Math.min(100, parseInt(limit) || 50)); // 1-100の範囲に制限
    const beforeInt = before ? parseInt(before) : null;

    console.log('🔍 Converted params:', { channelIdInt, limitInt, beforeInt });

    // Check if user has access to this channel
    const channelAccess = await query(`
      SELECT c.id, c.name, c.guild_id 
      FROM channels c
      JOIN guild_members gm ON c.guild_id = gm.guild_id
      WHERE c.id = ? AND gm.user_id = ? AND gm.is_active = 1
    `, [channelIdInt, req.user.id]);

    if (channelAccess.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'このチャンネルにアクセスする権限がありません'
      });
    }

    // Build query for messages with file information
    let sql = `
      SELECT 
        m.id,
        m.content,
        m.channel_id,
        m.user_id,
        m.reply_to,
        m.created_at,
        m.updated_at,
        f.id as file_id,
        f.original_name as file_name,
        f.filename,
        f.file_size,
        f.mime_type,
        f.file_path
      FROM messages m
      LEFT JOIN files f ON f.channel_id = m.channel_id 
        AND f.uploaded_by = m.user_id
        AND ABS(TIMESTAMPDIFF(SECOND, f.created_at, m.created_at)) <= 2
      WHERE m.channel_id = ?
    `;

    const params = [channelIdInt];

    if (beforeInt) {
      sql += ' AND m.id < ?';
      params.push(beforeInt);
    }

    // Use string interpolation for LIMIT instead of parameter binding
    sql += ` ORDER BY m.created_at DESC LIMIT ${limitInt}`;

    console.log('🔍 SQL Query:', sql);
    console.log('🔍 Parameters:', params);

    const messages = await query(sql, params);

    // Get user info and format file info for each message
    for (let message of messages) {
      const userInfo = await query('SELECT username, nickname, avatar_url FROM users WHERE id = ?', [message.user_id]);
      if (userInfo.length > 0) {
        message.username = userInfo[0].username;
        message.nickname = userInfo[0].nickname;
        message.avatar_url = userInfo[0].avatar_url;
      }
      
      // Add file information if available
      if (message.file_id) {
        message.file_url = `/uploads/files/${message.filename}`;
        message.file_name = message.filename;
        message.original_name = message.file_name;
        // Clean up the individual file fields
        delete message.file_id;
        delete message.filename;
        delete message.file_path;
      }
    }

    // Reverse to get chronological order
    messages.reverse();

    res.json({
      success: true,
      messages,
      channel: channelAccess[0]
    });

  } catch (error) {
    console.error('❌ Get messages error:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      message: 'メッセージの取得に失敗しました'
    });
  }
});

// Send a message
router.post('/', async (req, res) => {
  try {
    // Validate input
    const { error, value } = messageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { content, channel_id, reply_to } = value;

    // Check if user has access to this channel
    const channelAccess = await query(`
      SELECT c.id, c.name, c.guild_id 
      FROM channels c
      JOIN guild_members gm ON c.guild_id = gm.guild_id
      WHERE c.id = ? AND gm.user_id = ? AND gm.is_active = 1
    `, [channel_id, req.user.id]);

    if (channelAccess.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'このチャンネルにメッセージを送信する権限がありません'
      });
    }

    // If replying, check if the message exists and is in the same channel
    if (reply_to) {
      const replyMessage = await query(
        'SELECT id FROM messages WHERE id = ? AND channel_id = ?',
        [reply_to, channel_id]
      );

      if (replyMessage.length === 0) {
        return res.status(400).json({
          success: false,
          message: '返信先のメッセージが見つかりません'
        });
      }
    }

    // Insert message
    console.log('💬 Inserting message:', { content, channel_id, user_id: req.user.id, reply_to });
    const result = await query(
      'INSERT INTO messages (content, channel_id, user_id, reply_to, created_at) VALUES (?, ?, ?, ?, NOW())',
      [content, channel_id, req.user.id, reply_to || null]
    );
    console.log('✅ Message inserted with ID:', result.insertId);

    // Get the created message with user info
    const newMessage = await query(`
      SELECT 
        m.id,
        m.content,
        m.channel_id,
        m.user_id,
        m.reply_to,
        m.created_at,
        m.updated_at,
        u.username,
        u.nickname,
        u.avatar_url,
        rm.content as reply_content,
        ru.username as reply_username,
        ru.nickname as reply_nickname
      FROM messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN messages rm ON m.reply_to = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      WHERE m.id = ?
    `, [result.insertId]);

    const message = newMessage[0];

    // Emit to socket.io for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`channel_${channel_id}`).emit('new_message', message);
    }

    res.status(201).json({
      success: true,
      message: message,
      msg: 'メッセージを送信しました'
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'メッセージの送信に失敗しました'
    });
  }
});

// Delete a message
router.delete('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Check if message exists and belongs to the user
    const messages = await query(
      'SELECT id, user_id, channel_id FROM messages WHERE id = ?',
      [messageId]
    );

    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'メッセージが見つかりません'
      });
    }

    const message = messages[0];

    // Check if user owns the message or has admin rights
    if (message.user_id !== req.user.id) {
      // Check if user is admin of the guild
      const isAdmin = await query(`
        SELECT gm.role 
        FROM guild_members gm
        JOIN channels c ON gm.guild_id = c.guild_id
        WHERE c.id = ? AND gm.user_id = ? AND gm.role IN ('owner', 'admin')
      `, [message.channel_id, req.user.id]);

      if (isAdmin.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'このメッセージを削除する権限がありません'
        });
      }
    }

    // Delete the message
    await query('DELETE FROM messages WHERE id = ?', [messageId]);

    // Emit to socket.io for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`channel_${message.channel_id}`).emit('message_deleted', {
        messageId: parseInt(messageId),
        channelId: message.channel_id
      });
    }

    res.json({
      success: true,
      message: 'メッセージを削除しました'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'メッセージの削除に失敗しました'
    });
  }
});

// Edit a message
router.put('/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    // Validation
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'メッセージ内容が必要です'
      });
    }

    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'メッセージは2000文字以内で入力してください'
      });
    }

    // Check if message exists and belongs to the user
    const messages = await query(
      'SELECT id, user_id, channel_id, content FROM messages WHERE id = ?',
      [messageId]
    );

    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'メッセージが見つかりません'
      });
    }

    const message = messages[0];

    // Check if user owns the message
    if (message.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'このメッセージを編集する権限がありません'
      });
    }

    // Save edit history
    await query(
      'INSERT INTO message_edit_history (message_id, old_content) VALUES (?, ?)',
      [messageId, message.content]
    );

    // Update the message
    await query(
      'UPDATE messages SET content = ?, updated_at = NOW() WHERE id = ?',
      [content.trim(), messageId]
    );

    // Get updated message with user info
    const updatedMessage = await query(`
      SELECT 
        m.id,
        m.content,
        m.channel_id,
        m.user_id,
        m.reply_to,
        m.created_at,
        m.updated_at,
        u.username,
        u.avatar_url,
        rm.content as reply_content,
        ru.username as reply_username
      FROM messages m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN messages rm ON m.reply_to = rm.id
      LEFT JOIN users ru ON rm.user_id = ru.id
      WHERE m.id = ?
    `, [messageId]);

    const editedMessage = updatedMessage[0];

    // Emit to socket.io for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`channel_${message.channel_id}`).emit('message_edited', editedMessage);
    }

    res.json({
      success: true,
      message: editedMessage,
      msg: 'メッセージを編集しました'
    });

  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      message: 'メッセージの編集に失敗しました'
    });
  }
});

module.exports = router;
