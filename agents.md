# AI Agent Guidelines for Informed News

## Project Overview

Informed News is a React/TypeScript news aggregation application that allows users to:
- Aggregate news from multiple RSS feeds and API sources
- Manage custom news sources (RSS, API, manual URLs, scraping)
- Filter and search articles by source, favorites, and read status
- Track reading progress with read/unread status
- Save favorite articles
- Authenticate users with local storage-based authentication

## Architecture

### Core Technologies
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: React Context API with useReducer pattern
- **Storage**: LocalStorage for user data and application state
- **Authentication**: Local storage-based (not Supabase, despite package being installed)

### Project Structure
```
src/
├── components/          # React components organized by feature
│   ├── Auth/           # Authentication components
│   ├── Filters/        # Article filtering components
│   ├── Layout/         # Layout components (Header, etc.)
│   ├── News/           # News article display components
│   ├── Sources/        # News source management components
│   └── UI/             # Reusable UI components
├── context/            # React Context and reducer
│   ├── AppContext.tsx  # Main application context
│   └── appReducer.ts   # State reducer with action handlers
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
│   ├── auth.ts         # Authentication utilities
│   ├── newsFetcher.ts  # News fetching logic
│   └── storage.ts      # LocalStorage utilities
└── main.tsx            # Application entry point
```

## AI Agent Responsibilities

### Code Generation
- **ALWAYS** use TypeScript with strict type checking
- **ALWAYS** follow the existing component structure and patterns
- **ALWAYS** use functional components with hooks
- **ALWAYS** use the `useApp()` hook for accessing application state
- **ALWAYS** dispatch actions through the context reducer, never mutate state directly
- **ALWAYS** use Tailwind CSS classes for styling (no inline styles)
- **ALWAYS** use Lucide React icons for UI icons
- **ALWAYS** handle loading and error states appropriately

### State Management
- **ALWAYS** add new state properties to `AppState` interface in `src/types/index.ts`
- **ALWAYS** add corresponding action types to `AppAction` union type
- **ALWAYS** implement action handlers in `appReducer.ts`
- **ALWAYS** use the reducer pattern - never mutate state directly
- **ALWAYS** ensure state persistence through `AppContext` debounced save mechanism

### Component Development
- **ALWAYS** create components in the appropriate feature directory
- **ALWAYS** use TypeScript interfaces for component props
- **ALWAYS** follow the existing naming conventions (PascalCase for components)
- **ALWAYS** use the `useApp()` hook to access state and dispatch
- **ALWAYS** handle user interactions through dispatch actions
- **ALWAYS** implement proper error boundaries and error handling

### Data Fetching
- **ALWAYS** use the `fetchNewsFromSource()` and `fetchAllNews()` utilities from `src/utils/newsFetcher.ts`
- **ALWAYS** handle errors gracefully and dispatch `SET_ERROR` actions
- **ALWAYS** dispatch `SET_FETCHING` actions to manage loading states
- **ALWAYS** dispatch `ADD_ARTICLES` actions to update the article list
- **ALWAYS** respect source configuration (enabled/disabled, error handling)

### Authentication
- **ALWAYS** use authentication utilities from `src/utils/auth.ts`
- **ALWAYS** check `state.authentication.isAuthenticated` before rendering protected content
- **ALWAYS** use `LOGIN` and `LOGOUT` actions for authentication state changes
- **ALWAYS** handle session restoration on app load through `RESTORE_AUTH` action

### Storage Management
- **ALWAYS** use storage utilities from `src/utils/storage.ts`
- **ALWAYS** rely on the context's automatic debounced save mechanism
- **ALWAYS** use `LOAD_STATE` action to restore saved state
- **ALWAYS** ensure user-specific data is scoped by `userId`

## File Interaction Standards

### When Adding New Features
1. **Types First**: Add TypeScript interfaces to `src/types/index.ts`
2. **Reducer Actions**: Add action types and handlers to `appReducer.ts`
3. **Components**: Create components in appropriate feature directories
4. **Utilities**: Add utility functions to appropriate `src/utils/` files
5. **Integration**: Wire up components using `useApp()` hook

### When Modifying Existing Features
1. **ALWAYS** check existing patterns before making changes
2. **ALWAYS** maintain backward compatibility with existing state structure
3. **ALWAYS** update types if changing data structures
4. **ALWAYS** update reducer if changing state shape
5. **ALWAYS** test state persistence after changes

## Development Patterns

### Component Pattern
```typescript
import { useApp } from '../context/AppContext';
import type { ComponentProps } from '../types';

interface MyComponentProps {
  // Define props
}

export function MyComponent({ ...props }: MyComponentProps) {
  const { state, dispatch } = useApp();
  
  // Component logic
  
  return (
    // JSX with Tailwind classes
  );
}
```

### Action Dispatch Pattern
```typescript
// Update state through actions
dispatch({ type: 'SET_FILTER', payload: { searchQuery: 'example' } });

// Add new items
dispatch({ type: 'ADD_ARTICLES', payload: newArticles });

// Update existing items
dispatch({ 
  type: 'UPDATE_ARTICLE', 
  payload: { id: '123', updates: { isRead: true } } 
});
```

## Prohibited Actions

- **NEVER** mutate state directly - always use dispatch actions
- **NEVER** bypass the context reducer
- **NEVER** use inline styles - always use Tailwind CSS
- **NEVER** create global state outside of AppContext
- **NEVER** access localStorage directly - use storage utilities
- **NEVER** hardcode user IDs or authentication logic
- **NEVER** skip error handling in async operations
- **NEVER** create components without TypeScript interfaces

## Decision-Making Guidelines

### Priority Order
1. **Type Safety**: Ensure all code is properly typed
2. **State Consistency**: Maintain reducer pattern and state structure
3. **User Experience**: Handle loading, errors, and edge cases
4. **Code Reusability**: Extract common patterns into utilities
5. **Performance**: Use useMemo/useCallback where appropriate

### When Adding New Features
1. Check if similar functionality exists
2. Follow existing patterns and conventions
3. Add types first, then reducer actions, then components
4. Ensure proper error handling and loading states
5. Test state persistence

### When Fixing Bugs
1. Identify the root cause in state management
2. Check reducer logic for the affected action
3. Verify type definitions match actual usage
4. Ensure error handling is appropriate
5. Test edge cases and error scenarios

## Code Review Checklist

- [ ] All TypeScript types are defined and used correctly
- [ ] State changes go through reducer actions
- [ ] Components use `useApp()` hook correctly
- [ ] Error handling is implemented
- [ ] Loading states are handled
- [ ] Tailwind CSS classes are used (no inline styles)
- [ ] Components are in appropriate feature directories
- [ ] No direct localStorage access
- [ ] No state mutations outside reducer
- [ ] Proper cleanup in useEffect hooks

## Testing Considerations

- Test state persistence across page reloads
- Test authentication flow (login, logout, session restore)
- Test error handling for failed API calls
- Test filtering and search functionality
- Test source management (add, update, delete, enable/disable)
- Test article interactions (mark read, favorite, delete)

## Performance Guidelines

- Use `useMemo` for expensive computations (like filtered articles)
- Use `useCallback` for functions passed to child components
- Debounce search input if needed
- Lazy load components if bundle size becomes an issue
- Optimize re-renders by splitting context if needed

## Security Considerations

- Never store passwords in plain text (use hashing)
- Validate user input before processing
- Sanitize URLs before fetching
- Handle authentication errors gracefully
- Don't expose sensitive data in error messages

