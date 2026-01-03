import { supabase } from '../utils/supabase';

/**
 * Authentication Service
 * 
 * Wraps Supabase Auth functionality for the application.
 * Handles user registration, login, logout, and session management.
 */

export interface SignUpData {
  email: string;
  password: string;
  name: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export const authService = {
  /**
   * Sign up a new user with email and password
   * Creates both auth.users record and profiles record
   */
  async signUp({ email, password, name }: SignUpData) {
    // 1. Create auth user
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name, // Store name in user metadata
        },
      },
    });

    if (error) throw error;

    // 2. Create profile record (extends auth.users)
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email: data.user.email!,
        name,
      });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Don't throw - user is created, profile can be fixed later
      }
    }

    return data;
  },

  /**
   * Sign in with email and password
   */
  async signIn({ email, password }: SignInData) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Sign out current user
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Get current session
   */
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  /**
   * Get current user
   */
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  /**
   * Send password reset email
   */
  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  },

  /**
   * Update user password
   */
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  },

  /**
   * Update user profile information
   */
  async updateProfile(updates: { name?: string; email?: string }) {
    // Update auth.users metadata
    const { data: authData, error: authError } = await supabase.auth.updateUser({
      email: updates.email,
      data: { name: updates.name },
    });
    if (authError) throw authError;

    // Also update profiles table
    if (authData.user && updates.name) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ name: updates.name })
        .eq('id', authData.user.id);
      
      if (profileError) {
        console.error('Error updating profile table:', profileError);
        // Don't throw - auth update succeeded, profile can be fixed later
      }
    }

    return authData;
  },

  /**
   * Refresh the current session
   */
  async refreshSession() {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    return data.session;
  },
};

