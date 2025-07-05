/**
 * Repository for managing authentication tokens.
 * @module backend/data/token-repository
 */
import BaseRepository from './base-repository.js';

/**
 * Repository for managing authentication tokens.
 */
class TokenRepository extends BaseRepository {
  /**
   * Stores new authentication tokens, replacing any existing ones.
   * @param {string} access_token - The access token.
   * @param {string} refresh_token - The refresh token.
   * @param {number} expires_in - Expiry time in seconds.
   * @returns {Promise<number>} The last inserted row ID.
   */
  async store_tokens(access_token, refresh_token, expires_in) {
    const expires_at = Date.now() + (expires_in * 1000);
    
    await this.execute_query('DELETE FROM tokens');
    
    const result = await this.execute_query(
      'INSERT INTO tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)',
      [access_token, refresh_token, expires_at]
    );
    
    console.log('Tokens stored successfully');
    return result.last_id;
  }

  /**
   * Retrieves the most recent authentication tokens.
   * @returns {Promise<Object|null>} The token row or null if not found.
   */
  async get_tokens() {
    return await this.fetch_one(
      'SELECT * FROM tokens ORDER BY created_at DESC LIMIT 1'
    );
  }
}

export default TokenRepository;
