const { verifyToken } = require('../middleware/auth');
const { query } = require('../config/database');

module.exports = (io) => {
  // Store for user sessions and their channels
  const userSessions = new Map();
  const channelUsers = new Map();

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('認証トークンが必要です'));
      }

      const user = await verifyToken(token);
      if (!user) {
        return next(new Error('無効なトークンです'));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('認証に失敗しました'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.user.username} (${socket.user.id}) connected`);
    
    // Store user session
    userSessions.set(socket.user.id, {
      socketId: socket.id,
      username: socket.user.username,
      avatar_url: socket.user.avatar_url,
      connectedAt: new Date()
    });

    // Join user's guild channels
    socket.on('join_guilds', async () => {
      try {
        // Get user's guilds and channels
        const guilds = await query(`
          SELECT DISTINCT c.id as channel_id
          FROM channels c
          JOIN guild_members gm ON c.guild_id = gm.guild_id
          WHERE gm.user_id = ? AND gm.is_active = 1
        `, [socket.user.id]);

        // Join all channel rooms
        for (const guild of guilds) {
          const roomName = `channel_${guild.channel_id}`;
          socket.join(roomName);
          
          // Track users in channels
          if (!channelUsers.has(guild.channel_id)) {
            channelUsers.set(guild.channel_id, new Set());
          }
          channelUsers.get(guild.channel_id).add(socket.user.id);
        }

        // Emit user presence to all channels
        guilds.forEach(guild => {
          socket.to(`channel_${guild.channel_id}`).emit('user_joined', {
            userId: socket.user.id,
            username: socket.user.username,
            avatar_url: socket.user.avatar_url
          });
        });

      } catch (error) {
        console.error('Error joining guilds:', error);
        socket.emit('error', { message: 'ギルドへの参加に失敗しました' });
      }
    });

    // Join specific channel
    socket.on('join_channel', async (channelId) => {
      try {
        // Verify user has access to this channel
        const access = await query(`
          SELECT c.id FROM channels c
          JOIN guild_members gm ON c.guild_id = gm.guild_id
          WHERE c.id = ? AND gm.user_id = ? AND gm.is_active = 1
        `, [channelId, socket.user.id]);

        if (access.length === 0) {
          socket.emit('error', { message: 'このチャンネルにアクセスする権限がありません' });
          return;
        }

        const roomName = `channel_${channelId}`;
        socket.join(roomName);

        // Track user in channel
        if (!channelUsers.has(channelId)) {
          channelUsers.set(channelId, new Set());
        }
        channelUsers.get(channelId).add(socket.user.id);

        // Notify others in channel
        socket.to(roomName).emit('user_joined', {
          userId: socket.user.id,
          username: socket.user.username,
          avatar_url: socket.user.avatar_url
        });

        // Send current online users in this channel
        const onlineUsers = Array.from(channelUsers.get(channelId) || [])
          .map(userId => userSessions.get(userId))
          .filter(Boolean);

        socket.emit('channel_users', {
          channelId: channelId,
          users: onlineUsers
        });

      } catch (error) {
        console.error('Error joining channel:', error);
        socket.emit('error', { message: 'チャンネルへの参加に失敗しました' });
      }
    });

    // Leave channel
    socket.on('leave_channel', (channelId) => {
      const roomName = `channel_${channelId}`;
      socket.leave(roomName);

      // Remove user from channel tracking
      if (channelUsers.has(channelId)) {
        channelUsers.get(channelId).delete(socket.user.id);
        if (channelUsers.get(channelId).size === 0) {
          channelUsers.delete(channelId);
        }
      }

      // Notify others in channel
      socket.to(roomName).emit('user_left', {
        userId: socket.user.id,
        username: socket.user.username
      });
    });

    // Typing indicators
    socket.on('typing_start', (channelId) => {
      socket.to(`channel_${channelId}`).emit('user_typing', {
        userId: socket.user.id,
        username: socket.user.username,
        channelId: channelId
      });
    });

    socket.on('typing_stop', (channelId) => {
      socket.to(`channel_${channelId}`).emit('user_stop_typing', {
        userId: socket.user.id,
        channelId: channelId
      });
    });

    // Voice channel events (for future implementation)
    socket.on('join_voice', async (channelId) => {
      try {
        // Verify user has access to this voice channel
        const access = await query(`
          SELECT c.id FROM channels c
          JOIN guild_members gm ON c.guild_id = gm.guild_id
          WHERE c.id = ? AND c.type = 'voice' AND gm.user_id = ? AND gm.is_active = 1
        `, [channelId, socket.user.id]);

        if (access.length === 0) {
          socket.emit('error', { message: 'このボイスチャンネルにアクセスする権限がありません' });
          return;
        }

        const roomName = `voice_${channelId}`;
        socket.join(roomName);

        // Notify others in voice channel
        socket.to(roomName).emit('user_joined_voice', {
          userId: socket.user.id,
          username: socket.user.username,
          avatar_url: socket.user.avatar_url,
          channelId: channelId
        });

      } catch (error) {
        console.error('Error joining voice channel:', error);
        socket.emit('error', { message: 'ボイスチャンネルへの参加に失敗しました' });
      }
    });

    socket.on('leave_voice', (channelId) => {
      const roomName = `voice_${channelId}`;
      socket.leave(roomName);

      // Notify others in voice channel
      socket.to(roomName).emit('user_left_voice', {
        userId: socket.user.id,
        username: socket.user.username,
        channelId: channelId
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User ${socket.user.username} (${socket.user.id}) disconnected`);
      
      // Remove user from all channel tracking
      channelUsers.forEach((users, channelId) => {
        if (users.has(socket.user.id)) {
          users.delete(socket.user.id);
          if (users.size === 0) {
            channelUsers.delete(channelId);
          }
          
          // Notify channel that user left
          socket.to(`channel_${channelId}`).emit('user_left', {
            userId: socket.user.id,
            username: socket.user.username
          });
        }
      });

      // Remove user session
      userSessions.delete(socket.user.id);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Store io instance for use in routes
  io.userSessions = userSessions;
  io.channelUsers = channelUsers;

  return io;
};
