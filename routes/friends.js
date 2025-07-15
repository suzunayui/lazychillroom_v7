const express = require('express');
const Joi = require('joi');
const { query } = require('../config/database');

const router = express.Router();

// Validation schemas
const friendRequestSchema = Joi.object({
  username: Joi.string().min(3).max(30).required()
});

// Get friends list
router.get('/', async (req, res) => {
  try {
    const friends = await query(`
      SELECT 
        f.id,
        f.status,
        f.created_at,
        u.id as friend_id,
        u.username,
        u.nickname,
        u.avatar_url,
        u.last_login
      FROM friends f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'accepted'
      ORDER BY u.nickname ASC
    `, [req.user.id]);

    res.json({
      success: true,
      friends
    });

  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({
      success: false,
      message: 'フレンドリストの取得に失敗しました'
    });
  }
});

// Get friend requests
router.get('/requests', async (req, res) => {
  try {
    // Incoming requests
    const incomingRequests = await query(`
      SELECT 
        f.id,
        f.created_at,
        u.id as user_id,
        u.username,
        u.nickname,
        u.avatar_url
      FROM friends f
      JOIN users u ON f.user_id = u.id
      WHERE f.friend_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [req.user.id]);

    // Outgoing requests
    const outgoingRequests = await query(`
      SELECT 
        f.id,
        f.created_at,
        u.id as friend_id,
        u.username,
        u.nickname,
        u.avatar_url
      FROM friends f
      JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      incoming: incomingRequests,
      outgoing: outgoingRequests
    });

  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({
      success: false,
      message: 'フレンドリクエストの取得に失敗しました'
    });
  }
});

// Send friend request
router.post('/request', async (req, res) => {
  try {
    const { error, value } = friendRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { username } = value;

    // Find target user
    const targetUsers = await query(
      'SELECT id, username, nickname FROM users WHERE username = ? AND is_active = 1',
      [username]
    );

    if (targetUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
    }

    const targetUser = targetUsers[0];

    // Can't add yourself
    if (targetUser.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: '自分自身をフレンドに追加することはできません'
      });
    }

    // Check if friendship already exists
    const existingFriendship = await query(
      'SELECT id, status FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [req.user.id, targetUser.id, targetUser.id, req.user.id]
    );

    if (existingFriendship.length > 0) {
      const status = existingFriendship[0].status;
      if (status === 'accepted') {
        return res.status(409).json({
          success: false,
          message: '既にフレンドです'
        });
      } else if (status === 'pending') {
        return res.status(409).json({
          success: false,
          message: 'フレンドリクエストは既に送信済みです'
        });
      }
    }

    // Send friend request
    await query(
      'INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, ?, NOW())',
      [req.user.id, targetUser.id, 'pending']
    );

    res.status(201).json({
      success: true,
      message: `${targetUser.nickname}にフレンドリクエストを送信しました`
    });

  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'フレンドリクエストの送信に失敗しました'
    });
  }
});

// Accept friend request
router.post('/accept/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    // Find the request
    const requests = await query(
      'SELECT id, user_id, friend_id FROM friends WHERE id = ? AND friend_id = ? AND status = ?',
      [requestId, req.user.id, 'pending']
    );

    if (requests.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'フレンドリクエストが見つかりません'
      });
    }

    const request = requests[0];

    // Accept the request
    await query(
      'UPDATE friends SET status = ?, updated_at = NOW() WHERE id = ?',
      ['accepted', requestId]
    );

    // Create reciprocal friendship
    await query(
      'INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE status = ?, updated_at = NOW()',
      [req.user.id, request.user_id, 'accepted', 'accepted']
    );

    res.json({
      success: true,
      message: 'フレンドリクエストを承認しました'
    });

  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'フレンドリクエストの承認に失敗しました'
    });
  }
});

// Decline friend request
router.delete('/decline/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    const result = await query(
      'DELETE FROM friends WHERE id = ? AND friend_id = ? AND status = ?',
      [requestId, req.user.id, 'pending']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'フレンドリクエストが見つかりません'
      });
    }

    res.json({
      success: true,
      message: 'フレンドリクエストを拒否しました'
    });

  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'フレンドリクエストの拒否に失敗しました'
    });
  }
});

// Remove friend
router.delete('/:friendId', async (req, res) => {
  try {
    const { friendId } = req.params;

    // Remove both directions of friendship
    await query(
      'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [req.user.id, friendId, friendId, req.user.id]
    );

    res.json({
      success: true,
      message: 'フレンドを削除しました'
    });

  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({
      success: false,
      message: 'フレンドの削除に失敗しました'
    });
  }
});

module.exports = router;
