# Data Layer Documentation

This directory contains the refactored data layer using the repository pattern with kebab-case naming convention.

## Structure

```
src/data/
├── index.js                    # Entry point - exports all classes
├── database-connection.js      # Database connection management
├── base-repository.js          # Base class for all repositories
├── token-repository.js         # Authentication tokens operations
├── sample-repository.js        # Health data samples operations
├── sync-log-repository.js      # Sync log operations
└── data-service.js            # Main service orchestrating all repositories
```

## Usage

### New Code (Recommended)
```javascript
import { DataService } from '../data/index.js';

const data_service = new DataService();
await data_service.initialize();

// Use repositories directly
const tokens = await data_service.token_repository.get_tokens();
const samples = await data_service.sample_repository.get_samples_since('2024-01-01');
```

### Legacy Support
The existing `Database` class in `services/database.js` still works as before but now serves as a facade over the new repository pattern:

```javascript
import Database from '../services/database.js';

const db = new Database();
await db.initialize();

// Same API as before
const tokens = await db.getTokens();
const samples = await db.getSamplesSince('2024-01-01');
```

## Benefits

1. **Separation of Concerns**: Each repository handles one domain
2. **Testability**: Easy to mock individual repositories
3. **Maintainability**: Clear structure and single responsibility
4. **Backward Compatibility**: Existing code continues to work
5. **Consistent Naming**: Uses kebab-case throughout

## Migration Path

1. **Phase 1**: Use new `DataService` for new features
2. **Phase 2**: Gradually migrate existing code
3. **Phase 3**: Eventually deprecate the legacy `Database` class

## Repository Pattern

Each repository extends `BaseRepository` which provides common database operations:
- `execute_query()` - Execute queries that modify data
- `fetch_one()` - Fetch single row
- `fetch_all()` - Fetch multiple rows

All repositories follow the same pattern and naming convention.
