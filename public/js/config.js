// API Configuration
const CONFIG = {
    API_BASE_URL: window.location.origin + '/api',
    SOCKET_URL: window.location.origin,
    
    // API Endpoints
    ENDPOINTS: {
        AUTH: {
            LOGIN: '/auth/login',
            REGISTER: '/auth/register',
            VERIFY: '/auth/verify'
        },
        GUILDS: {
            LIST: '/guilds',
            CREATE: '/guilds',
            GET: '/guilds/{id}',
            JOIN: '/guilds/join/{code}',
            LEAVE: '/guilds/{id}/leave'
        },
        CHANNELS: {
            LIST: '/channels/guild/{guildId}',
            CREATE: '/channels',
            UPDATE: '/channels/{id}',
            DELETE: '/channels/{id}'
        },
        MESSAGES: {
            LIST: '/messages',
            SEND: '/messages',
            DELETE: '/messages/{id}'
        },
        FILES: {
            UPLOAD: '/files/upload',
            GET: '/files/{id}',
            DELETE: '/files/{id}',
            CHANNEL: '/files/channel/{channelId}'
        },
        USERS: {
            PROFILE: '/users/profile',
            UPDATE: '/users/profile',
            AVATAR: '/users/avatar',
            SEARCH: '/users/search',
            GET: '/users/{id}'
        }
    },

    // Application Settings
    SETTINGS: {
        MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
        ALLOWED_FILE_TYPES: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'doc', 'docx', 'mp4', 'mp3'],
        MESSAGE_LIMIT: 50,
        TYPING_TIMEOUT: 3000,
        RECONNECT_ATTEMPTS: 5,
        RECONNECT_DELAY: 1000
    }
};

// Helper function to build API URLs
CONFIG.buildUrl = function(endpoint, params = {}) {
    let url = this.API_BASE_URL + endpoint;
    
    // Replace path parameters
    for (const [key, value] of Object.entries(params)) {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
    }
    
    return url;
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
