/**
 * Token repository for authentication token operations.
 * @module backend/data/token-repository
 */
import BaseRepository from './base-repository.js';

/**
 * Repository for managing authentication tokens.
 */
class TokenRepository extends BaseRepository {
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

  async get_tokens() {
    return await this.fetch_one(
      'SELECT * FROM tokens ORDER BY created_at DESC LIMIT 1'
    );
  }
}

export default TokenRepository;
