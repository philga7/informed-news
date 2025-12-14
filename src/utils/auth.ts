import type { StoredUser, SessionData, User } from '../types';

const USERS_STORAGE_KEY = 'news_users';
const SESSION_STORAGE_KEY = 'news_session';
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export async function generateSalt(): Promise<string> {
  try {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Error generating salt:', error);
    const fallbackArray = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      fallbackArray[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(fallbackArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Error hashing password with Web Crypto API, using fallback:', error);
    const combined = password + salt;
    return btoa(combined);
  }
}

export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}

export function getAllUsers(): StoredUser[] {
  try {
    const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
    if (!usersJson) return [];
    return JSON.parse(usersJson);
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

export function saveUsers(users: StoredUser[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Error saving users:', error);
    throw new Error('Failed to save user data');
  }
}

export function findUserByEmail(email: string): StoredUser | null {
  const users = getAllUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function registerUser(
  email: string,
  password: string,
  name: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  if (!validateEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.message };
  }

  const existingUser = findUserByEmail(email);
  if (existingUser) {
    return { success: false, error: 'Email already registered' };
  }

  try {
    const salt = await generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const storedUser: StoredUser = {
      id: userId,
      email: email.toLowerCase(),
      name,
      passwordHash,
      salt,
      passwordVersion: 1,
      createdAt: new Date().toISOString(),
    };

    const users = getAllUsers();
    users.push(storedUser);
    saveUsers(users);

    const user: User = {
      id: storedUser.id,
      email: storedUser.email,
      name: storedUser.name,
      createdAt: storedUser.createdAt,
    };

    return { success: true, user };
  } catch (error) {
    console.error('Error registering user:', error);
    return { success: false, error: 'Failed to create account' };
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; user?: User }> {
  const storedUser = findUserByEmail(email);
  if (!storedUser) {
    return { success: false, error: 'Invalid email or password' };
  }

  const isValid = await verifyPassword(password, storedUser.salt, storedUser.passwordHash);
  if (!isValid) {
    return { success: false, error: 'Invalid email or password' };
  }

  const user: User = {
    id: storedUser.id,
    email: storedUser.email,
    name: storedUser.name,
    createdAt: storedUser.createdAt,
  };

  return { success: true, user };
}

export function createSession(user: User): SessionData {
  const session: SessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    loginTime: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    isDemoMode: false,
  };

  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Error saving session:', error);
  }

  return session;
}

export function getSession(): SessionData | null {
  try {
    const sessionJson = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionJson) return null;

    const session: SessionData = JSON.parse(sessionJson);
    const lastActivity = new Date(session.lastActivity);
    const now = new Date();
    const timeDiff = now.getTime() - lastActivity.getTime();

    if (timeDiff > SESSION_TIMEOUT_MS) {
      clearSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error loading session:', error);
    return null;
  }
}

export function updateSessionActivity(): void {
  const session = getSession();
  if (session) {
    session.lastActivity = new Date().toISOString();
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

export function setupActivityTracking(): () => void {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  let timeout: NodeJS.Timeout;

  const handleActivity = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      updateSessionActivity();
    }, 1000);
  };

  events.forEach(event => {
    window.addEventListener(event, handleActivity);
  });

  return () => {
    clearTimeout(timeout);
    events.forEach(event => {
      window.removeEventListener(event, handleActivity);
    });
  };
}
