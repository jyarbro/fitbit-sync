# Data Layer Documentation

This directory contains the data layer using the repository pattern with kebab-case naming convention.

## Structure

```
src/data/
├── index.js                    # Entry point - exports all classes
├── database-connection.js      # Database connection management
├── base-repository.js          # Base class for all repositories
├── token-repository.js         # Authentication tokens operations
├── sample-repository.js        # Health data samples operations
├── sync-log-repository.js      # Sync log operations
└── data-service.js             # Main service orchestrating all repositories
```

## Usage Example

```javascript
import { DataService } from '../data/index.js';

const data_service = new DataService();
await data_service.initialize();

// Use repositories directly
const tokens = await data_service.token_repository.get_tokens();
const samples = await data_service.sample_repository.get_samples_since('2024-01-01');
```

## Design Principles

- **Separation of Concerns:** Each repository handles one domain (tokens, samples, sync logs)
- **Testability:** Easy to mock individual repositories for testing
- **Maintainability:** Clear structure and single responsibility for each class
- **Consistent Naming:** Uses kebab-case throughout

## Repository Pattern

Each repository extends `BaseRepository` which provides common database operations:
- `execute_query()` - Execute queries that modify data
- `fetch_one()` - Fetch single row
- `fetch_all()` - Fetch multiple rows

All repositories follow the same pattern and naming convention.
