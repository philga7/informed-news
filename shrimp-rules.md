# Development Standards for Informed News

## Project Overview

Informed News is a React/TypeScript news aggregation application built with Vite, Tailwind CSS, and local storage-based authentication. The application allows users to aggregate news from multiple sources, filter articles, and manage their reading experience.

## Architecture

### Technology Stack
- **React 18**: Functional components with hooks
- **TypeScript**: Strict type checking enabled
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **Context API + useReducer**: State management pattern
- **LocalStorage**: Data persistence

### State Management Pattern
- **Single Source of Truth**: `AppState` interface in `src/types/index.ts`
- **Reducer Pattern**: All state changes through `appReducer.ts`
- **Context Provider**: `AppContext` wraps the entire application
- **Custom Hook**: `useApp()` provides state and dispatch
- **Automatic Persistence**: Debounced save to localStorage (500ms delay)

## Code Standards

### TypeScript
- **ALWAYS** use strict TypeScript configuration
- **ALWAYS** define interfaces for all data structures
- **ALWAYS** type component props explicitly
- **ALWAYS** use type unions for action types
- **NEVER** use `any` type - use `unknown` if type is truly unknown
- **NEVER** skip type definitions for function parameters or return values

### Component Standards
- **ALWAYS** use functional components (no class components)
- **ALWAYS** use PascalCase for component names
- **ALWAYS** define props interface before component
- **ALWAYS** use the `useApp()` hook to access state
- **ALWAYS** dispatch actions to modify state
- **ALWAYS** handle loading and error states
- **NEVER** mutate state directly
- **NEVER** access localStorage directly in components
- **NEVER** use inline styles - use Tailwind CSS classes

### File Organization
```
src/
├── components/          # Feature-based component organization
│   ├── Auth/           # Authentication-related components
│   ├── Filters/        # Article filtering components
│   ├── Layout/         # Layout components (Header, etc.)
│   ├── News/           # News article display components
│   ├── Sources/        # News source management components
│   └── UI/             # Reusable UI components (LoadingSpinner, EmptyState)
├── context/            # React Context and state management
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── main.tsx            # Application entry point
```

### Naming Conventions
- **Components**: PascalCase (e.g., `ArticleCard.tsx`)
- **Hooks**: camelCase starting with "use" (e.g., `useApp`)
- **Utilities**: camelCase (e.g., `fetchNewsFromSource`)
- **Types/Interfaces**: PascalCase (e.g., `NewsArticle`, `AppState`)
- **Actions**: UPPER_SNAKE_CASE (e.g., `ADD_ARTICLES`, `SET_FILTER`)

## State Management Standards

### Adding New State
1. **Update Types**: Add property to `AppState` interface in `src/types/index.ts`
2. **Add Action Type**: Add to `AppAction` union type
3. **Implement Reducer**: Add case handler in `appReducer.ts`
4. **Update Initial State**: Ensure `initialState` includes new property

### Action Pattern
```typescript
// Action type definition
type AppAction = 
  | { type: 'MY_ACTION'; payload: MyPayloadType }
  // ... other actions

// Reducer handler
case 'MY_ACTION':
  return {
    ...state,
    // Update state immutably
    myProperty: action.payload
  };

// Dispatch in component
dispatch({ type: 'MY_ACTION', payload: myData });
```

### State Persistence
- State is automatically saved to localStorage via debounced mechanism in `AppContext`
- Save is triggered 500ms after last state change
- User-specific data is scoped by `userId`
- Use `LOAD_STATE` action to restore saved state on app load

## Component Standards

### Component Structure
```typescript
import { useApp } from '../context/AppContext';
import type { ComponentProps } from '../types';

interface MyComponentProps {
  // Define all props with types
  prop1: string;
  prop2?: number; // Optional props
}

export function MyComponent({ prop1, prop2 }: MyComponentProps) {
  const { state, dispatch } = useApp();
  
  // Hooks
  // State
  // Effects
  // Handlers
  
  return (
    // JSX with Tailwind classes
  );
}
```

### Component Guidelines
- **ALWAYS** extract reusable logic into custom hooks if used in multiple components
- **ALWAYS** use `useMemo` for expensive computations
- **ALWAYS** use `useCallback` for functions passed to child components
- **ALWAYS** handle edge cases (empty states, loading, errors)
- **NEVER** perform side effects in render (use useEffect)
- **NEVER** create components that are too large (split into smaller components)

## Service Layer Standards

### News Fetching
- **ALWAYS** use utilities from `src/utils/newsFetcher.ts`
- **ALWAYS** handle errors and dispatch `SET_ERROR` action
- **ALWAYS** dispatch `SET_FETCHING` to manage loading state
- **ALWAYS** dispatch `ADD_ARTICLES` to update article list
- **ALWAYS** respect source configuration (enabled/disabled)

### Authentication
- **ALWAYS** use utilities from `src/utils/auth.ts`
- **ALWAYS** check `state.authentication.isAuthenticated` before protected content
- **ALWAYS** use `LOGIN` and `LOGOUT` actions
- **ALWAYS** handle session restoration with `RESTORE_AUTH` action

### Storage
- **ALWAYS** use utilities from `src/utils/storage.ts`
- **ALWAYS** rely on automatic debounced save mechanism
- **ALWAYS** use `LOAD_STATE` action to restore state
- **NEVER** access localStorage directly

## UI/UX Standards

### Styling
- **ALWAYS** use Tailwind CSS utility classes
- **ALWAYS** use dark theme (stone-950 background)
- **ALWAYS** use consistent spacing (Tailwind spacing scale)
- **ALWAYS** use consistent color palette
- **ALWAYS** ensure responsive design (mobile-first approach)
- **NEVER** use inline styles
- **NEVER** create custom CSS files (use Tailwind)

### Icons
- **ALWAYS** use Lucide React icons
- **ALWAYS** import icons individually (tree-shaking)
- **ALWAYS** use appropriate icon sizes (16, 20, 24, etc.)

### Loading States
- **ALWAYS** show loading indicators during async operations
- **ALWAYS** use `LoadingSpinner` component for loading states
- **ALWAYS** dispatch `SET_FETCHING` action to track loading

### Error Handling
- **ALWAYS** display user-friendly error messages
- **ALWAYS** dispatch `SET_ERROR` action for errors
- **ALWAYS** provide error recovery options when possible
- **ALWAYS** clear errors when appropriate

### Empty States
- **ALWAYS** use `EmptyState` component for empty lists
- **ALWAYS** provide helpful messages and actions
- **ALWAYS** guide users on what to do next

## Data Management

### Article Management
- Articles are stored in `state.articles` array
- Use `ADD_ARTICLES` to add new articles (merges with existing)
- Use `UPDATE_ARTICLE` to modify article properties
- Use `DELETE_ARTICLE` to remove articles
- Use `CLEAR_ARTICLES` to remove all articles

### Source Management
- Sources are stored in `state.sources` array
- Use `ADD_SOURCE` to add new sources
- Use `UPDATE_SOURCE` to modify source properties
- Use `DELETE_SOURCE` to remove sources
- Sources can be enabled/disabled via `UPDATE_SOURCE`

### Filtering
- Filters are stored in `state.filters` object
- Use `SET_FILTER` action to update filters
- Filters include: searchQuery, sourceId, showOnlyFavorites, showOnlyUnread
- Filtering logic should be in `useMemo` for performance

## File Interaction Standards

### When Adding Features
1. **Types First**: Add interfaces to `src/types/index.ts`
2. **Reducer**: Add actions and handlers to `appReducer.ts`
3. **Components**: Create components in appropriate directories
4. **Utilities**: Add utility functions if needed
5. **Integration**: Wire up using `useApp()` hook

### When Modifying Features
1. **Check Patterns**: Review existing similar code
2. **Update Types**: Modify interfaces if data structure changes
3. **Update Reducer**: Modify action handlers if needed
4. **Update Components**: Modify UI components
5. **Test Persistence**: Verify state saves/loads correctly

### File Dependencies
- Components depend on: `context/AppContext`, `types/index.ts`
- Context depends on: `types/index.ts`, `utils/storage.ts`, `utils/auth.ts`
- Reducer depends on: `types/index.ts`
- Utilities are independent (no component dependencies)

## Development Workflow

### Before Making Changes
1. Understand the existing state structure
2. Identify which actions need to be added/modified
3. Plan component changes
4. Consider state persistence implications

### Making Changes
1. Update types first
2. Update reducer actions
3. Create/modify components
4. Test state changes
5. Verify persistence

### After Making Changes
1. Test all affected features
2. Verify state persistence
3. Check for TypeScript errors
4. Ensure no console errors
5. Test error handling

## Prohibited Actions

- **NEVER** mutate state directly (always use dispatch)
- **NEVER** bypass the reducer pattern
- **NEVER** use inline styles
- **NEVER** access localStorage directly
- **NEVER** create global state outside AppContext
- **NEVER** skip TypeScript types
- **NEVER** skip error handling
- **NEVER** skip loading states
- **NEVER** hardcode user data
- **NEVER** create components without prop interfaces

## AI Decision-Making Standards

### Priority Order
1. **Type Safety**: All code must be properly typed
2. **State Consistency**: Maintain reducer pattern
3. **User Experience**: Handle loading, errors, edge cases
4. **Code Reusability**: Extract common patterns
5. **Performance**: Optimize with useMemo/useCallback

### When Uncertain
1. Check existing patterns in codebase
2. Follow established conventions
3. Maintain consistency with existing code
4. When in doubt, ask for clarification

### Code Review Checklist
- [ ] All types defined and used correctly
- [ ] State changes through reducer only
- [ ] Components use `useApp()` correctly
- [ ] Error handling implemented
- [ ] Loading states handled
- [ ] Tailwind CSS used (no inline styles)
- [ ] Components in correct directories
- [ ] No direct localStorage access
- [ ] No state mutations outside reducer
- [ ] Proper cleanup in useEffect

