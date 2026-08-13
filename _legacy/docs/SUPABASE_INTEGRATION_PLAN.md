# Supabase Integration Plan (Clean Build)

**Date:** December 29, 2024  
**Approach:** Replace localStorage with Supabase (no migration needed)  
**Estimated Time:** 4-6 hours

---

## Overview

Rebuild authentication and data layer to use Supabase directly, removing localStorage entirely.

### Architecture Changes

**Before (localStorage):**
```
Components → AppContext → localStorage
```

**After (Supabase):**
```
Components → AppContext → Supabase Client → PostgreSQL + Auth
```

---

## Implementation Phases

### Phase 1: Supabase Auth (1.5 hours)
Replace localStorage authentication with Supabase Auth

**Files to Create:**
- `src/services/auth.service.ts` - Supabase Auth wrapper
- `src/hooks/useAuth.ts` - Auth hook for components

**Files to Modify:**
- `src/components/Auth/RegisterForm.tsx`
- `src/components/Auth/LoginForm.tsx`
- `src/context/AppContext.tsx`

**Files to Remove:**
- `src/utils/auth.ts` (localStorage auth - no longer needed)

---

### Phase 2: Data Services (2 hours)
Create service layer for database operations

**Files to Create:**
- `src/services/profiles.service.ts`
- `src/services/sources.service.ts`
- `src/services/articles.service.ts`
- `src/services/collections.service.ts`
- `src/services/topics.service.ts`

**Pattern:** All services use Supabase client, return typed data

---

### Phase 3: Update AppContext (1.5 hours)
Replace localStorage state management with Supabase queries

**Changes:**
- Remove `saveToStorage()` / `loadFromStorage()`
- Fetch data from Supabase on mount
- Update dispatch actions to save to database
- Handle loading/error states

---

### Phase 4: Update Components (1 hour)
Ensure all components work with new data flow

**Components to Update:**
- Source management
- Article display
- Topic management
- Collection management

---

### Phase 5: Testing & Cleanup (30 min)
- Remove localStorage utilities
- Test all features
- Clean up unused code

---

## Phase 1: Supabase Auth Implementation

### 1.1 Create Auth Service

**File:** `src/services/auth.service.ts`

```typescript
import { supabase } from '../utils/supabase';

export const authService = {
  // Sign up with email/password
  async signUp(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name } // Store name in user metadata
      }
    });
    
    if (error) throw error;
    
    // Create profile record
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: data.user.email!,
        name
      });
    }
    
    return data;
  },

  // Sign in with email/password
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current session
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  // Get current user
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  // Password reset
  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) throw error;
  },

  // Update password
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
  }
};
```

### 1.2 Create Auth Hook

**File:** `src/hooks/useAuth.ts`

```typescript
import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, session, loading };
}
```

### 1.3 Update RegisterForm

**File:** `src/components/Auth/RegisterForm.tsx`

```typescript
// Replace registerUser() with:
import { authService } from '../../services/auth.service';

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    await authService.signUp(email, password, name);
    // Success! User is auto-logged in by Supabase
  } catch (err) {
    setError(err.message || 'Failed to create account');
  } finally {
    setLoading(false);
  }
}
```

### 1.4 Update LoginForm

**File:** `src/components/Auth/LoginForm.tsx`

```typescript
// Replace loginUser() with:
import { authService } from '../../services/auth.service';

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    await authService.signIn(email, password);
    // Success! Session is automatically managed
  } catch (err) {
    setError(err.message || 'Invalid credentials');
  } finally {
    setLoading(false);
  }
}
```

### 1.5 Update AppContext

**File:** `src/context/AppContext.tsx`

```typescript
import { useAuth } from '../hooks/useAuth';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load user data from Supabase when authenticated
  useEffect(() => {
    if (user) {
      loadUserDataFromSupabase(user.id);
    }
  }, [user]);

  async function loadUserDataFromSupabase(userId: string) {
    // Fetch all user data from Supabase
    const [sources, articles, collections, topics] = await Promise.all([
      sourcesService.getAll(userId),
      articlesService.getAll(userId),
      collectionsService.getAll(userId),
      topicsService.getAll(userId)
    ]);

    // Load into state
    dispatch({ type: 'LOAD_USER_DATA', payload: {
      sources, articles, collections, topics
    }});
  }
}
```

---

## Phase 2: Data Services

### Service Pattern

All services follow this pattern:

```typescript
import { supabase } from '../utils/supabase';

export const serviceName = {
  // Get all records for user
  async getAll(userId: string) {
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data;
  },

  // Get single record
  async getById(id: string) {
    const { data, error } = await supabase
      .from('table_name')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Create record
  async create(record: InsertType) {
    const { data, error } = await supabase
      .from('table_name')
      .insert(record)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update record
  async update(id: string, updates: Partial<RecordType>) {
    const { data, error } = await supabase
      .from('table_name')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Delete record
  async delete(id: string) {
    const { error } = await supabase
      .from('table_name')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
```

### 2.1 Sources Service

**File:** `src/services/sources.service.ts`

```typescript
export const sourcesService = {
  async getAll(userId: string) { ... },
  async create(source: Omit<NewsSource, 'id' | 'createdAt'>) { ... },
  async update(id: string, updates: Partial<NewsSource>) { ... },
  async delete(id: string) { ... },
  async toggleEnabled(id: string, enabled: boolean) { ... }
};
```

### 2.2 Articles Service

**File:** `src/services/articles.service.ts`

```typescript
export const articlesService = {
  async getAll(userId: string) { ... },
  async getRecent(userId: string, limit?: number) { ... },
  async getBySource(sourceId: string) { ... },
  async search(userId: string, query: string) { ... },
  async markRead(id: string, isRead: boolean) { ... },
  async toggleFavorite(id: string, isFavorite: boolean) { ... },
  async bulkInsert(articles: NewsArticle[]) { ... }
};
```

### 2.3 Topics Service

**File:** `src/services/topics.service.ts`

```typescript
export const topicsService = {
  async getAll(userId: string) { ... },
  async getWithArticles(topicId: string) { ... },
  async create(topic: Topic, articleIds: string[]) { ... },
  async addArticles(topicId: string, articleIds: string[]) { ... },
  async removeArticle(topicId: string, articleId: string) { ... },
  async archive(topicId: string) { ... }
};
```

---

## Phase 3: Update AppContext

### Remove localStorage Code

**Delete:**
```typescript
// Remove these imports
import { saveToStorage, loadFromStorage } from '../utils/storage';

// Remove debounced save
const debouncedSave = useCallback(() => { ... }, [state]);

// Remove save effect
useEffect(() => {
  debouncedSave();
}, [state, debouncedSave]);
```

### Add Supabase Data Loading

**Add:**
```typescript
const [dataLoading, setDataLoading] = useState(true);

useEffect(() => {
  if (user) {
    loadUserData();
  }
}, [user]);

async function loadUserData() {
  setDataLoading(true);
  try {
    const data = await fetchAllUserData(user.id);
    dispatch({ type: 'LOAD_ALL_DATA', payload: data });
  } catch (error) {
    dispatch({ type: 'SET_ERROR', payload: 'Failed to load data' });
  } finally {
    setDataLoading(false);
  }
}
```

### Update Dispatch Actions

**Pattern: Save to database, then update state**

```typescript
// Example: Add article
async function addArticle(article: NewsArticle) {
  try {
    const saved = await articlesService.create(article);
    dispatch({ type: 'ADD_ARTICLE', payload: saved });
  } catch (error) {
    dispatch({ type: 'SET_ERROR', payload: 'Failed to save article' });
  }
}
```

---

## Phase 4: Component Updates

Most components just need dispatch calls wrapped in async functions:

### Before (localStorage):
```typescript
dispatch({ type: 'ADD_SOURCE', payload: newSource });
```

### After (Supabase):
```typescript
async function handleAddSource() {
  setLoading(true);
  try {
    const saved = await sourcesService.create(newSource);
    dispatch({ type: 'ADD_SOURCE', payload: saved });
  } catch (error) {
    setError('Failed to add source');
  } finally {
    setLoading(false);
  }
}
```

---

## Phase 5: Cleanup

### Files to Remove
```
src/utils/auth.ts (localStorage auth)
src/utils/storage.ts (localStorage persistence)
```

### Environment Variables
Already configured:
- ✅ `.env.local` - Frontend Supabase config
- ✅ `backend/.env` - Backend Supabase config

---

## Implementation Order

### Day 1: Authentication (1.5 hours)
1. Create `auth.service.ts`
2. Create `useAuth.ts` hook
3. Update RegisterForm
4. Update LoginForm
5. Update AppContext auth handling
6. **Test:** Signup, login, logout

### Day 2: Data Services (2 hours)
1. Create all service files
2. Implement CRUD operations
3. Add TypeScript types
4. **Test:** Each service individually

### Day 3: Integration (2 hours)
1. Update AppContext data loading
2. Update all component dispatch calls
3. Remove localStorage code
4. **Test:** All features end-to-end

### Day 4: Polish & Deploy (1 hour)
1. Error handling
2. Loading states
3. User feedback
4. Final testing

---

## Testing Checklist

### Authentication
- [ ] User can sign up
- [ ] User receives confirmation email (if enabled)
- [ ] User can sign in
- [ ] Session persists on refresh
- [ ] User can sign out
- [ ] Password reset works

### Data Operations
- [ ] Sources: Create, read, update, delete
- [ ] Articles: Fetch, mark read, favorite
- [ ] Collections: Create, configure, delete
- [ ] Topics: Create, add articles, archive

### Multi-Device
- [ ] Login on device A
- [ ] Login on device B
- [ ] Changes sync across devices
- [ ] Logout on one device works

---

## Benefits of Clean Build

### vs Migration Approach:
- ✅ **Simpler:** No migration utilities needed
- ✅ **Faster:** 4-6 hours vs 8-10 hours with migration
- ✅ **Cleaner:** No temporary dual-mode code
- ✅ **Better:** Designed for Supabase from start
- ✅ **Maintainable:** No legacy localStorage code

### New Features Enabled:
- ✅ Multi-device sync
- ✅ Real-time updates (future)
- ✅ Proper user management
- ✅ Password reset
- ✅ Email confirmation
- ✅ Social auth (future)

---

## Next Steps

**Recommended Approach:**

1. **Start fresh** - Clear localStorage for testing
2. **Phase 1** - Implement Supabase Auth first
3. **Test auth** - Ensure signup/login works
4. **Phase 2** - Create data services
5. **Test services** - Verify CRUD operations
6. **Phase 3** - Update AppContext
7. **Test integration** - Full app functionality
8. **Phase 4** - Update components
9. **Final testing** - Everything works

**Ready to start with Phase 1: Supabase Auth?**

